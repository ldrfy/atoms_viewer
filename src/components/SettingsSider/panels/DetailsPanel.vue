<template>
  <a-flex vertical gap="middle">
    <LayerScopeControl v-model:scope="scope" />

    <SettingSelectField
      v-model:value="representationModel"
      :label="t('settings.panel.details.representation')"
      :options="representationOptions"
      :disabled="controlsDisabled"
    />

    <SettingSwitchField
      v-model:checked="showBondsModel"
      :label="t('settings.panel.details.bonds')"
      :disabled="controlsDisabled"
    />

    <SettingSliderField
      v-if="showBondsModel"
      v-model:value="bondRadiusModel"
      :label="t('settings.panel.details.bondRadius')"
      :min="BOND_RADIUS_MIN"
      :max="BOND_RADIUS_MAX"
      :slider-step="0.01"
      :disabled="controlsDisabled || !showBondsModel"
    />
    <SettingSliderField
      v-if="showBondsModel"
      v-model:value="bondFactorModel"
      :label="t('settings.panel.details.bondFactor')"
      :hint="t('settings.panel.details.bondFactorHint')"
      :min="BOND_FACTOR_MIN"
      :max="BOND_FACTOR_MAX"
      :slider-step="0.01"
      :disabled="controlsDisabled || !showBondsModel"
    />

    <SettingSliderField
      v-model:value="atomScaleModel"
      :label="t('settings.panel.details.atomSize')"
      :min="ATOM_SCALE_MIN"
      :max="ATOM_SCALE_MAX"
      :slider-step="0.01"
      :disabled="controlsDisabled"
    />

    <SettingSliderField
      v-model:value="atomRoughnessModel"
      :label="t('settings.panel.details.atomRoughness')"
      :min="ATOM_ROUGHNESS_MIN"
      :max="ATOM_ROUGHNESS_MAX"
      :slider-step="0.05"
      :input-step="0.05"
      :precision="2"
      :disabled="controlsDisabled"
    />

    <SettingSliderField
      v-model:value="sphereSegmentsModel"
      :label="t('settings.panel.details.sphereSegments')"
      :hint="t('settings.panel.details.sphereSegmentsHint')"
      :min="SPHERE_SEGMENTS_MIN"
      :max="SPHERE_SEGMENTS_MAX"
      :slider-step="1"
      :disabled="controlsDisabled"
    />

    <SettingSwitchField
      v-model:checked="showAtomIndexModel"
      :label="t('settings.panel.details.showAtomIndex')"
      :hint="t('settings.panel.details.showAtomIndexHint')"
      :disabled="controlsDisabled"
    />

    <SettingSwitchField
      v-model:checked="showElementSymbolModel"
      :label="t('settings.panel.details.showElementSymbol')"
      :hint="t('settings.panel.details.showElementSymbolHint')"
      :disabled="controlsDisabled"
    />
  </a-flex>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import { DEFAULT_DETAILS, type DetailsSettingsGroup, type RepresentationId } from '../../../lib/viewer/settings';
import { viewerApiRef } from '../../../lib/viewer/bridge';
import { useSettingsSiderContext } from '../useSettingsSiderContext';
import LayerScopeControl from '../parts/LayerScopeControl.vue';
import SettingSelectField from '../parts/SettingSelectField.vue';
import SettingSliderField from '../parts/SettingSliderField.vue';
import SettingSwitchField from '../parts/SettingSwitchField.vue';
import { useLayerScope } from '../useLayerScope';
import { getDefaultLayerScope } from '../layerScopeStorage';
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
  // 先按当前生效范围恢复默认，再重置生效范围为默认值。
  // Apply reset with current scope first, then restore scope default.
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

  const defaultScope = getDefaultLayerScope('details');
  scope.value = defaultScope;
}

const { registerPanelReset } = useSettingsSiderResetContext();
const unregisterDetailsReset = registerPanelReset(PANEL_KEYS.details, onResetDisplay);
onBeforeUnmount(() => {
  unregisterDetailsReset();
});
</script>
