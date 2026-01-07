<template>
  <a-form layout="vertical">
    <a-form-item :label="t('settings.panel.display.viewPresets')">
      <div style="display: flex; justify-content: center;">
        <a-checkbox-group
          :value="viewPresetsModel"
          :options="viewPresetOptions"
          :disabled="!hasAnyLayer"
          @change="onViewPresetsChange"
        />
      </div>

      <a-typography-text type="secondary" style="display: block; margin-top: 6px; text-align: center;">
        {{ t('settings.panel.display.viewPresetsHint') }}
      </a-typography-text>
    </a-form-item>

    <a-form-item
      v-if="viewPresetsModel.length === 2"
      :label="t('settings.panel.display.dualViewSplit')"
    >
      <a-row :gutter="8" align="middle">
        <a-col :flex="1">
          <a-slider
            v-model:value="dualViewSplitPctModel"
            :min="10"
            :max="90"
            :step="1"
            :disabled="!hasAnyLayer"
          />
        </a-col>
        <a-col :style="{ width: '96px' }">
          <a-input-number
            v-model:value="dualViewSplitPctModel"
            :aria-label="t('settings.panel.display.dualViewSplit')"
            :title="t('settings.panel.display.dualViewSplit')"
            :min="10"
            :max="90"
            :step="1"
            :disabled="!hasAnyLayer"
            style="width: 100%"
          />
        </a-col>
      </a-row>
      <a-typography-text type="secondary" style="display: block; margin-top: 6px">
        {{ t('settings.panel.display.dualViewSplitHint') }}
      </a-typography-text>
    </a-form-item>

    <a-form-item>
      <a-row justify="space-between" align="middle">
        <a-col>{{ t('settings.panel.display.perspective') }}</a-col>
        <a-col>
          <a-switch
            v-model:checked="orthographicModel"
            :aria-label="t('settings.panel.display.perspective')"
            :title="t('settings.panel.display.perspective')"
            :disabled="!hasAnyLayer"
          />
        </a-col>
      </a-row>
    </a-form-item>

    <a-form-item
      v-if="viewPresetsModel.length > 0"
      :label="t('settings.panel.display.dualViewDistance')"
    >
      <a-row :gutter="8" align="middle">
        <a-col :flex="1">
          <a-slider
            v-model:value="dualViewDistanceModel"
            :min="1"
            :max="dualViewDistanceMax"
            :step="0.5"
            :disabled="!hasAnyLayer"
          />
        </a-col>
        <a-col :style="{ width: '96px' }">
          <a-input-number
            v-model:value="dualViewDistanceModel"
            :aria-label="t('settings.panel.display.dualViewDistance')"
            :title="t('settings.panel.display.dualViewDistance')"
            :min="1"
            :max="dualViewDistanceMax"
            :step="0.5"
            :disabled="!hasAnyLayer"
            style="width: 100%"
          />
        </a-col>
      </a-row>
    </a-form-item>

    <a-form-item :label="t('settings.panel.display.rotX')">
      <a-row :gutter="8" align="middle">
        <a-col :flex="1">
          <a-slider
            v-model:value="rotXModel"
            :min="-180"
            :max="180"
            :step="1"
            :disabled="!hasAnyLayer"
          />
        </a-col>
        <a-col :style="{ width: '96px' }">
          <a-input-number
            v-model:value="rotXModel"
            :aria-label="t('settings.panel.display.rotX')"
            :title="t('settings.panel.display.rotX')"
            :min="-180"
            :max="180"
            :step="1"
            :disabled="!hasAnyLayer"
            style="width: 100%"
          />
        </a-col>
      </a-row>
    </a-form-item>

    <a-form-item :label="t('settings.panel.display.rotY')">
      <a-row :gutter="8" align="middle">
        <a-col :flex="1">
          <a-slider
            v-model:value="rotYModel"
            :min="-180"
            :max="180"
            :step="1"
            :disabled="!hasAnyLayer"
          />
        </a-col>
        <a-col :style="{ width: '96px' }">
          <a-input-number
            v-model:value="rotYModel"
            :aria-label="t('settings.panel.display.rotY')"
            :title="t('settings.panel.display.rotY')"
            :min="-180"
            :max="180"
            :step="1"
            :disabled="!hasAnyLayer"
            style="width: 100%"
          />
        </a-col>
      </a-row>
    </a-form-item>

    <a-form-item :label="t('settings.panel.display.rotZ')">
      <a-row :gutter="8" align="middle">
        <a-col :flex="1">
          <a-slider
            v-model:value="rotZModel"
            :min="-180"
            :max="180"
            :step="1"
            :disabled="!hasAnyLayer"
          />
        </a-col>
        <a-col :style="{ width: '96px' }">
          <a-input-number
            v-model:value="rotZModel"
            :aria-label="t('settings.panel.display.rotZ')"
            :title="t('settings.panel.display.rotZ')"
            :min="-180"
            :max="180"
            :step="1"
            :disabled="!hasAnyLayer"
            style="width: 100%"
          />
        </a-col>
      </a-row>
    </a-form-item>

    <a-form-item>
      <a-row :gutter="8" align="middle">
        <a-col :flex="1">
          <a-button block :disabled="!hasAnyLayer" @click="resetPose">
            {{ t('settings.panel.display.resetPose') }}
          </a-button>
        </a-col>
        <a-col :flex="1">
          <a-button block :disabled="!hasAnyLayer" @click="resetDistance">
            {{ t('settings.panel.display.resetView') }}
          </a-button>
        </a-col>
      </a-row>
    </a-form-item>
  </a-form>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { message } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';
