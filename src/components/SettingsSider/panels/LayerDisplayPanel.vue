<template>
  <a-form layout="vertical">
    <a-alert type="info" show-icon :message="t('settings.panel.layerDisplay.alert')" />

    <a-space :size="6" class="settings-gap-top-sm settings-flex-wrap">
      <a-typography-text type="secondary">
        {{ t('settings.panel.layerDisplay.currentLayer') }}:
      </a-typography-text>
      <a-tooltip v-if="activeLayerInfo" :title="activeLayerInfo.sourceFileName || activeLayerInfo.id">
        <a-tag class="settings-tag-full">
          <span class="settings-tag-ellipsis">
            {{ activeLayerInfo.name }}
          </span>
        </a-tag>
      </a-tooltip>
      <a-typography-text v-else type="secondary">
        -
      </a-typography-text>
    </a-space>

    <a-row justify="space-between" align="middle" class="settings-gap-top-sm">
      <a-col>
        <a-typography-text type="secondary">
          {{ t('settings.panel.layerDisplay.applyAll') }}
        </a-typography-text>
      </a-col>
      <a-col>
        <a-switch
          v-model:checked="applyToAllLayers"
          :disabled="!hasAnyLayer"
          :aria-label="t('settings.panel.layerDisplay.applyAll')"
          :title="t('settings.panel.layerDisplay.applyAll')"
        />
      </a-col>
    </a-row>

    <a-typography-text type="secondary" class="settings-text-secondary settings-text-secondary-compact">
      {{ t('settings.panel.layerDisplay.hint') }}
    </a-typography-text>

    <a-form-item>
      <a-row justify="space-between" align="middle">
        <a-col>{{ t('settings.panel.layerDisplay.bonds') }}</a-col>
        <a-col>
          <a-switch
            v-model:checked="showBondsModel"
            :disabled="controlsDisabled"
            :aria-label="t('settings.panel.layerDisplay.bonds')"
            :title="t('settings.panel.layerDisplay.bonds')"
          />
        </a-col>
      </a-row>
    </a-form-item>

    <a-form-item :label="t('settings.panel.layerDisplay.bondFactor')">
      <a-row :gutter="8" align="middle">
        <a-col :flex="1">
          <a-slider
            v-model:value="bondFactorModel"
            :min="0.8"
            :max="1.3"
            :step="0.01"
            :disabled="controlsDisabled || !showBondsModel"
          />
        </a-col>
        <a-col class="settings-col-compact">
          <a-input-number
            v-model:value="bondFactorModel"
            :aria-label="t('settings.panel.layerDisplay.bondFactor')"
            :title="t('settings.panel.layerDisplay.bondFactor')"
            :min="0.8"
            :max="1.3"
            :step="0.01"
            :disabled="controlsDisabled || !showBondsModel"
            class="settings-full-width"
          />
        </a-col>
      </a-row>

      <a-typography-text type="secondary" class="settings-text-secondary">
        {{ t('settings.panel.layerDisplay.bondFactorHint') }}
      </a-typography-text>
    </a-form-item>

    <a-form-item :label="t('settings.panel.layerDisplay.bondRadius')">
      <a-row :gutter="8" align="middle">
        <a-col :flex="1">
          <a-slider
            v-model:value="bondRadiusModel"
            :min="0.03"
            :max="0.2"
            :step="0.01"
            :disabled="controlsDisabled || !showBondsModel"
          />
        </a-col>
        <a-col class="settings-col-compact">
          <a-input-number
            v-model:value="bondRadiusModel"
            :aria-label="t('settings.panel.layerDisplay.bondRadius')"
            :title="t('settings.panel.layerDisplay.bondRadius')"
            :min="0.03"
            :max="0.2"
            :step="0.01"
            :disabled="controlsDisabled || !showBondsModel"
            class="settings-full-width"
          />
        </a-col>
      </a-row>
    </a-form-item>

    <a-form-item :label="t('settings.panel.layerDisplay.atomSize')">
      <a-row :gutter="8" align="middle">
        <a-col :flex="1">
          <a-slider
            v-model:value="atomScaleModel"
            :min="0.2"
            :max="2"
            :step="0.05"
            :disabled="controlsDisabled"
          />
        </a-col>
        <a-col class="settings-col-compact">
          <a-input-number
            v-model:value="atomScaleModel"
            :aria-label="t('settings.panel.layerDisplay.atomSize')"
            :title="t('settings.panel.layerDisplay.atomSize')"
            :min="0.2"
            :max="2"
            :step="0.05"
            :disabled="controlsDisabled"
            class="settings-full-width"
          />
        </a-col>
      </a-row>
    </a-form-item>

    <a-form-item :label="t('settings.panel.layerDisplay.sphereSegments')">
      <a-row :gutter="8" align="middle">
        <a-col :flex="1">
          <a-slider
            v-model:value="sphereSegmentsModel"
            :min="8"
            :max="64"
            :step="1"
            :disabled="controlsDisabled"
          />
        </a-col>
        <a-col class="settings-col-compact">
          <a-input-number
            v-model:value="sphereSegmentsModel"
            :aria-label="t('settings.panel.layerDisplay.sphereSegments')"
            :title="t('settings.panel.layerDisplay.sphereSegments')"
            :min="8"
            :max="64"
            :step="1"
            :disabled="controlsDisabled"
            class="settings-full-width"
          />
        </a-col>
      </a-row>

      <a-typography-text type="secondary" class="settings-text-secondary">
        {{ t('settings.panel.layerDisplay.sphereSegmentsHint') }}
      </a-typography-text>
    </a-form-item>

    <a-form-item>
      <a-button block :disabled="controlsDisabled" @click="onResetDisplay">
        {{ t('settings.panel.layerDisplay.reset') }}
      </a-button>
    </a-form-item>
  </a-form>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { DEFAULT_LAYER_DISPLAY, type LayerDisplaySettings } from '../../../lib/viewer/settings';
