<template>
  <a-form layout="vertical">
    <a-alert type="info" show-icon :message="t('settings.panel.details.alert')" />

    <a-space :size="6" class="settings-gap-top-sm settings-flex-wrap">
      <a-typography-text type="secondary">
        {{ t('settings.panel.details.currentLayer') }}:
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
          {{ t('settings.panel.details.applyAll') }}
        </a-typography-text>
      </a-col>
      <a-col>
        <a-switch
          v-model:checked="applyToAllLayers"
          :disabled="!hasAnyLayer"
          :aria-label="t('settings.panel.details.applyAll')"
          :title="t('settings.panel.details.applyAll')"
        />
      </a-col>
    </a-row>

    <a-typography-text type="secondary" class="settings-text-secondary settings-text-secondary-compact">
      {{ t('settings.panel.details.hint') }}
    </a-typography-text>

    <a-form-item>
      <a-row justify="space-between" align="middle">
        <a-col>{{ t('settings.panel.details.bonds') }}</a-col>
        <a-col>
          <a-switch
            v-model:checked="showBondsModel"
            :disabled="controlsDisabled"
            :aria-label="t('settings.panel.details.bonds')"
            :title="t('settings.panel.details.bonds')"
          />
        </a-col>
      </a-row>
    </a-form-item>

    <a-form-item :label="t('settings.panel.details.bondRadius')">
      <a-row :gutter="8" align="middle">
        <a-col :flex="1">
          <a-slider
            v-model:value="bondRadiusModel"
            :min="BOND_RADIUS_MIN"
            :max="BOND_RADIUS_MAX"
            :step="0.01"
            :disabled="controlsDisabled || !showBondsModel"
          />
        </a-col>
        <a-col class="settings-col-compact">
          <a-input-number
            v-model:value="bondRadiusModel"
            :aria-label="t('settings.panel.details.bondRadius')"
            :title="t('settings.panel.details.bondRadius')"
            :min="BOND_RADIUS_MIN"
            :max="BOND_RADIUS_MAX"
            :step="0.01"
            :disabled="controlsDisabled || !showBondsModel"
            class="settings-full-width"
          />
        </a-col>
      </a-row>
    </a-form-item>

    <a-form-item :label="t('settings.panel.details.atomSize')">
      <a-row :gutter="8" align="middle">
        <a-col :flex="1">
          <a-slider
            v-model:value="atomScaleModel"
            :min="ATOM_SCALE_MIN"
            :max="ATOM_SCALE_MAX"
            :step="0.05"
            :disabled="controlsDisabled"
          />
        </a-col>
        <a-col class="settings-col-compact">
          <a-input-number
            v-model:value="atomScaleModel"
            :aria-label="t('settings.panel.details.atomSize')"
            :title="t('settings.panel.details.atomSize')"
            :min="ATOM_SCALE_MIN"
            :max="ATOM_SCALE_MAX"
            :step="0.05"
            :disabled="controlsDisabled"
            class="settings-full-width"
          />
        </a-col>
      </a-row>
    </a-form-item>

    <a-form-item :label="t('settings.panel.details.atomRoughness')">
      <a-row :gutter="8" align="middle">
        <a-col :flex="1">
          <a-slider
            v-model:value="atomRoughnessModel"
            :min="ATOM_ROUGHNESS_MIN"
            :max="ATOM_ROUGHNESS_MAX"
            :step="0.05"
            :disabled="controlsDisabled"
          />
        </a-col>
        <a-col class="settings-col-compact">
          <a-input-number
            v-model:value="atomRoughnessModel"
            :aria-label="t('settings.panel.details.atomRoughness')"
            :title="t('settings.panel.details.atomRoughness')"
            :min="ATOM_ROUGHNESS_MIN"
            :max="ATOM_ROUGHNESS_MAX"
            :step="0.05"
            :disabled="controlsDisabled"
            class="settings-full-width"
          />
        </a-col>
      </a-row>
    </a-form-item>

    <a-form-item :label="t('settings.panel.details.bondFactor')">
      <a-row :gutter="8" align="middle">
        <a-col :flex="1">
          <a-slider
            v-model:value="bondFactorModel"
            :min="BOND_FACTOR_MIN"
            :max="BOND_FACTOR_MAX"
            :step="0.01"
            :disabled="controlsDisabled || !showBondsModel"
          />
        </a-col>
        <a-col class="settings-col-compact">
          <a-input-number
            v-model:value="bondFactorModel"
            :aria-label="t('settings.panel.details.bondFactor')"
            :title="t('settings.panel.details.bondFactor')"
            :min="BOND_FACTOR_MIN"
            :max="BOND_FACTOR_MAX"
            :step="0.01"
            :disabled="controlsDisabled || !showBondsModel"
            class="settings-full-width"
          />
        </a-col>
      </a-row>
      <a-typography-text type="secondary" class="settings-text-secondary">
        {{ t('settings.panel.details.bondFactorHint') }}
      </a-typography-text>
    </a-form-item>

    <a-form-item :label="t('settings.panel.details.sphereSegments')">
      <a-row :gutter="8" align="middle">
        <a-col :flex="1">
          <a-slider
            v-model:value="sphereSegmentsModel"
            :min="SPHERE_SEGMENTS_MIN"
            :max="SPHERE_SEGMENTS_MAX"
            :step="1"
            :disabled="controlsDisabled"
          />
        </a-col>
        <a-col class="settings-col-compact">
          <a-input-number
            v-model:value="sphereSegmentsModel"
            :aria-label="t('settings.panel.details.sphereSegments')"
            :title="t('settings.panel.details.sphereSegments')"
            :min="SPHERE_SEGMENTS_MIN"
            :max="SPHERE_SEGMENTS_MAX"
            :step="1"
            :disabled="controlsDisabled"
            class="settings-full-width"
          />
        </a-col>
      </a-row>

      <a-typography-text type="secondary" class="settings-text-secondary">
        {{ t('settings.panel.details.sphereSegmentsHint') }}
      </a-typography-text>
    </a-form-item>

    <a-form-item v-if="detailsDirty">
      <a-button block :disabled="controlsDisabled" @click="onResetDisplay">
        {{ t('settings.panel.details.reset') }}
      </a-button>
    </a-form-item>
  </a-form>