import { normalizeViewPresets, type ViewPreset } from '../../../lib/viewer/viewPresets';
import { viewerApiRef } from '../../../lib/viewer/bridge';
import { useSettingsSiderContext } from '../useSettingsSiderContext';

const { t } = useI18n();
const { settings, patchSettings } = useSettingsSiderContext();
const viewerApi = computed(() => viewerApiRef.value);
const hasAnyLayer = computed(() => (viewerApi.value?.layers.value.length ?? 0) > 0);

const viewPresetOptions = computed(() => [
  { label: t('settings.panel.display.viewPresetFront'), value: 'front' as const },
  { label: t('settings.panel.display.viewPresetSide'), value: 'side' as const },
  { label: t('settings.panel.display.viewPresetTop'), value: 'top' as const },
]);

// Controlled selection (max two, min one)
const viewPresetsModel = ref<ViewPreset[]>(['front']);

function syncViewPresetsFromSettings(): void {
  const cur = normalizeViewPresets(settings.value.viewPresets);
  if (cur.length > 0) {
    viewPresetsModel.value = cur;
    return;
  }
  if (settings.value.dualViewEnabled) {
    viewPresetsModel.value = ['front', 'side'];
    return;
  }
  viewPresetsModel.value = ['front'];
}

watch(
  () => [settings.value.viewPresets, settings.value.dualViewEnabled] as const,
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
    message.warning(t('settings.panel.display.viewPresetsNeedOne'));
    return;
  }

  const keep = prev.filter(p => next.includes(p));
  const added = next.filter(p => !prev.includes(p));
  const merged = [...keep, ...added];
  while (merged.length > 2) merged.shift();

  viewPresetsModel.value = merged;
  patchSettings({ viewPresets: merged, dualViewEnabled: false });
}

const dualViewDistanceModel = computed({
  get: () => settings.value.dualViewDistance ?? 10,
  set: (v: number) => patchSettings({ dualViewDistance: v }),
});

const dualViewDistanceMax = computed(() => {
  const v = settings.value.dualViewDistance ?? 10;
  return Math.max(200, Math.ceil(v * 1.2));
});
// const dualViewDistanceMax = 500;

const dualViewSplitPctModel = computed({
  get: () => {
    const r = typeof settings.value.dualViewSplit === 'number' ? settings.value.dualViewSplit : 0.5;
    return Math.round(Math.max(0.1, Math.min(0.9, r)) * 100);
  },
  set: (pct: number) => {
    const r = Math.max(0.1, Math.min(0.9, pct / 100));
    patchSettings({ dualViewSplit: r });
  },
});

// Switch label is "perspective"; stored setting is `orthographic`.
// UI "ON" means perspective, so invert.
const orthographicModel = computed({
  get: () => !settings.value.orthographic,
  set: (v: boolean) => patchSettings({ orthographic: !v }),
});

function resetDistance(): void {
  const s = settings.value;
  const d
    = typeof s.initialDualViewDistance === 'number' && Number.isFinite(s.initialDualViewDistance)
      ? s.initialDualViewDistance
      : typeof s.dualViewDistance === 'number' && Number.isFinite(s.dualViewDistance)
        ? s.dualViewDistance
        : 10;
  patchSettings({ dualViewDistance: d });
}

const rotXModel = computed({
  get: () => settings.value.rotationDeg.x,
  set: (v: number) => patchSettings({ rotationDeg: { x: v } }),
});

const rotYModel = computed({
  get: () => settings.value.rotationDeg.y,
  set: (v: number) => patchSettings({ rotationDeg: { y: v } }),
});

const rotZModel = computed({
  get: () => settings.value.rotationDeg.z,
  set: (v: number) => patchSettings({ rotationDeg: { z: v } }),
});

function resetPose(): void {
  patchSettings({ rotationDeg: { x: 0, y: 0, z: 0 } });
}
</script>
