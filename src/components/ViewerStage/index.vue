<template>
  <div
    class="stage"
    @dragenter.prevent="stage.onDragEnter"
    @dragover.prevent="stage.onDragOver"
    @dragleave.prevent="stage.onDragLeave"
    @drop.prevent="stage.onDrop"
  >
    <!-- 录制框选/编辑遮罩 -->
    <RecordSelectOverlay :ctx="stage.recordSelectCtx" />

    <!-- three canvas 宿主：函数 ref，避免本地变量重复 -->
    <div :ref="stage.bindCanvasHost" class="canvas-host" />

    <!-- Dual view divider (UI only; not captured in export/record) -->
    <div
      v-if="showDualViewDivider"
      class="dual-view-divider"
      :class="{ dragging: isDraggingDivider }"
      :style="dualViewDividerStyle"
      aria-hidden="true"
      role="separator"
      aria-orientation="vertical"
      @pointerdown.prevent="onDividerPointerDown"
    />
    <div
      v-if="showDualViewDivider"
      class="dual-view-divider__hit"
      :style="{ '--dual-view-divider-x': dualViewDividerStyle['--dual-view-divider-x'] }"
      @pointerdown.stop.prevent="onDividerPointerDown"
    />
    <a-tag
      v-if="showDualViewDivider"
      size="small"
      class="dual-view-divider__label"
      :style="dualViewLabelStyle"
    >
      {{ dualViewPercentLabel }}
    </a-tag>

    <!-- 原子信息/测量面板（点击原子后显示） -->
    <AtomInspectorOverlay :ctx="stage.inspectCtx" />

    <!-- 放下后开始加载：旋转图标 -->
    <div v-if="isLoading" class="loading-overlay">
      <a-spin size="large" />
    </div>

    <!-- 隐藏文件输入：函数 ref，避免本地变量重复 -->
    <input
      :ref="stage.bindFileInput"
      class="file-input"
      type="file"
      multiple
      :title="t('viewer.empty.pickFile')"
      accept=".xyz,.pdb,.mol,.sdf,.dump,.lammpstrj,.traj,.data,.lmp,.zip"
      @change="stage.onFilePicked"
    >

    <!-- 动画 + 录制控制条 -->
    <AnimBar :ctx="stage.animCtx" :parse-ctx="stage.parseCtx" />

    <!-- 模型平移控制（上下左右） -->
    <ModelPanPad
      v-if="stage.hasModel"
      :on-pan="stage.panModel"
      :on-reset="stage.resetPan"
      :target-side="stage.panTargetSide.value"
      :is-panned="stage.panDirty.value"
    />

    <!-- 录制中：显示裁剪虚线框（不影响操作） -->
    <RecordCropDash :ctx="stage.cropDashCtx" />
  </div>
</template>

<script setup lang="ts">
import { toRef, watch, onBeforeUnmount, computed, ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useViewerStage } from './useViewerStage';
import type { ViewerSettings, OpenSettingsPayload } from '../../lib/viewer/settings';
import type { SettingsPatch } from '../../lib/viewer/mergeSettings';
import { Modal, message } from 'antdv-next';
import {
  setThemeMode,
  isDark,
  getThemeMode,
  getPreferredThemeForBg,
  getColorLuminance,
} from '../../theme/mode';
import { setViewerApi } from '../../lib/viewer/bridge';
import { createSettingsShadow } from '../../lib/viewer/mergeSettings';
import { normalizeViewPresets } from '../../lib/viewer/viewPresets';

import RecordSelectOverlay from './parts/RecordSelectOverlay.vue';
import AtomInspectorOverlay from './parts/AtomInspectorOverlay.vue';
import AnimBar from './parts/AnimBar.vue';
import RecordCropDash from './parts/RecordCropDash.vue';
import ModelPanPad from './parts/ModelPanPad.vue';

const props = defineProps<{ settings: ViewerSettings }>();
const settingsRef = toRef(props, 'settings');
const { t } = useI18n();

const emit = defineEmits<{
  (e: 'model-state', hasModel: boolean): void;
  (e: 'update:settings', v: ViewerSettings): void;
  (e: 'open-settings', payload?: OpenSettingsPayload): void;
}>();

/** 统一 patch settings / Unified patch settings */
// IMPORTANT: patchSettings can be called multiple times within the same tick (e.g. LAMMPS
// mapping auto-fill + distance sync). If we always merge into props.settings, later patches
// may overwrite earlier ones before parent updates propagate. Use a local shadow snapshot.
const settingsShadow = createSettingsShadow(props.settings);

