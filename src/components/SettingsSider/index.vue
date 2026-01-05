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
        <SettingsContent
          v-model:active-key="activeKeyModel"
          :show-grab="false"
          @close="onCloseClick"
        />
      </div>
    </Transition>
  </Teleport>

  <!-- Mobile: use the same Teleport-based panel as desktop (bottom sheet) so
       backdrop-blur / translucency is consistent across platforms. -->
  <Teleport to="body">
    <Transition name="settings-mask-fade">
      <div
        v-show="drawerPlacement === 'bottom' && openModel"
        class="settings-sheet-mask"
        aria-hidden="true"
      />
    </Transition>

    <Transition
      name="settings-sheet-slide"
      @after-enter="onMobileAfterEnter"
      @after-leave="onMobileAfterLeave"
    >
      <div
        v-show="drawerPlacement === 'bottom' && openModel"
        class="settings-drawer settings-sheet settings-drawer--bottom"
        :style="mobileSheetStyle"
      >
        <SettingsContent
          v-model:active-key="activeKeyModel"
          :show-grab="true"
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

import SettingsContent from './SettingsContent.vue';
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

function onMobileAfterEnter(): void {
  onAfterOpenChange(true);
}

function onMobileAfterLeave(): void {
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
</script>

<style src="./index.css"></style>
