<template>
  <!--
    Teleported settings panel: reuse one panel for desktop + mobile so the
    layout change is smooth when the breakpoint flips.
  -->
  <Teleport to="body">
    <Transition name="settings-mask-fade">
      <div
        v-show="drawerPlacement === 'bottom' && openModel"
        class="settings-sheet-mask"
        aria-hidden="true"
      />
    </Transition>

    <Transition
      :name="panelTransitionName"
      @after-enter="onPanelAfterEnter"
      @after-leave="onPanelAfterLeave"
    >
      <div
        v-show="openModel"
        ref="panelElRef"
        :class="panelClassName"
        :style="panelStyle"
      >
        <!-- 移动端顶部热区：优先捕获下拉手势，避免误触浏览器下拉刷新。 -->
        <!-- Mobile top hotzone: capture resize pull first to avoid accidental browser pull-to-refresh. -->
        <div
          v-if="drawerPlacement === 'bottom'"
          class="settings-sheet-resizer"
          role="separator"
          @pointerdown.prevent="onResizeStart"
        />
        <div
          v-if="drawerPlacement === 'right'"
          class="settings-resizer"
          role="separator"
          @pointerdown.prevent="onDesktopResizeStart"
        />
        <!-- 移动端拖拽过程中显示轻量壳层，但不卸载真实内容，避免状态/滚动位置丢失。 -->
        <!-- Show a lightweight shell while resizing on mobile, but keep real content mounted to preserve state/scroll. -->
        <div v-if="drawerPlacement === 'bottom' && isMobileResizing" class="settings-sheet-drag-shell">
          <div class="settings-sheet-drag-shell__grab">
            <div class="settings-grab-bar" />
          </div>
        </div>
        <SettingsContent
          v-model:active-key="activeKeyModel"
          :show-grab="drawerPlacement === 'bottom'"
          :class="{
            'settings-content--suspended': drawerPlacement === 'bottom' && isMobileResizing,
          }"
          @close="onCloseClick"
          @resize-start="onResizeStart"
        />
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue';
import type { ViewerSettings } from '../../lib/viewer/settings';
import {
  createPointerDragWithPullToRefreshBlock,
} from '../../lib/dom/pullToRefreshBlock';
import { clampNumber } from '../../lib/utils/number';
import { loadNumber, saveNumber } from '../../lib/utils/storage';
import { PANEL_KEYS } from '../../lib/viewer/panelKeys';

import SettingsContent from './SettingsContent.vue';
import {
  settingsSiderContextKey,
  settingsSiderControlContextKey,
  type PatchSettingsFn,
} from './context';
import { createSettingsShadow } from '../../lib/viewer/mergeSettings';
import { viewerApiRef } from '../../lib/viewer/bridge';

const props = withDefaults(
  defineProps<{
    open: boolean;
    settings: ViewerSettings;
    activeKey?: string[];
  }>(),
  {
    activeKey: () => [PANEL_KEYS.view],
  },
);

const emit = defineEmits<{
  (e: 'update:open', v: boolean): void;
  (e: 'update:settings', v: ViewerSettings): void;
  (e: 'update:activeKey', v: string[]): void;
}>();

/**
 * Patch settings back to parent.
 * Panels call this via provide/inject.
 * Use a shadow snapshot to avoid lost updates when multiple patches land in one tick.
 */
const settingsShadow = createSettingsShadow(props.settings);

watch(
  () => props.settings,
  (v) => {
    settingsShadow.syncFrom(v);
  },
  { immediate: true, deep: true, flush: 'sync' },
);

const patchSettings: PatchSettingsFn = (patch) => {
  const merged = settingsShadow.patch(patch);
  emit('update:settings', merged);
};

function replaceSettings(next: ViewerSettings): void {
  emit('update:settings', settingsShadow.replace(next));
}

provide(settingsSiderContextKey, {
  settings: computed(() => props.settings),
  patchSettings,
  // Shared layer existence flag for all panels (avoid repeated watchers).
  // 全局共享“是否有图层”状态，避免面板内重复计算。
  hasAnyLayer: computed(() => (viewerApiRef.value?.layers.value.length ?? 0) > 0),
});

