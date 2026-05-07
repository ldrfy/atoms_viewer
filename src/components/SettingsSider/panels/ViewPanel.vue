<template>
  <a-flex vertical gap="middle">
    <a-flex vertical gap="small">
      <a-space :size="6">
        <a-typography-text>
          {{ t('settings.panel.view.viewPresets') }}
        </a-typography-text>
        <a-tooltip :title="t('settings.panel.view.viewPresetsHint')" placement="left">
          <a-button
            variant="link"
            color="default"
            size="small"
          >
            <QuestionCircleOutlined />
          </a-button>
        </a-tooltip>
      </a-space>
      <a-flex justify="center">
        <a-checkbox-group
          :value="viewPresetsModel"
          :options="viewPresetOptions"
          :disabled="!hasAnyLayer"
          @change="onViewPresetsChange"
        />
      </a-flex>
    </a-flex>

    <SettingSwitchField
      v-model:checked="orthographicModel"
      :label="t('settings.panel.view.perspective')"
      :disabled="!hasAnyLayer"
    />

    <a-flex
      v-if="viewPresetsModel.length > 0"
      vertical
    >
      <a-space :size="0" align="center">
        <a-typography-text>
          {{ t('settings.panel.view.dualViewDistance') }}
        </a-typography-text>
        <a-tooltip
          :title="distanceDirty ? t('settings.panel.view.resetView') : ''"
          :disabled="!distanceDirty"
          placement="left"
        >
          <a-button
            variant="link"
            color="default"
            size="small"
            :style="{
              fontSize: '12px',
              visibility: distanceDirty ? 'visible' : 'hidden',
            }"
            @click="resetDistance"
          >
            <ReloadOutlined />
          </a-button>
        </a-tooltip>
      </a-space>
      <SettingSliderField
        v-model:value="dualViewDistanceModel"
        :min="DUAL_VIEW_DISTANCE_MIN"
        :max="dualViewDistanceMax"
        :slider-step="0.01"
        :precision="2"
        :disabled="!hasAnyLayer"
      />
    </a-flex>

    <a-flex vertical gap="small">
      <a-space :size="0" align="center">
        <a-typography-text>
          {{ t('settings.panel.view.rotation') }}
        </a-typography-text>
        <a-tooltip
          :title="rotationDirty ? t('settings.panel.view.resetPose') : ''"
          :disabled="!rotationDirty"
          placement="left"
        >
          <a-button
            variant="link"
            color="default"
            size="small"
            :style="{
              fontSize: '12px',
              visibility: rotationDirty ? 'visible' : 'hidden',
            }"
            @click="resetPose"
          >
            <ReloadOutlined />
          </a-button>
        </a-tooltip>
      </a-space>
      <SettingSliderField
        v-for="axis in rotationAxes"
        :key="axis.key"
        :value="rotationValue(axis.key)"
        :min="-180"
        :max="180"
        :slider-step="0.1"
        :input-step="1"
        :precision="1"
        :disabled="!hasAnyLayer"
        @update:value="(v: number) => onRotationAxisChange(axis.key, v)"
      >
        <template #prefix>
          <a-tag color="processing" variant="outlined" style="margin-left: 5px;">
            {{ axis.label }}
          </a-tag>
        </template>
      </SettingSliderField>
    </a-flex>
  </a-flex>
</template>

<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import { message } from 'antdv-next';
import { QuestionCircleOutlined, ReloadOutlined } from '@antdv-next/icons';
import { useI18n } from 'vue-i18n';
import { normalizeViewPresets, type ViewPreset } from '../../../lib/viewer/viewPresets';
import { DUAL_VIEW_DISTANCE_MIN } from '../../../lib/viewer/constants';
import { DEFAULT_DISPLAY } from '../../../lib/viewer/settings';
import { useSettingsSiderContext } from '../useSettingsSiderContext';
import { PANEL_KEYS } from '../../../lib/viewer/panelKeys';
import { useSettingsSiderResetContext } from '../useSettingsSiderResetContext';
import SettingSliderField from '../parts/SettingSliderField.vue';
import SettingSwitchField from '../parts/SettingSwitchField.vue';

const { t } = useI18n();
const { settings, patchSettings, hasAnyLayer } = useSettingsSiderContext();

const viewPresetOptions = computed(() => [
  { label: t('settings.panel.view.viewPresetFront'), value: 'front' as const },
  { label: t('settings.panel.view.viewPresetSide'), value: 'side' as const },
  { label: t('settings.panel.view.viewPresetTop'), value: 'top' as const },
]);

