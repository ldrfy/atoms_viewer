<template>
  <a-form layout="vertical">
    <a-form-item class="settings-gap-top-sm">
      <a-row justify="space-between" align="middle">
        <a-col>{{ t('settings.panel.rotation.enable') }}</a-col>
        <a-col>
          <a-switch
            v-model:checked="autoRotateEnabledModel"
            :aria-label="t('settings.panel.rotation.enable')"
            :title="t('settings.panel.rotation.enable')"
            :disabled="!hasAnyLayer"
          />
        </a-col>
      </a-row>
    </a-form-item>

    <a-form-item :label="t('settings.panel.rotation.mode')">
      <a-dropdown trigger="click">
        <a-button block :disabled="!hasAnyLayer">
          {{ currentAutoRotatePresetLabel }}
          <DownOutlined class="settings-dropdown-caret" />
        </a-button>
        <template #overlay>
          <a-menu
            :selected-keys="[autoRotatePresetIdModel]"
            @click="onAutoRotatePresetClick"
          >
            <a-menu-item v-for="p in autoRotatePresetOptions" :key="p.id">
              {{ p.label }}
            </a-menu-item>
          </a-menu>
        </template>
      </a-dropdown>

      <a-typography-text type="secondary" class="settings-text-secondary">
        {{ currentAutoRotatePresetHint }}
      </a-typography-text>
    </a-form-item>

    <a-form-item :label="t('settings.panel.rotation.speed')">
      <a-row :gutter="8" align="middle">
        <a-col :flex="1">
          <a-slider
            v-model:value="autoRotateSpeedModel"
            :min="AUTO_ROTATE_SPEED_MIN"
            :max="AUTO_ROTATE_SPEED_MAX"
            :step="1"
            :disabled="!hasAnyLayer"
          />
        </a-col>
        <a-col class="settings-col-compact">
          <a-input-number
            v-model:value="autoRotateSpeedModel"
            :aria-label="t('settings.panel.rotation.speed')"
            :title="t('settings.panel.rotation.speed')"
            :min="AUTO_ROTATE_SPEED_MIN"
            :max="AUTO_ROTATE_SPEED_MAX"
            :step="1"
            :disabled="!hasAnyLayer"
            class="settings-full-width"
          />
        </a-col>
      </a-row>
      <a-typography-text type="secondary" class="settings-text-secondary">
        {{ t('settings.panel.rotation.speedHint') }}
      </a-typography-text>
    </a-form-item>

    <a-form-item>
      <a-row justify="space-between" align="middle">
        <a-col>{{ t('settings.panel.rotation.pauseOnInteract') }}</a-col>
        <a-col>
          <a-switch
            v-model:checked="autoRotatePauseOnInteractModel"
            :aria-label="t('settings.panel.rotation.pauseOnInteract')"
            :title="t('settings.panel.rotation.pauseOnInteract')"
            :disabled="!hasAnyLayer"
          />
        </a-col>
      </a-row>
    </a-form-item>

    <a-form-item
      v-if="autoRotatePauseOnInteractModel"
      class="settings-gap-bottom-sm"
      :label="t('settings.panel.rotation.resumeDelay')"
    >
      <a-row :gutter="8" align="middle">
        <a-col :flex="1">
          <a-slider
            v-model:value="autoRotateResumeDelayMsModel"
            :min="AUTO_ROTATE_RESUME_MIN"
            :max="AUTO_ROTATE_RESUME_MAX"
            :step="50"
            :disabled="!hasAnyLayer"
          />
        </a-col>
        <a-col class="settings-col-compact">
          <a-input-number
            v-model:value="autoRotateResumeDelayMsModel"
            :aria-label="t('settings.panel.rotation.resumeDelay')"
            :title="t('settings.panel.rotation.resumeDelay')"
            :min="AUTO_ROTATE_RESUME_MIN"
            :max="AUTO_ROTATE_RESUME_MAX"
            :step="50"
            :disabled="!hasAnyLayer"
            class="settings-full-width"
          />
        </a-col>
      </a-row>
    </a-form-item>
  </a-form>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import { DownOutlined } from '@ant-design/icons-vue';

import {
  AUTO_ROTATE_PRESETS,
  DEFAULT_AUTO_ROTATE_PRESET_ID,
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
  set: (v: string) => {
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
      label: t(labelKey),
      hint: t(hintKey),
    };
  });
});

const currentAutoRotatePresetLabel = computed(() => {
  const id = autoRotatePresetIdModel.value;
  const opt = autoRotatePresetOptions.value.find(o => o.id === id);
  return opt?.label ?? id;
});

const currentAutoRotatePresetHint = computed(() => {
  const id = autoRotatePresetIdModel.value;
  const opt = autoRotatePresetOptions.value.find(o => o.id === id);
  return opt?.hint ?? '';
});

function onAutoRotatePresetClick(info: any): void {
  autoRotatePresetIdModel.value = String(info?.key ?? DEFAULT_AUTO_ROTATE_PRESET_ID);
}

function resetAutoRotateSettings(): void {
  patchAutoRotate({ ...DEFAULT_SETTINGS.rotation });
}

const { registerPanelReset } = useSettingsSiderResetContext();
const unregisterRotationReset = registerPanelReset(PANEL_KEYS.rotation, resetAutoRotateSettings);
onBeforeUnmount(() => {
  unregisterRotationReset();
});
</script>