provide(settingsSiderControlContextKey, {
  replaceSettings,
  notifyClearStorageUi: onClearStorage,
});

/**
 * Drawer open v-model
 */
const openModel = computed({
  get: () => props.open,
  set: (v: boolean) => emit('update:open', v),
});

/**
 * Collapse activeKey v-model
 */
const activeKeyModel = computed<string[]>({
  get: () => props.activeKey ?? [],
  set: (v: unknown) => {
    const next = Array.isArray(v)
      ? v.map(x => String(x))
      : v != null && String(v) !== ''
        ? [String(v)]
        : [];
    emit('update:activeKey', next);
  },
});

/** -----------------------------
 * Responsive drawer placement
 * mobile: bottom-sheet
 * desktop: right drawer
 * ----------------------------- */
const isMobile = ref(false);
const placementLock = ref<'right' | 'bottom' | null>(null);
const freezeTopPx = ref<number | null>(null);
let releaseLockTimer: number | null = null;

function clearCloseGuards(): void {
  freezeTopPx.value = null;
  placementLock.value = null;
  if (releaseLockTimer != null) {
    window.clearTimeout(releaseLockTimer);
    releaseLockTimer = null;
  }
}

function getViewportHeight(): number {
  return Math.round((window.visualViewport?.height ?? window.innerHeight) || 0);
}

function updateIsMobile(): void {
  isMobile.value = window.matchMedia('(max-width: 768px)').matches;
  if (!isMobile.value) {
    desktopWidth.value = clampDesktopWidth(desktopWidth.value);
  }
}

onMounted(() => {
  updateIsMobile();
  window.addEventListener('resize', updateIsMobile, { passive: true });
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateIsMobile);
  onResizeEnd();
  onDesktopResizeEnd();
  clearCloseGuards();
});

const drawerPlacement = computed<'right' | 'bottom'>(
  () => placementLock.value ?? (isMobile.value ? 'bottom' : 'right'),
);

function clampDesktopWidth(next: number): number {
  const minW = 300;
  const maxW = Math.floor(window.innerWidth * 0.7);
  return clampNumber(next, minW, Math.max(minW, maxW));
}

function getDefaultDesktopWidth(): number {
  return 360;
}

function getDefaultMobileHeight(): number {
  return Math.min(560, Math.floor(window.innerHeight * 0.75));
}

const desktopWidth = ref(loadNumber('settingsDrawer.desktopWidth', getDefaultDesktopWidth()));

const drawerWidth = computed(() => `${desktopWidth.value}px`);

const mobileHeight = ref<number>(
  loadNumber(
    'settingsDrawer.mobileHeight',
    getDefaultMobileHeight(),
  ),
);

function freezeBottomSheetTop(): void {
  const vh = getViewportHeight();
  freezeTopPx.value = Math.max(0, vh - mobileHeight.value);
}

watch(
  () => props.open,
  (v, prev) => {
    if (v) {
      placementLock.value = null;
      freezeTopPx.value = null;
      if (releaseLockTimer != null) {
        window.clearTimeout(releaseLockTimer);
        releaseLockTimer = null;
      }
      return;
    }

    if (prev && !v) {
      placementLock.value
        = placementLock.value ?? (isMobile.value ? 'bottom' : 'right');
      if (placementLock.value === 'bottom' && freezeTopPx.value == null) {
        freezeBottomSheetTop();
        if (releaseLockTimer != null) window.clearTimeout(releaseLockTimer);
        releaseLockTimer = window.setTimeout(() => {
          clearCloseGuards();
        }, 500);
      }
    }
  },
  { immediate: true },
);

function onCloseClick(): void {
  if (drawerPlacement.value === 'bottom') {
    placementLock.value = 'bottom';
    freezeBottomSheetTop();
    if (releaseLockTimer != null) window.clearTimeout(releaseLockTimer);
    releaseLockTimer = window.setTimeout(() => {
      clearCloseGuards();
    }, 500);
  }
  else {
    placementLock.value = 'right';
    if (releaseLockTimer != null) window.clearTimeout(releaseLockTimer);
    releaseLockTimer = window.setTimeout(() => {
      clearCloseGuards();
    }, 500);
  }

  openModel.value = false;
}

