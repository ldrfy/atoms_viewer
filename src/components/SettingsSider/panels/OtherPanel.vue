<template>
  <a-form layout="vertical">
    <a-form-item :label="t('viewer.theme.title')">
      <a-segmented
        v-model:value="themeModeModel"
        block
        :options="themeSegmentOptions"
      />
    </a-form-item>
    <a-form-item>
      <a-row justify="space-between" align="middle">
        <a-col>{{ t('settings.panel.other.themeReadabilityCheckOnOpen') }}</a-col>
        <a-col>
          <a-switch
            v-model:checked="themeReadabilityCheckOnOpenModel"
            :aria-label="t('settings.panel.other.themeReadabilityCheckOnOpen')"
            :title="t('settings.panel.other.themeReadabilityCheckOnOpen')"
          />
        </a-col>
      </a-row>
    </a-form-item>

    <a-form-item :label="t('settings.panel.other.visualStyle')">
      <a-select
        v-model:value="visualStyleModel"
        :options="visualStyleOptions"
        class="settings-full-width"
      />
      <a-typography-text type="secondary" class="settings-text-secondary">
        {{ t('settings.panel.other.visualStyleHint') }}
      </a-typography-text>
    </a-form-item>

    <a-form-item :label="t('settings.panel.details.modelLightIntensity')">
      <a-row :gutter="8" align="middle">
        <a-col :flex="1">
          <a-slider
            v-model:value="modelLightIntensityModel"
            :min="MODEL_LIGHT_INTENSITY_MIN"
            :max="MODEL_LIGHT_INTENSITY_MAX"
            :step="0.05"
          />
        </a-col>
        <a-col class="settings-col-compact">
          <a-input-number
            v-model:value="modelLightIntensityModel"
            :aria-label="t('settings.panel.details.modelLightIntensity')"
            :title="t('settings.panel.details.modelLightIntensity')"
            :min="MODEL_LIGHT_INTENSITY_MIN"
            :max="MODEL_LIGHT_INTENSITY_MAX"
            :step="0.05"
            class="settings-full-width"
          />
        </a-col>
      </a-row>
    </a-form-item>

    <a-form-item>
      <a-row justify="space-between" align="middle">
        <a-col>{{ t('settings.panel.other.axes') }}</a-col>
        <a-col>
          <a-switch v-model:checked="showAxesModel" :aria-label="t('settings.panel.other.axes')" :title="t('settings.panel.other.axes')" />
        </a-col>
      </a-row>
    </a-form-item>

    <a-form-item>
      <a-row justify="space-between" align="middle">
        <a-col>{{ t('settings.panel.other.autoRotateOnLoad') }}</a-col>
        <a-col>
          <a-switch
            v-model:checked="autoRotateOnLoadModel"
            :aria-label="t('settings.panel.other.autoRotateOnLoad')"
            :title="t('settings.panel.other.autoRotateOnLoad')"
          />
        </a-col>
      </a-row>
    </a-form-item>

    <a-form-item>
      <a-row justify="space-between" align="middle">
        <a-col>{{ t('settings.panel.other.refreshBondsOnPlay') }}</a-col>
        <a-col>
          <a-switch
            v-model:checked="refreshBondsOnPlayModel"
            :aria-label="t('settings.panel.other.refreshBondsOnPlay')"
            :title="t('settings.panel.other.refreshBondsOnPlay')"
          />
        </a-col>
      </a-row>
    </a-form-item>

    <a-form-item :label="t('settings.panel.other.recordFps')">
      <a-row :gutter="8" align="middle">
        <a-col :flex="1">
          <a-slider
            v-model:value="recordFpsModel"
            :min="RECORD_FPS_MIN"
            :max="RECORD_FPS_MAX"
            :step="1"
          />
        </a-col>
        <a-col class="settings-col-compact">
          <a-input-number
            v-model:value="recordFpsModel"
            :aria-label="t('settings.panel.other.recordFps')"
            :title="t('settings.panel.other.recordFps')"
            :min="RECORD_FPS_MIN"
            :max="RECORD_FPS_MAX"
            :step="1"
            class="settings-full-width"
          />
        </a-col>
      </a-row>

      <a-typography-text type="secondary" class="settings-text-secondary">
        {{ t('settings.panel.other.recordFpsHint') }}
      </a-typography-text>
    </a-form-item>

    <a-form-item v-if="isOtherDirty">
      <a-button block @click="resetOtherSettings">
        {{ t('settings.panel.other.reset') }}
      </a-button>
    </a-form-item>
  </a-form>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue';
import { useI18n } from 'vue-i18n';

import { useSettingsSiderContext } from '../useSettingsSiderContext';
import {
  RECORD_FPS_MIN,
  RECORD_FPS_MAX,
  MODEL_LIGHT_INTENSITY_MIN,
  MODEL_LIGHT_INTENSITY_MAX,
} from '../../../lib/viewer/constants';
import { DEFAULT_SETTINGS, type VisualStyleId } from '../../../lib/viewer/settings';
import { viewerApiRef } from '../../../lib/viewer/bridge';
import { settingsSiderDerivedContextKey } from '../context';
import { getThemeMode, setThemeMode, type ThemeMode } from '../../../theme/mode';
import { getVisualStylePreset, VISUAL_STYLE_PRESETS } from '../../../lib/viewer/visualStyles';

