<template>
  <a-form layout="vertical">
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

    <a-form-item :label="t('viewer.theme.title')">
      <a-segmented
        v-model:value="themeModeModel"
        block
        :options="themeSegmentOptions"
      />
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
import { DEFAULT_SETTINGS } from '../../../lib/viewer/settings';
import { settingsSiderDerivedContextKey } from '../context';
import { getThemeMode, setThemeMode, type ThemeMode } from '../../../theme/mode';

const { t } = useI18n();
const { settings, patchSettings } = useSettingsSiderContext();
const derivedContext = inject(settingsSiderDerivedContextKey, null);

const showAxesModel = computed({
  get: () => settings.value.showAxes,
  set: (v: boolean) => patchSettings({ showAxes: v }),
});

const refreshBondsOnPlayModel = computed({
  get: () => settings.value.refreshBondsOnPlay ?? false,
  set: (v: boolean) => patchSettings({ refreshBondsOnPlay: v }),
});

const autoRotateOnLoadModel = computed({
  get: () => settings.value.autoRotateOnLoad ?? true,
  set: (v: boolean) => {
    if (!v) {
      patchSettings({
        autoRotateOnLoad: false,
        autoRotate: {
          ...settings.value.autoRotate,
          enabled: false,
          autoEnabledBySystem: false,
        },
      });
      return;
    }
    patchSettings({ autoRotateOnLoad: true });
  },
});

const recordFpsModel = computed({
  get: () => settings.value.frame_rate ?? 60,
  set: (v: number) => { patchSettings({ frame_rate: v }); },
});

const themeReadabilityCheckOnOpenModel = computed({
  get: () => settings.value.themeReadabilityCheckOnOpen ?? true,
  set: (v: boolean) => patchSettings({ themeReadabilityCheckOnOpen: v }),
});

const modelLightIntensityModel = computed({
  get: () => settings.value.modelLightIntensity ?? DEFAULT_SETTINGS.modelLightIntensity,
  set: (v: number) => patchSettings({ modelLightIntensity: v }),
});

const themeModeModel = computed<ThemeMode>({
  get: () => settings.value.themeMode ?? getThemeMode(),
  set: (v) => {
    setThemeMode(v);
    patchSettings({ themeMode: v });
  },
});

const themeSegmentOptions = computed(() => [
  { label: t('viewer.theme.mode.system'), value: 'system' },
  { label: t('viewer.theme.mode.light'), value: 'light' },
  { label: t('viewer.theme.mode.dark'), value: 'dark' },
]);

const isOtherDirty = computed(() => {
  if (derivedContext) return derivedContext.otherDirty.value;
  return (
    settings.value.showAxes !== DEFAULT_SETTINGS.showAxes
    || settings.value.refreshBondsOnPlay !== DEFAULT_SETTINGS.refreshBondsOnPlay
    || settings.value.autoRotateOnLoad !== DEFAULT_SETTINGS.autoRotateOnLoad
    || settings.value.frame_rate !== DEFAULT_SETTINGS.frame_rate
    || settings.value.modelLightIntensity !== DEFAULT_SETTINGS.modelLightIntensity
    || settings.value.themeMode !== DEFAULT_SETTINGS.themeMode
    || (settings.value.themeReadabilityCheckOnOpen ?? true)
      !== (DEFAULT_SETTINGS.themeReadabilityCheckOnOpen ?? true)
  );
});

function resetOtherSettings(): void {
  patchSettings({
    showAxes: DEFAULT_SETTINGS.showAxes,
    refreshBondsOnPlay: DEFAULT_SETTINGS.refreshBondsOnPlay,
    autoRotateOnLoad: DEFAULT_SETTINGS.autoRotateOnLoad,
    frame_rate: DEFAULT_SETTINGS.frame_rate,
    modelLightIntensity: DEFAULT_SETTINGS.modelLightIntensity,
    themeReadabilityCheckOnOpen: DEFAULT_SETTINGS.themeReadabilityCheckOnOpen,
    themeMode: DEFAULT_SETTINGS.themeMode,
  });
  setThemeMode(DEFAULT_SETTINGS.themeMode);
}
</script>
