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
        <div
          v-if="drawerPlacement === 'right'"
          class="settings-resizer"
          role="separator"
          aria-label="resize"
          @pointerdown.prevent="onDesktopResizeStart"
        />
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
// Selected layer ids for batch apply in panels.
// 面板批量应用的选中图层 id 列表。
const selectedLayerIds = ref<string[]>([]);
const SELECTED_LAYER_IDS_KEY = 'atomsViewer.layers.selectedIds.v1';
let ignoreSelectedLayerPersist = false;

// Read selected layer ids from storage.
// 从本地存储读取选中图层 id。
function readSelectedLayerIds(): string[] {
  try {
    const raw = localStorage.getItem(SELECTED_LAYER_IDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(v => String(v)).filter(v => v.length > 0);
  }
  catch {
    return [];
  }
}

// Persist selected layer ids to storage.
// 将选中图层 id 持久化到本地存储。
function writeSelectedLayerIds(ids: string[]): void {
  try {
    localStorage.setItem(SELECTED_LAYER_IDS_KEY, JSON.stringify(ids));
  }
  catch {
    // ignore
  }
}

watch(
  () => props.settings,
  (v) => {
    settingsShadow.syncFrom(v);
  },
  { immediate: true, deep: true, flush: 'sync' },
);

watch(
  selectedLayerIds,
  (next) => {
    if (ignoreSelectedLayerPersist) return;
    writeSelectedLayerIds(next);
  },
  { deep: true },
);

// Apply selection to layer visibility.
// 用选中状态控制图层显示。
function applySelectionVisibility(): void {
  const api = viewerApiRef.value;
  if (!api) return;
  const selected = new Set(selectedLayerIds.value);
  const layers = api.layers.value ?? [];
  if (layers.length > 0) {
    const idSet = new Set(layers.map(l => l.id));
    const hasOverlap = Array.from(selected).some(id => idSet.has(id));
    if (!hasOverlap) {
      const fallback = layers[0]?.id;
      if (fallback) {
        selectedLayerIds.value = [fallback];
        selected.clear();
        selected.add(fallback);
      }
    }
  }
  for (const layer of layers) {
    const shouldShow = selected.has(layer.id);
    if (layer.visible !== shouldShow) {
      api.setLayerVisible?.(layer.id, shouldShow);
    }
  }
}

watch(
  () => [selectedLayerIds.value, viewerApiRef.value?.layers.value],
  () => {
    applySelectionVisibility();
  },
  { deep: true },
);

// Sync selected layer ids from session restore.
// 会话恢复时同步选中图层 id。
function onSelectedLayersRestore(e: Event): void {
  const detail = (e as CustomEvent<{ ids?: string[] }>).detail;
  const ids = Array.isArray(detail?.ids) ? detail!.ids!.map(v => String(v)) : [];
  ignoreSelectedLayerPersist = true;
  selectedLayerIds.value = ids;
  ignoreSelectedLayerPersist = false;
}

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
  selectedLayerIds,
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
  selectedLayerIds.value = readSelectedLayerIds();
  window.addEventListener('atoms-viewer:selected-layers', onSelectedLayersRestore);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateIsMobile);
  window.removeEventListener('atoms-viewer:selected-layers', onSelectedLayersRestore);
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
  },
  onMove: (e) => {
    try {
      e.preventDefault();
      e.stopPropagation();
    }
    catch {
      // ignore
    }

    const dy = startY - e.clientY;
    const maxH = Math.floor(window.innerHeight * 0.8);
    mobileHeight.value = clampNumber(startH + dy, 260, maxH);
    mobileHeightDirty = true;
  },
  onEnd: () => {
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
    try {
      e.preventDefault();
      e.stopPropagation();
    }
    catch {
      // ignore
    }

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
}

function onClearStorage(): void {
  try {
    localStorage.removeItem('settingsDrawer.desktopWidth');
    localStorage.removeItem('settingsDrawer.mobileHeight');
    localStorage.removeItem(SELECTED_LAYER_IDS_KEY);
  }
  catch {
    // ignore
  }

  desktopWidth.value = getDefaultDesktopWidth();
  mobileHeight.value = getDefaultMobileHeight();
  selectedLayerIds.value = [];
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