watch(
  () => props.settings,
  (v) => {
    settingsShadow.syncFrom(v);
  },
  { immediate: true, deep: true, flush: 'sync' },
);

function patchSettings(patch: SettingsPatch): void {
  const merged = settingsShadow.patch(patch);
  emit('update:settings', merged);
}

const stage = useViewerStage(settingsRef, patchSettings, payload =>
  emit('open-settings', payload),
);

const SEVERE_DARK_THRESHOLD = 0.2;
const SEVERE_LIGHT_THRESHOLD = 0.8;
const themeMode = computed(() => getThemeMode());
const activeThemeMode = computed<'light' | 'dark'>(() =>
  themeMode.value === 'system' ? (isDark.value ? 'dark' : 'light') : themeMode.value,
);
const skipNextThemePrompt = ref(false);
const allowThemePrompt = ref(false);
const isDraggingDivider = ref(false);

onMounted(() => {
  allowThemePrompt.value = true;
  maybePromptSevereMismatch();
});

// NOTE: Vue template ref auto-unwrapping is guaranteed for top-level refs.
// Accessing nested refs (stage.isLoading) can be inconsistent depending on build/tooling.
// Keep a top-level alias so v-if tracks the actual boolean value.
const isLoading = stage.isLoading;

const showDualViewDivider = computed(() => {
  const presets = normalizeViewPresets(settingsRef.value.view.viewPresets);
  return presets.length === 2;
});

const dualViewDividerStyle = computed(() => {
  const raw = typeof settingsRef.value.view.dualViewSplit === 'number'
    ? settingsRef.value.view.dualViewSplit
    : 0.5;
  const ratio = Math.min(0.9, Math.max(0.1, raw));
  return {
    'left': `${ratio * 100}%`,
    '--dual-view-divider-x': `${ratio * 100}%`,
  } as Record<string, string>;
});

const dualViewLabelStyle = computed(() => ({ left: dualViewDividerStyle.value.left }));
const dualViewPercentLabel = computed(() => {
  const raw = typeof settingsRef.value.view.dualViewSplit === 'number'
    ? settingsRef.value.view.dualViewSplit
    : 0.5;
  const ratio = Math.min(0.9, Math.max(0.1, raw));
  const left = Math.round(ratio * 100);
  return `${left}% / ${100 - left}%`;
});

function clampSplit(v: number): number {
  return Math.min(0.9, Math.max(0.1, v));
}

function updateSplitFromPointer(e: PointerEvent): void {
  const host = stage.canvasHostRef.value;
  if (!host) return;
  const rect = host.getBoundingClientRect();
  if (rect.width <= 0) return;
  const x = e.clientX - rect.left;
  const ratio = clampSplit(x / rect.width);
  patchSettings({ view: { dualViewSplit: ratio } });
}

function onDividerPointerDown(e: PointerEvent): void {
  if (!showDualViewDivider.value) return;
  isDraggingDivider.value = true;
  updateSplitFromPointer(e);

  const onMove = (ev: PointerEvent) => {
    if (!isDraggingDivider.value) return;
    updateSplitFromPointer(ev);
  };
  const onUp = () => {
    isDraggingDivider.value = false;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
  };

  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerup', onUp, { passive: true });
  window.addEventListener('pointercancel', onUp, { passive: true });
}

// ✅ 映射集中在 useViewerStage.ts：index.vue 不再重复写
setViewerApi(stage.bridgeApi);

defineExpose(stage.exposedApi);

onBeforeUnmount(() => {
  setViewerApi(null);
  isDraggingDivider.value = false;
});

watch(
  stage.hasModel,
  v => emit('model-state', !!v),
  { immediate: true },
);

watch(
  () => props.settings.other.backgroundColor,
  (color) => {
    if (props.settings.other.backgroundTransparent) return;
    if (!color) return;
    if (props.settings.other.backgroundColorMode !== 'custom') return;
    const preferred = getPreferredThemeForBg(color);
    if (!preferred || preferred === activeThemeMode.value) return;
    skipNextThemePrompt.value = true;
    setThemeMode(preferred);
    patchSettings({ other: { themeMode: preferred } });
  },
);

watch(
  () => themeMode.value,
  (mode) => {
    maybePromptThemeMismatch(mode);
  },
);

