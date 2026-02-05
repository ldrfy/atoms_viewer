<template>
  <a-form layout="vertical">
    <LayerScopeControl v-model:scope="scope" />

    <a-form-item>
      <a-row class="settings-gap-top-sm" align="middle" :gutter="8">
        <a-col :span="8">
          <a-typography-text>
            {{ t('settings.panel.details.representation') }}
          </a-typography-text>
        </a-col>
        <a-col :span="16">
          <a-select
            v-model:value="representationModel"
            :options="representationOptions"
            :disabled="controlsDisabled"
          />
        </a-col>
      </a-row>
    </a-form-item>

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

    <a-form-item
      v-if="showBondsModel"
      :label="t('settings.panel.details.bondRadius')"
    >
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
        <a-col>
          <a-input-number
            v-model:value="bondRadiusModel"
            class="settings-col-compact"

            :aria-label="t('settings.panel.details.bondRadius')"
            :title="t('settings.panel.details.bondRadius')"
            :min="BOND_RADIUS_MIN"
            :max="BOND_RADIUS_MAX"
            :step="0.01"
            :disabled="controlsDisabled || !showBondsModel"
          />
        </a-col>
      </a-row>
    </a-form-item>

    <a-form-item v-if="showBondsModel" :label="t('settings.panel.details.bondFactor')">
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
        <a-col>
          <a-input-number
            v-model:value="bondFactorModel"
            class="settings-col-compact"

            :aria-label="t('settings.panel.details.bondFactor')"
            :title="t('settings.panel.details.bondFactor')"
            :min="BOND_FACTOR_MIN"
            :max="BOND_FACTOR_MAX"
            :step="0.01"
            :disabled="controlsDisabled || !showBondsModel"
          />
        </a-col>
      </a-row>
      <a-typography-text type="secondary" class="settings-text-secondary">
        {{ t('settings.panel.details.bondFactorHint') }}
      </a-typography-text>
    </a-form-item>

    <a-form-item :label="t('settings.panel.details.atomSize')">
      <a-row :gutter="8" align="middle">
        <a-col :flex="1">
          <a-slider
            v-model:value="atomScaleModel"
            :min="ATOM_SCALE_MIN"
            :max="ATOM_SCALE_MAX"
            :step="0.01"
            :disabled="controlsDisabled"
          />
        </a-col>
        <a-col>
          <a-input-number
            v-model:value="atomScaleModel"
            class="settings-col-compact"

            :aria-label="t('settings.panel.details.atomSize')"
            :title="t('settings.panel.details.atomSize')"
            :min="ATOM_SCALE_MIN"
            :max="ATOM_SCALE_MAX"
            :step="0.01"
            :disabled="controlsDisabled"
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
        <a-col>
          <a-input-number
            v-model:value="atomRoughnessModel"
            class="settings-col-compact"

            :aria-label="t('settings.panel.details.atomRoughness')"
            :title="t('settings.panel.details.atomRoughness')"
            :min="ATOM_ROUGHNESS_MIN"
            :max="ATOM_ROUGHNESS_MAX"
            :step="0.05"
            :disabled="controlsDisabled"
          />
        </a-col>
      </a-row>
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
        <a-col>
          <a-input-number
            v-model:value="sphereSegmentsModel"
            class="settings-col-compact"

            :aria-label="t('settings.panel.details.sphereSegments')"
            :title="t('settings.panel.details.sphereSegments')"
            :min="SPHERE_SEGMENTS_MIN"
            :max="SPHERE_SEGMENTS_MAX"
            :step="1"
            :disabled="controlsDisabled"
          />
        </a-col>
      </a-row>

      <a-typography-text type="secondary" class="settings-text-secondary">
        {{ t('settings.panel.details.sphereSegmentsHint') }}
      </a-typography-text>
    </a-form-item>
    <a-form-item>
      <a-row justify="space-between" align="middle">
        <a-col>{{ t('settings.panel.details.showAtomIndex') }}</a-col>
        <a-col>
          <a-switch
            v-model:checked="showAtomIndexModel"
            :aria-label="t('settings.panel.details.showAtomIndex')"
            :title="t('settings.panel.details.showAtomIndex')"
            :disabled="controlsDisabled"
          />
        </a-col>
      </a-row>
      <a-typography-text type="secondary" class="settings-text-secondary">
        {{ t('settings.panel.details.showAtomIndexHint') }}
      </a-typography-text>
    </a-form-item>

    <a-form-item>
      <a-row justify="space-between" align="middle">
        <a-col>{{ t('settings.panel.details.showElementSymbol') }}</a-col>
        <a-col>
          <a-switch
            v-model:checked="showElementSymbolModel"
            :aria-label="t('settings.panel.details.showElementSymbol')"
            :title="t('settings.panel.details.showElementSymbol')"
            :disabled="controlsDisabled"
          />
        </a-col>
      </a-row>
      <a-typography-text type="secondary" class="settings-text-secondary">
        {{ t('settings.panel.details.showElementSymbolHint') }}
      </a-typography-text>
    </a-form-item>
  </a-form>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import { DEFAULT_DETAILS, type DetailsSettingsGroup, type RepresentationId } from '../../../lib/viewer/settings';