// Controlled selection (max two, min one)
const viewPresetsModel = ref<ViewPreset[]>(['front']);

function syncViewPresetsFromSettings(): void {
  const cur = normalizeViewPresets(settings.value.view.viewPresets);
  if (cur.length > 0) {
    viewPresetsModel.value = cur;
    return;
  }
  viewPresetsModel.value = ['front'];
}

watch(
  () => settings.value.view.viewPresets,
  () => syncViewPresetsFromSettings(),
  { immediate: true, deep: true },
);

function onViewPresetsChange(nextRaw: any): void {
  if (!hasAnyLayer.value) return;
  const arr = Array.isArray(nextRaw) ? nextRaw : [];
  const next = arr.filter(
    (x): x is ViewPreset => x === 'front' || x === 'side' || x === 'top',
  );
  const prev = viewPresetsModel.value;

  if (!next || next.length === 0) {
    message.warning(t('settings.panel.view.viewPresetsNeedOne'));
    return;
  }

  const keep = prev.filter(p => next.includes(p));
  const added = next.filter(p => !prev.includes(p));
  const merged = [...keep, ...added];
  while (merged.length > 2) merged.shift();

  viewPresetsModel.value = merged;
  patchSettings({ view: { viewPresets: merged } });
}

const dualViewDistanceModel = computed({
  get: () => settings.value.view.dualViewDistance ?? 10,
  set: (v: number) => patchSettings({ view: { dualViewDistance: v } }),
});

const dualViewDistanceMax = computed(() => {
  const v = settings.value.view.dualViewDistance ?? 10;
  return Math.max(200, Math.ceil(v * 1.2));
});
// const dualViewDistanceMax = 500;

// Switch label is "perspective"; stored setting is `orthographic`.
// UI "ON" means perspective, so invert.
const orthographicModel = computed({
  get: () => !settings.value.view.orthographic,
  set: (v: boolean) => patchSettings({ view: { orthographic: !v } }),
});

function getDefaultDistance(): number {
  const s = settings.value.view;
  const d
    = typeof s.initialDualViewDistance === 'number' && Number.isFinite(s.initialDualViewDistance)
      ? s.initialDualViewDistance
      : typeof s.dualViewDistance === 'number' && Number.isFinite(s.dualViewDistance)
        ? s.dualViewDistance
        : 10;
  return d;
}

const distanceDirty = computed(() => {
  const cur = settings.value.view.dualViewDistance ?? 10;
  const def = getDefaultDistance();
  return Math.abs(cur - def) > 1e-6;
});

function resetDistance(): void {
  patchSettings({ view: { dualViewDistance: getDefaultDistance() } });
}

const rotationDirty = computed(() => {
  const r = settings.value.view.rotationDeg;
  return Math.abs(r.x) > 1e-6 || Math.abs(r.y) > 1e-6 || Math.abs(r.z) > 1e-6;
});

type RotationAxisKey = 'x' | 'y' | 'z';
const rotationAxes: Array<{ key: RotationAxisKey; label: 'X' | 'Y' | 'Z' }> = [
  { key: 'x', label: 'X' },
  { key: 'y', label: 'Y' },
  { key: 'z', label: 'Z' },
];

// 统一读取旋转轴值，供循环渲染使用。
// Unified axis value getter for loop rendering.
function rotationValue(axis: RotationAxisKey): number {
  return settings.value.view.rotationDeg[axis];
}

// 统一写入旋转轴值，减少重复 computed 模型。
// Unified axis setter to avoid repeated computed models.
function onRotationAxisChange(axis: RotationAxisKey, value: number): void {
  patchSettings({ view: { rotationDeg: { [axis]: value } } });
}

function resetPose(): void {
  patchSettings({ view: { rotationDeg: { x: 0, y: 0, z: 0 } } });
}

function resetViewPanel(): void {
  resetPose();
  resetDistance();
  patchSettings({
    view: {
      orthographic: DEFAULT_DISPLAY.orthographic,
      viewPresets: [...DEFAULT_DISPLAY.viewPresets],
    },
  });
}

const { registerPanelReset } = useSettingsSiderResetContext();
const unregisterViewReset = registerPanelReset(PANEL_KEYS.view, resetViewPanel);
onBeforeUnmount(() => {
  unregisterViewReset();
});
</script>

<style scoped>
</style>