function onAfterOpenChange(open: boolean): void {
  if (!open) clearCloseGuards();
  else freezeTopPx.value = null;
}

/**
 * Panel transition hooks.
 * Keep close-guards cleanup aligned with the visual end of the slide animation.
 */
function onPanelAfterEnter(): void {
  onAfterOpenChange(true);
}

function onPanelAfterLeave(): void {
  onAfterOpenChange(false);
}

let startY = 0;
let startH = 0;
let mobileHeightDirty = false;
// 移动端是否正在拖拽调高，拖拽中关闭过渡动画避免“卡顿感”。
// Whether mobile height resize is active; disable transitions while dragging to avoid jank.
const isMobileResizing = ref(false);
// 面板根节点：拖拽时直接写入内联高度，绕过频繁响应式重算。
// Panel root element: write inline height during drag to bypass frequent reactive recalculation.
const panelElRef = ref<HTMLElement | null>(null);
// 拖拽预览高度（仅用于拖拽过程中的临时渲染）。
// Preview height used only during drag rendering.
let mobilePreviewHeight: number | null = null;
let mobileResizeRafId: number | null = null;

function flushMobilePreviewHeight(): void {
  if (!panelElRef.value || mobilePreviewHeight == null) return;
  panelElRef.value.style.height = `${mobilePreviewHeight}px`;
}

function scheduleMobilePreviewHeight(): void {
  if (mobileResizeRafId != null) return;
  mobileResizeRafId = window.requestAnimationFrame(() => {
    mobileResizeRafId = null;
    flushMobilePreviewHeight();
  });
}
let desktopStartX = 0;
let desktopStartW = 0;
const mobileResizeDrag = createPointerDragWithPullToRefreshBlock({
  shouldBlockPullToRefresh: () => drawerPlacement.value === 'bottom',
  onStart: (e) => {
    // Prevent browser default panning / pull-to-refresh gesture from starting.
    try {
      e.preventDefault();
      e.stopPropagation();
    }
    catch {
      // ignore
    }

    startY = e.clientY;
    startH = mobileHeight.value;
    mobilePreviewHeight = startH;
    flushMobilePreviewHeight();
    isMobileResizing.value = true;
  },
  onMove: (e) => {
    // Keep pointermove passive to avoid browser warnings.
    // 保持 pointermove 被动监听，避免浏览器警告。
    const dy = startY - e.clientY;
    const maxH = Math.floor(window.innerHeight * 0.8);
    mobilePreviewHeight = clampNumber(startH + dy, 260, maxH);
    scheduleMobilePreviewHeight();
    mobileHeightDirty = true;
  },
  onEnd: () => {
    isMobileResizing.value = false;
    if (mobileResizeRafId != null) {
      window.cancelAnimationFrame(mobileResizeRafId);
      mobileResizeRafId = null;
    }
    if (mobilePreviewHeight != null) {
      mobileHeight.value = mobilePreviewHeight;
      mobilePreviewHeight = null;
    }
    if (panelElRef.value) panelElRef.value.style.height = '';
    // Persist once on release to avoid synchronous storage writes on every move.
    if (mobileHeightDirty) {
      saveNumber('settingsDrawer.mobileHeight', mobileHeight.value);
      mobileHeightDirty = false;
    }
  },
});

const desktopResizeDrag = createPointerDragWithPullToRefreshBlock({
  onStart: (e) => {
    try {
      e.preventDefault();
      e.stopPropagation();
    }
    catch {
      // ignore
    }

    desktopStartX = e.clientX;
    desktopStartW = desktopWidth.value;
  },
  onMove: (e) => {
    // Keep pointermove passive to avoid browser warnings.
    // 保持 pointermove 被动监听，避免浏览器警告。
    const dx = desktopStartX - e.clientX;
    desktopWidth.value = clampDesktopWidth(desktopStartW + dx);
    saveNumber('settingsDrawer.desktopWidth', desktopWidth.value);
  },
});

