<template>
  <a-form layout="vertical">
    <a-form-item>
      <a-row justify="space-between" align="middle">
        <a-col>
          {{ t('settings.panel.details.applyAll') }}
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
      <a-row v-if="!applyToAllLayers">
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
      </a-row>
    </a-form-item>

    <a-form-item :label="t('settings.panel.details.representation')">
      <a-select
        v-model:value="representationModel"
        :options="representationOptions"
        :disabled="controlsDisabled"
        class="settings-full-width"
      />
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
            :step="0.01"
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
            :step="0.01"
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
  </a-form>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { DEFAULT_DETAILS, type DetailsSettingsGroup, type RepresentationId } from '../../../lib/viewer/settings';
import { viewerApiRef } from '../../../lib/viewer/bridge';
import { useSettingsSiderContext } from '../useSettingsSiderContext';
import { readApplyAllLayersFlags, writeApplyAllLayersFlags } from '../applyAllStorage';
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
const { hasAnyLayer, patchSettings, settings } = useSettingsSiderContext();

const viewerApi = computed(() => viewerApiRef.value);
const layerList = computed(() => viewerApi.value?.layers.value ?? []);
const activeLayerId = computed(() => viewerApi.value?.activeLayerId.value ?? null);
const activeLayerInfo = computed(() => {
  const id = activeLayerId.value;
  if (!id) return null;
  return layerList.value.find(l => l.id === id) ?? null;
});

const applyToAllLayers = ref(
  settings.value.details.applyAllLayers ?? readApplyAllLayersFlags().details ?? true,
);

watch(
  applyToAllLayers,
  (v) => {
    writeApplyAllLayersFlags({ details: v });
    patchSettings({ details: { applyAllLayers: v } });
    if (!v) return;
    const api = viewerApi.value;
    const cur = displayModel.value;
    if (!api || !cur) return;
    api.setActiveLayerDisplay({ ...cur }, { applyToAll: true });
    patchSettings({
      details: {
        representation: cur.representation,
        atomScale: cur.atomScale,
        showBonds: cur.showBonds,
        sphereSegments: cur.sphereSegments,
        bondFactor: cur.bondFactor,
        bondRadius: cur.bondRadius,
        atomRoughness: cur.atomRoughness,
      },
    });
  },
);

watch(
  () => settings.value.details.applyAllLayers,
  (v) => {
    if (typeof v !== 'boolean') return;
    if (v === applyToAllLayers.value) return;
    applyToAllLayers.value = v;
  },
  { immediate: true },
);

const displayModel = computed<DetailsSettingsGroup | null>(() => {
  return viewerApi.value?.activeLayerDisplay.value ?? null;
});

const controlsDisabled = computed(
  () => !hasAnyLayer.value || !activeLayerInfo.value || !displayModel.value,
);

function patchDisplay(patch: Partial<DetailsSettingsGroup>): void {
  const api = viewerApi.value;
  if (!api || !activeLayerInfo.value) return;
  api.setActiveLayerDisplay(patch, { applyToAll: applyToAllLayers.value });
  if (!applyToAllLayers.value) return;
  const cur = displayModel.value ?? DEFAULT_DETAILS;
  const next = { ...cur, ...patch };
  patchSettings({
    details: {
      representation: next.representation,
      atomScale: next.atomScale,
      showBonds: next.showBonds,
      sphereSegments: next.sphereSegments,
      bondFactor: next.bondFactor,
      bondRadius: next.bondRadius,
      atomRoughness: next.atomRoughness,
    },
  });
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
  applyToAllLayers.value = DEFAULT_DETAILS.applyAllLayers ?? true;
  patchDisplay({
    representation: DEFAULT_DETAILS.representation,
    atomScale: DEFAULT_DETAILS.atomScale,
    showBonds: DEFAULT_DETAILS.showBonds,
    sphereSegments: DEFAULT_DETAILS.sphereSegments,
    bondFactor: DEFAULT_DETAILS.bondFactor,
    bondRadius: DEFAULT_DETAILS.bondRadius,
    atomRoughness: DEFAULT_DETAILS.atomRoughness,
  });
}

const { registerPanelReset } = useSettingsSiderResetContext();
const unregisterDetailsReset = registerPanelReset(PANEL_KEYS.details, onResetDisplay);
onBeforeUnmount(() => {
  unregisterDetailsReset();
});
</script>