const { t } = useI18n();
const { settings, patchSettings } = useSettingsSiderContext();
const derivedContext = inject(settingsSiderDerivedContextKey, null);
const viewerApi = computed(() => viewerApiRef.value);

const showAxesModel = computed({
  get: () => settings.value.other.showAxes,
  set: (v: boolean) => patchSettings({ other: { showAxes: v } }),
});

const refreshBondsOnPlayModel = computed({
  get: () => settings.value.other.refreshBondsOnPlay ?? false,
  set: (v: boolean) => patchSettings({ other: { refreshBondsOnPlay: v } }),
});

const autoRotateOnLoadModel = computed({
  get: () => settings.value.other.autoRotateOnLoad ?? true,
  set: (v: boolean) => {
    if (!v) {
      patchSettings({
        other: { autoRotateOnLoad: false },
        rotation: {
          ...settings.value.rotation,
          enabled: false,
        },
      });
      return;
    }
    patchSettings({ other: { autoRotateOnLoad: true } });
  },
});

const recordFpsModel = computed({
  get: () => settings.value.other.frame_rate ?? 60,
  set: (v: number) => { patchSettings({ other: { frame_rate: v } }); },
});

const themeReadabilityCheckOnOpenModel = computed({
  get: () => settings.value.other.themeReadabilityCheckOnOpen ?? true,
  set: (v: boolean) => patchSettings({ other: { themeReadabilityCheckOnOpen: v } }),
});

const modelLightIntensityModel = computed({
  get: () => settings.value.other.modelLightIntensity ?? DEFAULT_SETTINGS.other.modelLightIntensity,
  set: (v: number) => patchSettings({ other: { modelLightIntensity: v } }),
});

const themeModeModel = computed<ThemeMode>({
  get: () => settings.value.other.themeMode ?? getThemeMode(),
  set: (v) => {
    setThemeMode(v);
    patchSettings({ other: { themeMode: v } });
  },
});

const themeSegmentOptions = computed(() => [
  { label: t('viewer.theme.mode.system'), value: 'system' },
  { label: t('viewer.theme.mode.light'), value: 'light' },
  { label: t('viewer.theme.mode.dark'), value: 'dark' },
]);

function applyVisualStyle(styleId: VisualStyleId): void {
  const preset = getVisualStylePreset(styleId);
  const api = viewerApi.value;
  const isDefault = styleId === 'default';
  const colorTemplate = isDefault
    ? []
    : preset.colorMapTemplate.map(r => ({ ...r, isCustom: true }));
  patchSettings({
    other: { visualStyle: styleId, modelLightIntensity: preset.display.modelLightIntensity },
    details: {
      atomScale: preset.display.atomScale,
      atomRoughness: preset.display.atomRoughness,
      bondRadius: preset.display.bondRadius,
      bondFactor: preset.display.bondFactor,
    },
    colors: {
      data: isDefault ? {} : Object.fromEntries(
        colorTemplate.map(r => [r.element, r.color]),
      ),
    },
  });
  if (!api) return;
  api.suspendSettingsSync(300);
  if (isDefault) {
    api.resetAllLayersColorMapToDefaults();
  }
  else {
    api.setAllLayersColorMap(colorTemplate);
    api.refreshColorMap({ applyToAll: true });
  }
  api.setActiveLayerDisplay(
    {
      atomScale: preset.display.atomScale,
      atomRoughness: preset.display.atomRoughness,
      bondRadius: preset.display.bondRadius,
      bondFactor: preset.display.bondFactor,
    },
    { applyToAll: true },
  );
}

const visualStyleModel = computed<VisualStyleId>({
  get: () => settings.value.other.visualStyle ?? DEFAULT_SETTINGS.other.visualStyle,
  set: (v) => {
    applyVisualStyle(v);
  },
});

const visualStyleOptions = computed(() =>
  (Object.values(VISUAL_STYLE_PRESETS) as typeof VISUAL_STYLE_PRESETS[keyof typeof VISUAL_STYLE_PRESETS][])
    .map(p => ({ label: t(p.labelKey), value: p.id })),
);

const isOtherDirty = computed(() => {
  if (derivedContext) return derivedContext.otherDirty.value;
  const styleBase = getVisualStylePreset(
    settings.value.other.visualStyle ?? DEFAULT_SETTINGS.other.visualStyle,
  ).display;
  return (
    settings.value.other.showAxes !== DEFAULT_SETTINGS.other.showAxes
    || settings.value.other.refreshBondsOnPlay !== DEFAULT_SETTINGS.other.refreshBondsOnPlay
    || settings.value.other.autoRotateOnLoad !== DEFAULT_SETTINGS.other.autoRotateOnLoad
    || settings.value.other.frame_rate !== DEFAULT_SETTINGS.other.frame_rate
    || settings.value.other.modelLightIntensity !== styleBase.modelLightIntensity
    || settings.value.other.themeMode !== DEFAULT_SETTINGS.other.themeMode
    || settings.value.other.visualStyle !== DEFAULT_SETTINGS.other.visualStyle
    || (settings.value.other.themeReadabilityCheckOnOpen ?? true)
      !== (DEFAULT_SETTINGS.other.themeReadabilityCheckOnOpen ?? true)
  );
});

function resetOtherSettings(): void {
  patchSettings({
    other: { ...DEFAULT_SETTINGS.other },
  });
  setThemeMode(DEFAULT_SETTINGS.other.themeMode);
  applyVisualStyle(DEFAULT_SETTINGS.other.visualStyle);
}
</script>