import { viewerApiRef } from '../../../lib/viewer/bridge';
import { useSettingsSiderContext } from '../useSettingsSiderContext';

const { t } = useI18n();
const { hasAnyLayer } = useSettingsSiderContext();

const viewerApi = computed(() => viewerApiRef.value);
const layerList = computed(() => viewerApi.value?.layers.value ?? []);
const activeLayerId = computed(() => viewerApi.value?.activeLayerId.value ?? null);
const activeLayerInfo = computed(() => {
  const id = activeLayerId.value;
  if (!id) return null;
  return layerList.value.find(l => l.id === id) ?? null;
});

const applyToAllLayers = ref(false);

const displayModel = computed<LayerDisplaySettings | null>(() => {
  return viewerApi.value?.activeLayerDisplay.value ?? null;
});

const controlsDisabled = computed(
  () => !hasAnyLayer.value || !activeLayerInfo.value || !displayModel.value,
);

function patchDisplay(patch: Partial<LayerDisplaySettings>): void {
  const api = viewerApi.value;
  if (!api || !activeLayerInfo.value) return;
  api.setActiveLayerDisplay(patch, { applyToAll: applyToAllLayers.value });
}

const showBondsModel = computed({
  get: () => displayModel.value?.showBonds ?? false,
  set: (v: boolean) => patchDisplay({ showBonds: !!v }),
});

const bondFactorModel = computed({
  get: () => displayModel.value?.bondFactor ?? 1.05,
  set: (v: number) => {
    const n = Number(v);
    const clamped = Number.isFinite(n) ? Math.max(0.8, Math.min(1.3, n)) : 1.05;
    patchDisplay({ bondFactor: Math.round(clamped * 100) / 100 });
  },
});

const bondRadiusModel = computed({
  get: () => displayModel.value?.bondRadius ?? 0.09,
  set: (v: number) => {
    const n = Number(v);
    const clamped = Number.isFinite(n) ? Math.max(0.03, Math.min(0.2, n)) : 0.09;
    patchDisplay({ bondRadius: Math.round(clamped * 100) / 100 });
  },
});

const atomScaleModel = computed({
  get: () => displayModel.value?.atomScale ?? 1,
  set: (v: number) => {
    const n = Number(v);
    const clamped = Number.isFinite(n) ? Math.max(0.2, Math.min(2, n)) : 1;
    patchDisplay({ atomScale: Math.round(clamped * 100) / 100 });
  },
});

const sphereSegmentsModel = computed({
  get: () => displayModel.value?.sphereSegments ?? 24,
  set: (v: number) => {
    const n = Math.floor(Number(v));
    const clamped = Number.isFinite(n) ? Math.max(8, Math.min(64, n)) : 24;
    patchDisplay({ sphereSegments: clamped });
  },
});

function onResetDisplay(): void {
  patchDisplay({
    atomScale: DEFAULT_LAYER_DISPLAY.atomScale,
    showBonds: DEFAULT_LAYER_DISPLAY.showBonds,
    sphereSegments: DEFAULT_LAYER_DISPLAY.sphereSegments,
    bondFactor: DEFAULT_LAYER_DISPLAY.bondFactor,
    bondRadius: DEFAULT_LAYER_DISPLAY.bondRadius,
  });
}
</script>
