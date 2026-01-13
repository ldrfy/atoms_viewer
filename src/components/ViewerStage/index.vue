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
      :aria-label="t('viewer.empty.pickFile')"
      :title="t('viewer.empty.pickFile')"
      accept=".xyz,.pdb,.dump,.lammpstrj,.traj,.data,.lmp"
      @change="stage.onFilePicked"
    >

    <!-- 动画 + 录制控制条 -->
    <AnimBar :ctx="stage.animCtx" />

    <!-- 录制中：显示裁剪虚线框（不影响操作） -->
    <RecordCropDash :ctx="stage.cropDashCtx" />
  </div>
</template>

<script setup lang="ts">
import { toRef, watch, onBeforeUnmount, computed, ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useViewerStage } from './useViewerStage';
import type { ViewerSettings, OpenSettingsPayload } from '../../lib/viewer/settings';
import { Modal, message } from 'ant-design-vue';
import {
  setThemeMode,
  isDark,
  getThemeMode,
  getPreferredThemeForBg,
  getColorLuminance,
} from '../../theme/mode';
import { setViewerApi } from '../../lib/viewer/bridge';
import { createSettingsShadow } from '../../lib/viewer/mergeSettings';

import RecordSelectOverlay from './parts/RecordSelectOverlay.vue';
import AtomInspectorOverlay from './parts/AtomInspectorOverlay.vue';
import AnimBar from './parts/AnimBar.vue';
import RecordCropDash from './parts/RecordCropDash.vue';

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

function patchSettings(patch: Partial<ViewerSettings>): void {
  const merged = settingsShadow.patch(patch);
  emit('update:settings', merged);
}

const stage = useViewerStage(settingsRef, patchSettings, payload =>
  emit('open-settings', payload),
);

const AUTO_BG_LIGHT = '#ffffff';
const AUTO_BG_DARK = '#000000';
const SEVERE_DARK_THRESHOLD = 0.2;
const SEVERE_LIGHT_THRESHOLD = 0.8;
const themeMode = computed(() => getThemeMode());
const activeThemeMode = computed<'light' | 'dark'>(() =>
  themeMode.value === 'system' ? (isDark.value ? 'dark' : 'light') : themeMode.value,
);
const skipNextThemePrompt = ref(false);
const allowThemePrompt = ref(false);

onMounted(() => {
  allowThemePrompt.value = true;
  maybePromptSevereMismatch();
});

// NOTE: Vue template ref auto-unwrapping is guaranteed for top-level refs.
// Accessing nested refs (stage.isLoading) can be inconsistent depending on build/tooling.
// Keep a top-level alias so v-if tracks the actual boolean value.
const isLoading = stage.isLoading;

// ✅ 映射集中在 useViewerStage.ts：index.vue 不再重复写
setViewerApi(stage.bridgeApi);

defineExpose(stage.exposedApi);

onBeforeUnmount(() => {
  setViewerApi(null);
});

watch(
  stage.hasModel,
  v => emit('model-state', !!v),
  { immediate: true },
);

watch(
  () => props.settings.backgroundColor,
  (color) => {
    if (!color) return;
    if (props.settings.backgroundColorMode !== 'custom') return;
    const preferred = getPreferredThemeForBg(color);
    if (!preferred || preferred === activeThemeMode.value) return;
    skipNextThemePrompt.value = true;
    setThemeMode(preferred);
  },
);

watch(
  [() => isDark.value, () => props.settings.backgroundColorMode],
  ([dark, mode]) => {
    if (mode !== 'auto') return;
    const nextColor = dark ? AUTO_BG_DARK : AUTO_BG_LIGHT;
    if (
      props.settings.backgroundColor !== nextColor
      || props.settings.backgroundTransparent
    ) {
      patchSettings({
        backgroundColor: nextColor,
        backgroundTransparent: false,
      });
    }
  },
  { immediate: true },
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
  const currentMode = mode === 'system' ? activeThemeMode.value : mode;
  const color = props.settings.backgroundColor;
  if (!color) return;
  const preferred = getPreferredThemeForBg(color);
  if (!preferred || preferred === currentMode) return;
  showThemeMismatchConfirm(preferred);
}

function maybePromptSevereMismatch(): void {
  if (!props.settings.themeReadabilityCheckOnOpen) return;
  const mode = activeThemeMode.value;
  const color = props.settings.backgroundColor;
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

.loading-overlay {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    pointer-events: none;
    z-index: 30;
}

/* 无模型：左上角项目名 */

/* While resizing overlay panels, suppress browser pull-to-refresh / overscroll */
html.resizing,
body.resizing {
    overscroll-behavior-y: none;
    touch-action: none;
}

</style>