</template>

<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { DEFAULT_LAYER_DISPLAY, type LayerDisplaySettings } from '../../../lib/viewer/settings';
import { viewerApiRef } from '../../../lib/viewer/bridge';
import { useSettingsSiderContext } from '../useSettingsSiderContext';
import { settingsSiderDerivedContextKey } from '../context';
import {
  ATOM_ROUGHNESS_MIN,
  ATOM_ROUGHNESS_MAX,
  ATOM_SCALE_MIN,
  ATOM_SCALE_MAX,
  BOND_FACTOR_MIN,
  BOND_FACTOR_MAX,
  BOND_RADIUS_MIN,
  BOND_RADIUS_MAX,
  SPHERE_SEGMENTS_MIN,
  SPHERE_SEGMENTS_MAX,
} from '../../../lib/viewer/constants';

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

const applyToAllLayers = ref(true);

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
  set: (v: number) => patchDisplay({ bondFactor: v }),
});

const bondRadiusModel = computed({
  get: () => displayModel.value?.bondRadius ?? 0.09,
  set: (v: number) => patchDisplay({ bondRadius: v }),
});

const atomScaleModel = computed({
  get: () => displayModel.value?.atomScale ?? 1,
  set: (v: number) => patchDisplay({ atomScale: v }),
});

const sphereSegmentsModel = computed({
  get: () => displayModel.value?.sphereSegments ?? 24,
  set: (v: number) => patchDisplay({ sphereSegments: v }),
});

const atomRoughnessModel = computed({
  get: () => displayModel.value?.atomRoughness ?? DEFAULT_LAYER_DISPLAY.atomRoughness,
  set: (v: number) => patchDisplay({ atomRoughness: v }),
});

const derivedContext = inject(settingsSiderDerivedContextKey, null);
const detailsDirty = computed(() => {
  if (derivedContext) return derivedContext.detailsDirty.value;
  const cur = displayModel.value ?? DEFAULT_LAYER_DISPLAY;
  return (
    cur.atomScale !== DEFAULT_LAYER_DISPLAY.atomScale
    || cur.showBonds !== DEFAULT_LAYER_DISPLAY.showBonds
    || cur.sphereSegments !== DEFAULT_LAYER_DISPLAY.sphereSegments
    || cur.bondFactor !== DEFAULT_LAYER_DISPLAY.bondFactor
    || cur.bondRadius !== DEFAULT_LAYER_DISPLAY.bondRadius
    || cur.atomRoughness !== DEFAULT_LAYER_DISPLAY.atomRoughness
  );
});

function onResetDisplay(): void {
  patchDisplay({
    atomScale: DEFAULT_LAYER_DISPLAY.atomScale,
    showBonds: DEFAULT_LAYER_DISPLAY.showBonds,
    sphereSegments: DEFAULT_LAYER_DISPLAY.sphereSegments,
    bondFactor: DEFAULT_LAYER_DISPLAY.bondFactor,
    bondRadius: DEFAULT_LAYER_DISPLAY.bondRadius,
    atomRoughness: DEFAULT_LAYER_DISPLAY.atomRoughness,
  });
}
</script>
