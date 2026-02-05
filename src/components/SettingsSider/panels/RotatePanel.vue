<template>
  <a-space direction="vertical" :size="12" class="settings-full-width">
    <SettingSwitchField
      v-model:checked="autoRotateEnabledModel"
      :label="t('settings.panel.rotation.enable')"
      :disabled="!hasAnyLayer"
    />

    <SettingSelectField
      v-model:value="autoRotatePresetIdModel"
      :label="t('settings.panel.rotation.mode')"
      :hint="currentAutoRotatePresetHint"
      :options="autoRotatePresetOptions"
      :disabled="!hasAnyLayer"
    />

    <SettingSliderField
      v-model:value="autoRotateSpeedModel"
      :label="t('settings.panel.rotation.speed')"
      :hint="t('settings.panel.rotation.speedHint')"
      :min="AUTO_ROTATE_SPEED_MIN"
      :max="AUTO_ROTATE_SPEED_MAX"
      :slider-step="1"
      :disabled="!hasAnyLayer"
    />

    <SettingSwitchField
      v-model:checked="autoRotatePauseOnInteractModel"
      :label="t('settings.panel.rotation.pauseOnInteract')"
      :disabled="!hasAnyLayer"
    />

    <SettingSliderField
      v-if="autoRotatePauseOnInteractModel"
      v-model:value="autoRotateResumeDelayMsModel"
      :label="t('settings.panel.rotation.resumeDelay')"
      :min="AUTO_ROTATE_RESUME_MIN"
      :max="AUTO_ROTATE_RESUME_MAX"
      :slider-step="50"
      :disabled="!hasAnyLayer"
    />
  </a-space>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  AUTO_ROTATE_PRESETS,
  type AutoRotatePresetId,
} from '../../../lib/viewer/autoRotate';
import {
  AUTO_ROTATE_SPEED_MIN,
  AUTO_ROTATE_SPEED_MAX,
  AUTO_ROTATE_RESUME_MIN,
  AUTO_ROTATE_RESUME_MAX,
} from '../../../lib/viewer/constants';
import { DEFAULT_SETTINGS } from '../../../lib/viewer/settings';
import { PANEL_KEYS } from '../../../lib/viewer/panelKeys';

import { useSettingsSiderContext } from '../useSettingsSiderContext';
import { useSettingsSiderResetContext } from '../useSettingsSiderResetContext';
import SettingSelectField from '../parts/SettingSelectField.vue';
import SettingSliderField from '../parts/SettingSliderField.vue';
import SettingSwitchField from '../parts/SettingSwitchField.vue';

const { t } = useI18n();
const { settings, patchSettings, hasAnyLayer } = useSettingsSiderContext();

function patchAutoRotate(patch: Partial<(typeof settings.value)['rotation']>): void {
  patchSettings({
    rotation: {
      ...settings.value.rotation,
      ...patch,
    },
  });
}

const autoRotateEnabledModel = computed({
  get: () => !!settings.value.rotation.enabled,
  set: (v: boolean) => {
    patchAutoRotate({ enabled: v });
  },
});

const autoRotatePresetIdModel = computed({
  get: () => settings.value.rotation.presetId,
  set: (v: string | number) => {
    const id = String(v);
    patchAutoRotate({ presetId: id as AutoRotatePresetId, enabled: true });
  },
});

const autoRotateSpeedModel = computed({
  get: () => {
    return settings.value.rotation.speedDegPerSec;
  },
  set: (v: number) => {
    patchAutoRotate({ speedDegPerSec: v });
  },
});

const autoRotatePauseOnInteractModel = computed({
  get: () => !!settings.value.rotation.pauseOnInteract,
  set: (v: boolean) => patchAutoRotate({ pauseOnInteract: v }),
});

const autoRotateResumeDelayMsModel = computed({
  get: () => {
    return settings.value.rotation.resumeDelayMs;
  },
  set: (v: number) => {
    patchAutoRotate({ resumeDelayMs: v });
  },
});

const autoRotatePresetOptions = computed(() => {
  return AUTO_ROTATE_PRESETS.map((p) => {
    const labelKey = `settings.panel.rotation.presets.${p.id}.name`;
    const hintKey = `settings.panel.rotation.presets.${p.id}.hint`;
    return {
      id: p.id,
      value: p.id,
      label: t(labelKey),
      hint: t(hintKey),
    };
  });
});

const currentAutoRotatePresetHint = computed(() => {
  const id = autoRotatePresetIdModel.value;
  const opt = autoRotatePresetOptions.value.find(o => o.id === id);
  return opt?.hint ?? '';
});

function resetAutoRotateSettings(): void {
  patchAutoRotate({ ...DEFAULT_SETTINGS.rotation });
}

const { registerPanelReset } = useSettingsSiderResetContext();
const unregisterRotationReset = registerPanelReset(PANEL_KEYS.rotation, resetAutoRotateSettings);
onBeforeUnmount(() => {
  unregisterRotationReset();
});
</script>