import { viewerApiRef } from '../../../lib/viewer/bridge';
import { useSettingsSiderContext } from '../useSettingsSiderContext';
import LayerScopeControl from './LayerScopeControl.vue';
import { useLayerScope } from '../useLayerScope';
import { useSettingsSiderResetContext } from '../useSettingsSiderResetContext';
import { PANEL_KEYS } from '../../../lib/viewer/panelKeys';
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

const scope = useLayerScope('details');

const displayModel = computed<DetailsSettingsGroup | null>(() => {
  return viewerApi.value?.activeLayerDisplay.value ?? null;
});

const controlsDisabled = computed(
  () => !hasAnyLayer.value || !activeLayerInfo.value || !displayModel.value,
);

function patchDisplay(patch: Partial<DetailsSettingsGroup>): void {
  const api = viewerApi.value;
  if (!api || !activeLayerInfo.value) return;
  if (scope.value === 'visible') {
    api.setVisibleLayersDisplay(patch);
    return;
  }
  const opts = scope.value === 'all' ? { applyToAll: true } : undefined;
  api.setActiveLayerDisplay(patch, opts);
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
  get: () => displayModel.value?.atomRoughness ?? DEFAULT_DETAILS.atomRoughness,
  set: (v: number) => patchDisplay({ atomRoughness: v }),
});

const showAtomIndexModel = computed({
  get: () => displayModel.value?.showAtomIndex ?? DEFAULT_DETAILS.showAtomIndex,
  set: (v: boolean) => patchDisplay({ showAtomIndex: !!v }),
});

const showElementSymbolModel = computed({
  get: () => displayModel.value?.showElementSymbol ?? DEFAULT_DETAILS.showElementSymbol,
  set: (v: boolean) => patchDisplay({ showElementSymbol: !!v }),
});

const REPRESENTATION_PRESETS: Record<RepresentationId, Partial<DetailsSettingsGroup> | null> = {
  ballAndStick: {
    representation: 'ballAndStick',
    showBonds: true,
    atomScale: DEFAULT_DETAILS.atomScale,
    bondRadius: DEFAULT_DETAILS.bondRadius,
    sphereSegments: DEFAULT_DETAILS.sphereSegments,
  },
  stick: {
    representation: 'stick',
    showBonds: true,
    atomScale: 0.2,
    bondRadius: 0.12,
    sphereSegments: 12,
  },
  wireframe: {
    representation: 'wireframe',
    showBonds: true,
    atomScale: 0.06,
    bondRadius: 0.04,
    sphereSegments: 8,
  },
  spacefill: {
    representation: 'spacefill',
    showBonds: false,
    atomScale: 3.6,
    sphereSegments: DEFAULT_DETAILS.sphereSegments,
  },
  points: {
    representation: 'points',
    showBonds: false,
    atomScale: 0.08,
    sphereSegments: 6,
  },
  custom: {
    representation: 'custom',
  },
};

const representationOptions = computed(() => ([
  { value: 'ballAndStick', label: t('settings.panel.details.repr.ballAndStick') },
  { value: 'stick', label: t('settings.panel.details.repr.stick') },
  { value: 'wireframe', label: t('settings.panel.details.repr.wireframe') },
  { value: 'spacefill', label: t('settings.panel.details.repr.spacefill') },
  { value: 'points', label: t('settings.panel.details.repr.points') },
  { value: 'custom', label: t('settings.panel.details.repr.custom') },
] as { value: RepresentationId; label: string; disabled?: boolean }[]));

function matchRepresentation(cur: DetailsSettingsGroup | null): RepresentationId {
  if (!cur) return 'custom';
  if (cur.representation) return cur.representation;
  const eq = (a: number, b: number) => Math.abs(a - b) < 1e-6;
  const candidates = Object.entries(REPRESENTATION_PRESETS) as [RepresentationId, Partial<DetailsSettingsGroup> | null][];
  for (const [key, preset] of candidates) {
    if (!preset) continue;
    if (preset.showBonds != null && cur.showBonds !== preset.showBonds) continue;
    if (preset.atomScale != null && !eq(cur.atomScale, preset.atomScale)) continue;
    if (preset.bondRadius != null && !eq(cur.bondRadius, preset.bondRadius)) continue;
    if (preset.sphereSegments != null && cur.sphereSegments !== preset.sphereSegments) continue;
    return key;
  }
  return 'custom';
}

const representationModel = computed<RepresentationId>({
  get: () => matchRepresentation(displayModel.value),
  set: (v) => {
    const preset = REPRESENTATION_PRESETS[v];
    if (!preset) return;
    patchDisplay(preset);
  },
});

function onResetDisplay(): void {
  scope.value = 'all';
  patchDisplay({
    representation: DEFAULT_DETAILS.representation,
    atomScale: DEFAULT_DETAILS.atomScale,
    showBonds: DEFAULT_DETAILS.showBonds,
    sphereSegments: DEFAULT_DETAILS.sphereSegments,
    bondFactor: DEFAULT_DETAILS.bondFactor,
    bondRadius: DEFAULT_DETAILS.bondRadius,
    atomRoughness: DEFAULT_DETAILS.atomRoughness,
    showAtomIndex: DEFAULT_DETAILS.showAtomIndex,
    showElementSymbol: DEFAULT_DETAILS.showElementSymbol,
  });
}

const { registerPanelReset } = useSettingsSiderResetContext();
const unregisterDetailsReset = registerPanelReset(PANEL_KEYS.details, onResetDisplay);
onBeforeUnmount(() => {
  unregisterDetailsReset();
});
</script>
