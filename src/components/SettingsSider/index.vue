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
        :class="panelClassName"
        :style="panelStyle"
      >
        <SettingsContent
          v-model:active-key="activeKeyModel"
          :show-grab="drawerPlacement === 'bottom'"
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
  blockPullToRefresh,
  unblockPullToRefresh,
  type PullToRefreshBlockToken,
} from '../../lib/dom/pullToRefreshBlock';
import { clampNumber } from '../../lib/utils/number';
import { loadNumber, saveNumber } from '../../lib/utils/storage';

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
    activeKey: () => ['display'],
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
}

onMounted(() => {
  updateIsMobile();
  window.addEventListener('resize', updateIsMobile, { passive: true });
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateIsMobile);
  onResizeEnd();
  clearCloseGuards();
});

const drawerPlacement = computed<'right' | 'bottom'>(
  () => placementLock.value ?? (isMobile.value ? 'bottom' : 'right'),
);

const drawerWidth = 'min(360px, calc(100vw - 24px))';

const mobileHeight = ref<number>(
  loadNumber(
    'settingsDrawer.mobileHeight',
    Math.min(560, Math.floor(window.innerHeight * 0.75)),
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

let resizing = false;
let startY = 0;
let startH = 0;
let activePointerId: number | null = null;
let mobileHeightDirty = false;
let ptrBlockToken: PullToRefreshBlockToken | null = null;

function startBlockPullToRefresh(): void {
  // Ref-counted global blocker shared by all panels.
  if (!ptrBlockToken) ptrBlockToken = blockPullToRefresh();
}

function stopBlockPullToRefresh(): void {
  if (ptrBlockToken) {
    unblockPullToRefresh(ptrBlockToken);
    ptrBlockToken = null;
  }
}

function onResizeStart(e: PointerEvent): void {
  if (drawerPlacement.value !== 'bottom') return;

  // Prevent browser default panning / pull-to-refresh gesture from starting.
  try {
    e.preventDefault();
    e.stopPropagation();
  }
  catch {
    // ignore
  }

  resizing = true;
  activePointerId = e.pointerId;
  startY = e.clientY;
  startH = mobileHeight.value;

  try {
    (e.currentTarget as HTMLElement | null)?.setPointerCapture?.(e.pointerId);
  }
  catch {
    // Ignore
  }

  startBlockPullToRefresh();

  window.addEventListener('pointermove', onResizing, { passive: false });
  window.addEventListener('pointerup', onResizeEnd, { passive: true });
  window.addEventListener('pointercancel', onResizeEnd, { passive: true });
  window.addEventListener('lostpointercapture', onResizeEnd as any, {
    passive: true,
  });
}

function onResizing(e: PointerEvent): void {
  if (!resizing) return;
  if (activePointerId != null && e.pointerId !== activePointerId) return;

  const dy = startY - e.clientY;
  const maxH = Math.floor(window.innerHeight * 0.92);
  mobileHeight.value = clampNumber(startH + dy, 260, maxH);
  mobileHeightDirty = true;
  e.preventDefault();
}

function onResizeEnd(): void {
  if (!resizing) return;
  resizing = false;

  // Persist once on release to avoid synchronous storage writes on every move.
  if (mobileHeightDirty) {
    saveNumber('settingsDrawer.mobileHeight', mobileHeight.value);
    mobileHeightDirty = false;
  }
  stopBlockPullToRefresh();
  window.removeEventListener('pointermove', onResizing);
  window.removeEventListener('pointerup', onResizeEnd);
  window.removeEventListener('pointercancel', onResizeEnd);
  window.removeEventListener('lostpointercapture', onResizeEnd as any);
  activePointerId = null;
}

const contentWrapperStyle = computed(() => {
  if (drawerPlacement.value === 'right') {
    return {
      top: '0',
      bottom: '0',
      height: '100%',
      right: '0',
      left: 'auto',
      borderRadius: '0',
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
    width: drawerWidth,
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
  return {
    position: 'fixed',
    zIndex: 1000,
    left: 0,
    right: 0,
    top: `${top}px`,
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
  return drawerPlacement.value === 'bottom'
    ? 'settings-drawer settings-sheet settings-drawer--bottom'
    : 'settings-drawer settings-sider-fixed';
});

const panelTransitionName = computed(() => {
  return drawerPlacement.value === 'bottom'
    ? 'settings-sheet-slide'
    : 'settings-sider-slide';
});
</script>

<style src="./index.css"></style>