function maybePromptThemeMismatch(mode: string): void {
  if (!allowThemePrompt.value) return;
  if (skipNextThemePrompt.value) {
    skipNextThemePrompt.value = false;
    return;
  }
  if (props.settings.other.backgroundTransparent) return;
  const currentMode = mode === 'system' ? activeThemeMode.value : mode;
  const color = props.settings.other.backgroundColor;
  if (!color) return;
  const preferred = getPreferredThemeForBg(color);
  if (!preferred || preferred === currentMode) return;
  showThemeMismatchConfirm(preferred);
}

function maybePromptSevereMismatch(): void {
  if (!props.settings.other.themeReadabilityCheckOnOpen) return;
  const mode = activeThemeMode.value;
  const color = props.settings.other.backgroundColor;
  if (props.settings.other.backgroundTransparent) return;
  if (!color) return;
  const L = getColorLuminance(color);
  if (L === null) return;
  const severe
    = (mode === 'light' && L < SEVERE_DARK_THRESHOLD)
      || (mode === 'dark' && L > SEVERE_LIGHT_THRESHOLD);
  if (!severe) return;
  const preferred = getPreferredThemeForBg(color);
  if (!preferred || preferred === mode) return;
  showThemeMismatchConfirm(preferred);
}

function showThemeMismatchConfirm(preferred: 'light' | 'dark'): void {
  const contentKey = 'viewer.theme.bgMismatch';
  const currentMode = preferred === 'light' ? 'dark' : 'light';
  const themeLabelKey = currentMode === 'light'
    ? 'viewer.theme.bgMismatchThemeLight'
    : 'viewer.theme.bgMismatchThemeDark';
  Modal.confirm({
    title: t('viewer.theme.bgMismatchTitle'),
    content: t(contentKey, { theme: t(themeLabelKey) }),
    centered: true,
    okText: t('viewer.theme.bgMismatchRestore'),
    cancelText: t('viewer.theme.bgMismatchKeep'),
    onOk: () => {
      setThemeMode(preferred);
      patchSettings({ other: { themeMode: preferred } });
    },
    onCancel: () => {
      message.info(t('viewer.theme.bgMismatchKeepTip'));
    },
  });
}
</script>

<!-- 关键修改：去掉 scoped，让 index.css 能作用到子组件内部 DOM -->
<style>
    .stage {
    position: relative;
    height: 100%;
    width: 100%;
    overflow: hidden;
    /* 容器显式禁止浏览器触控行为 */
    touch-action: none;
}

.canvas-host {
    /* 容器显式禁止浏览器触控行为 */
    touch-action: none;
    height: 100%;
    width: 100%;
}

.dual-view-divider {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 0;
    border-left: 1px dashed rgba(255, 255, 255, 0.75);
    opacity: 0.8;
    pointer-events: auto;
    z-index: 12;
    mix-blend-mode: difference;
    cursor: col-resize;
}

.dual-view-divider.dragging {
    opacity: 1;
}

.dual-view-divider__hit {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 36px;
    left: calc(var(--dual-view-divider-x, 50%) - 18px);
    transform: translateX(0);
    pointer-events: auto;
    cursor: col-resize;
    z-index: 60;
    touch-action: none;
}

.dual-view-divider__label {
    position: absolute;
    top: 10px;
    transform: translateX(-50%);
    font-size: 12px;
    padding: 2px 6px;
    border-radius: 6px;
    pointer-events: none;
    z-index: 13;
}

.dual-view-divider__snap {
    position: absolute;
    top: 34px;
    transform: translateX(-50%);
    z-index: 13;
}

.loading-overlay {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    pointer-events: none;
    z-index: 30;
}

.atom-selection-label {
    transform: translate(-50%, -100%);
    padding: 1px 5px;
    border-radius: 10px;
    font-size: 11px;
    line-height: 1.2;
    font-weight: 600;
    color: #fff;
    background: rgba(0, 0, 0, 0.65);
    border: 1px solid rgba(255, 255, 255, 0.2);
    white-space: nowrap;
    pointer-events: none;
    user-select: none;
}

.atom-all-label {
    transform: translate(-50%, -100%);
    padding: 1px 4px;
    border-radius: 8px;
    font-size: 10px;
    line-height: 1.1;
    font-weight: 600;
    color: #fff;
    background: rgba(0, 0, 0, 0.45);
    border: 1px solid rgba(255, 255, 255, 0.15);
    white-space: nowrap;
    pointer-events: none;
    user-select: none;
}

/* 无模型：左上角项目名 */

/* While resizing overlay panels, suppress browser pull-to-refresh / overscroll */
html.resizing,
body.resizing {
    overscroll-behavior-y: none;
    touch-action: none;
}

</style>
