<template>
  <a-form layout="vertical">
    <a-form-item>
      <a-space :size="6" class="details-layer-row settings-flex-wrap">
        <a-typography-text type="secondary">
          {{ t('settings.panel.layers.applyTargets') }}:
        </a-typography-text>
        <template v-if="targetLayerInfos.length > 0">
          <a-tooltip
            v-for="l in targetLayerInfos"
            :key="l.id"
            :title="l.source?.fileName || l.id"
          >
            <a-tag class="settings-tag-full">
              <span class="settings-tag-ellipsis">
                {{ l.name || l.source?.fileName || l.id }}
              </span>
            </a-tag>
          </a-tooltip>
        </template>
        <a-typography-text v-else type="secondary">
          -
        </a-typography-text>
      </a-space>
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
import { computed, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import { DEFAULT_DETAILS, type DetailsSettingsGroup, type RepresentationId } from '../../../lib/viewer/settings';
import { viewerApiRef } from '../../../lib/viewer/bridge';
import { useSettingsSiderContext } from '../useSettingsSiderContext';
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
const { hasAnyLayer, selectedLayerIds } = useSettingsSiderContext();

const viewerApi = computed(() => viewerApiRef.value);
const layerList = computed(() => viewerApi.value?.layers.value ?? []);
const activeLayerId = computed(() => viewerApi.value?.activeLayerId.value ?? null);
const activeLayerInfo = computed(() => {
  const id = activeLayerId.value;
  if (!id) return null;
  return layerList.value.find(l => l.id === id) ?? null;
});

// Resolve target layers: selection first, otherwise active layer.
// 解析目标图层：优先选中列表，否则回退到当前图层。
const targetLayerIds = computed(() => {
  const picked = selectedLayerIds.value.filter(Boolean);
  if (picked.length > 0) return picked;
  return activeLayerId.value ? [activeLayerId.value] : [];
});
const targetLayerInfos = computed(() => {
  if (targetLayerIds.value.length === 0) return [];
  const byId = new Map(layerList.value.map(l => [l.id, l]));
  return targetLayerIds.value.map(id => byId.get(id)).filter(Boolean) as any[];
});

const displayModel = computed<DetailsSettingsGroup | null>(() => {
  return viewerApi.value?.activeLayerDisplay.value ?? null;
});

const controlsDisabled = computed(
  () => !hasAnyLayer.value || !activeLayerInfo.value || !displayModel.value,
);

function patchDisplay(patch: Partial<DetailsSettingsGroup>): void {
  const api = viewerApi.value;
  if (!api || !activeLayerInfo.value) return;
  const targets = targetLayerIds.value;
  if (targets.length === 0) return;
  api.setActiveLayerDisplay(patch, { layerIds: targets });
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

<style scoped>
.details-layer-row {
  margin-top: 8px;
  margin-bottom: 8px;
  margin-left: 2px;
}
</style>