function onResizeStart(e: PointerEvent): void {
  if (drawerPlacement.value !== 'bottom') return;
  mobileResizeDrag.start(e);
}

function onResizeEnd(): void {
  mobileResizeDrag.stop();
  isMobileResizing.value = false;
  if (mobileResizeRafId != null) {
    window.cancelAnimationFrame(mobileResizeRafId);
    mobileResizeRafId = null;
  }
  mobilePreviewHeight = null;
  if (panelElRef.value) panelElRef.value.style.height = '';
}

function onClearStorage(): void {
  try {
    localStorage.removeItem('settingsDrawer.desktopWidth');
    localStorage.removeItem('settingsDrawer.mobileHeight');
  }
  catch {
    // ignore
  }

  desktopWidth.value = getDefaultDesktopWidth();
  mobileHeight.value = getDefaultMobileHeight();
}

function onDesktopResizeStart(e: PointerEvent): void {
  if (drawerPlacement.value !== 'right') return;
  desktopResizeDrag.start(e);
}

function onDesktopResizeEnd(): void {
  desktopResizeDrag.stop();
}

const contentWrapperStyle = computed(() => {
  if (drawerPlacement.value === 'right') {
    return {
      top: '0',
      bottom: '0',
      height: '100%',
      right: '0',
      left: 'auto',
      borderRadius: '14px 0 0 14px',
      overflow: 'hidden',
      boxShadow: '0 12px 34px rgba(0,0,0,0.16)',
    } as Record<string, any>;
  }

  const base = {
    borderRadius: '14px 14px 0 0',
    overflow: 'hidden',
    boxShadow: '0 -12px 34px rgba(0,0,0,0.14)',
  } as Record<string, any>;

  if (freezeTopPx.value != null) {
    return { ...base, top: `${freezeTopPx.value}px`, bottom: 'auto' } as Record<
      string,
      any
    >;
  }
  return base;
});

/**
 * Desktop panel root style.
 * Teleport + fixed-position keeps the viewer layout stable (no body scroll-lock).
 */
const desktopPanelStyle = computed(() => {
  return {
    position: 'fixed',
    zIndex: 1000,
    width: drawerWidth.value,
    ...contentWrapperStyle.value,
  } as Record<string, any>;
});

/**
 * Mobile bottom sheet root style.
 * Use fixed-position Teleport panel (no Ant Drawer) so blur/translucency always works.
 */
const mobileSheetStyle = computed(() => {
  const vh = getViewportHeight();
  const top = freezeTopPx.value != null
    ? freezeTopPx.value
    : Math.max(0, vh - mobileHeight.value);
  // 拖拽过程中尽量只改 height（固定 bottom），减少复杂内容导致的重排卡顿。
  // During drag, prefer changing height only (keep bottom fixed) to reduce reflow jank with heavy content.
  const isResizing = isMobileResizing.value;
  return {
    position: 'fixed',
    zIndex: 1000,
    left: 0,
    right: 0,
    ...(freezeTopPx.value != null && !isResizing
      ? { top: `${top}px`, bottom: 'auto' }
      : { top: 'auto', bottom: 0 }),
    height: `${mobileHeight.value}px`,
    borderRadius: '14px 14px 0 0',
    overflow: 'hidden',
    boxShadow: '0 -12px 34px rgba(0,0,0,0.14)',
  } as Record<string, any>;
});

const panelStyle = computed(() => {
  return drawerPlacement.value === 'bottom'
    ? mobileSheetStyle.value
    : desktopPanelStyle.value;
});

const panelClassName = computed(() => {
  const resizingClass = isMobileResizing.value ? 'settings-sheet-resizing' : '';
  return drawerPlacement.value === 'bottom'
    ? `settings-drawer settings-sheet ${resizingClass}`.trim()
    : 'settings-drawer settings-sider-fixed';
});

const panelTransitionName = computed(() => {
  return drawerPlacement.value === 'bottom'
    ? 'settings-sheet-slide'
    : 'settings-sider-slide';
});
</script>

<style src="./index.css"></style>
