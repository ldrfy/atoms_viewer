<template>
  <!--
    Desktop: avoid Ant Drawer body scroll-lock side effects (layout “bounce”)
    by using a lightweight fixed panel rendered via Teleport.
  -->
  <Teleport to="body">
    <Transition
      name="settings-sider-slide"
      @after-enter="onDesktopAfterEnter"
      @after-leave="onDesktopAfterLeave"
    >
      <div
        v-show="drawerPlacement === 'right' && openModel"
        class="settings-drawer settings-sider-fixed"
        :style="desktopPanelStyle"
      >
        <div class="settings-header">
          <div class="settings-header-row">
            <div class="settings-title">
              {{ t('settings.title') }}
            </div>

            <a-button
              type="text"
              size="small"
              aria-label="close"
              title="Close"
              @click="onCloseClick"
            >
              ✕
            </a-button>
          </div>
        </div>

        <div class="settings-body">
          <a-collapse
            v-model:active-key="activeKeyModel"
            ghost
            class="settings-collapse"
          >
            <a-collapse-panel
              key="files"
              :header="t('settings.panel.files.header')"
            >
              <FilesPanel />
            </a-collapse-panel>

            <a-collapse-panel
              key="layers"
              :header="t('settings.panel.layers.header')"
            >
              <LayersPanel />
            </a-collapse-panel>

            <a-collapse-panel
              key="display"
              :header="t('settings.panel.display.header')"
            >
              <DisplayPanel />
            </a-collapse-panel>

            <a-collapse-panel
              key="lammps"
              :header="t('settings.panel.lammps.header')"
            >
              <LammpsPanel />
            </a-collapse-panel>

            <a-collapse-panel
              key="colors"
              :header="t('settings.panel.colors.header')"
            >
              <ColorsPanel />
            </a-collapse-panel>

            <a-collapse-panel
              key="other"
              :header="t('settings.panel.other.header')"
            >
              <OtherPanel />
            </a-collapse-panel>
          </a-collapse>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- Mobile bottom-sheet: keep using Ant Drawer (in-place) for touch behavior. -->
  <a-drawer
    v-if="drawerPlacement === 'bottom'"
    v-model:open="openModel"
    :class="['settings-drawer', 'settings-drawer--bottom']"
    placement="bottom"
    :mask="true"
    :mask-closable="true"
    :destroy-on-close="false"
    :closable="false"
    :mask-style="undefined"
    :height="mobileHeight"
    :get-container="false"
    :content-wrapper-style="contentWrapperStyle"
    :body-style="drawerBodyStyle"
    @after-open-change="onAfterOpenChange"
    @close="onCloseClick"
  >
    <div class="settings-header">
      <div
        class="settings-grab"
        aria-label="resize"
        title="Resize"
        role="button"
        tabindex="0"
        @pointerdown.prevent="onResizeStart"
      >
        <div class="settings-grab-bar" />
      </div>

      <div class="settings-header-row">
        <div class="settings-title">
          {{ t('settings.title') }}
        </div>

        <a-button
          type="text"
          size="small"
          aria-label="close"
          title="Close"
          @click="onCloseClick"
        >
          ✕
        </a-button>
      </div>
    </div>

    <div class="settings-body">
      <a-collapse v-model:active-key="activeKeyModel" ghost class="settings-collapse">
        <a-collapse-panel key="files" :header="t('settings.panel.files.header')">
          <FilesPanel />
        </a-collapse-panel>

        <a-collapse-panel key="layers" :header="t('settings.panel.layers.header')">
          <LayersPanel />
        </a-collapse-panel>

        <a-collapse-panel key="display" :header="t('settings.panel.display.header')">
          <DisplayPanel />
        </a-collapse-panel>

        <a-collapse-panel key="lammps" :header="t('settings.panel.lammps.header')">
          <LammpsPanel />
        </a-collapse-panel>

        <a-collapse-panel key="colors" :header="t('settings.panel.colors.header')">
          <ColorsPanel />
        </a-collapse-panel>

        <a-collapse-panel key="other" :header="t('settings.panel.other.header')">
          <OtherPanel />
        </a-collapse-panel>
      </a-collapse>
    </div>
  </a-drawer>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ViewerSettings } from '../../lib/viewer/settings';

import FilesPanel from './panels/FilesPanel.vue';
import LayersPanel from './panels/LayersPanel.vue';
import DisplayPanel from './panels/DisplayPanel.vue';
import LammpsPanel from './panels/LammpsPanel.vue';
import ColorsPanel from './panels/ColorsPanel.vue';
import OtherPanel from './panels/OtherPanel.vue';

import { settingsSiderContextKey, type PatchSettingsFn } from './context';

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

const { t } = useI18n();

/**
 * Patch settings back to parent.
 * Panels call this via provide/inject.
 */
const patchSettings: PatchSettingsFn = (patch) => {
  emit('update:settings', {
    ...props.settings,
    ...patch,
    rotationDeg: {
      ...props.settings.rotationDeg,
      ...(patch.rotationDeg ?? {}),
    },
  });
};

provide(settingsSiderContextKey, {
  settings: computed(() => props.settings),
  patchSettings,
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

function loadNum(key: string, fallback: number): number {
  const raw = localStorage.getItem(key);
  const v = raw != null ? Number(raw) : NaN;
  return Number.isFinite(v) ? v : fallback;
}
function saveNum(key: string, v: number): void {
  localStorage.setItem(key, String(v));
}

const mobileHeight = ref<number>(
  loadNum(
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
      placementLock.value = isMobile.value ? 'bottom' : 'right';
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
 * Desktop panel transition hooks.
 * Keep close-guards cleanup aligned with the visual end of the slide animation.
 */
function onDesktopAfterEnter(): void {
  onAfterOpenChange(true);
}

function onDesktopAfterLeave(): void {
  onAfterOpenChange(false);
}

let resizing = false;
let startY = 0;
let startH = 0;
let activePointerId: number | null = null;
let touchMoveBlocker: ((e: TouchEvent) => void) | null = null;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function startBlockPullToRefresh(): void {
  document.documentElement.classList.add('resizing');
  document.body.classList.add('resizing');
  touchMoveBlocker = (ev: TouchEvent) => {
    if (resizing) ev.preventDefault();
  };
  window.addEventListener('touchmove', touchMoveBlocker, { passive: false });
}

function stopBlockPullToRefresh(): void {
  document.documentElement.classList.remove('resizing');
  document.body.classList.remove('resizing');
  if (touchMoveBlocker) {
    window.removeEventListener('touchmove', touchMoveBlocker as any);
    touchMoveBlocker = null;
  }
}

function onResizeStart(e: PointerEvent): void {
  if (drawerPlacement.value !== 'bottom') return;

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
  mobileHeight.value = clamp(startH + dy, 260, maxH);
  saveNum('settingsDrawer.mobileHeight', mobileHeight.value);
  e.preventDefault();
}

function onResizeEnd(): void {
  if (!resizing) return;
  resizing = false;
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

const drawerBodyStyle = computed(() => {
  return {
    padding: '0',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
  } as Record<string, any>;
});
</script>

<style src="./index.css"></style>
