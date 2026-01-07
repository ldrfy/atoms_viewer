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

    <a-form-item :label="t('settings.panel.other.recordFps')">
      <a-row :gutter="8" align="middle">
        <a-col :flex="1">
          <a-slider
            v-model:value="recordFpsModel"
            :min="1"
            :max="120"
            :step="1"
          />
        </a-col>
        <a-col class="settings-col-compact">
          <a-input-number
            v-model:value="recordFpsModel"
            :aria-label="t('settings.panel.other.recordFps')"
            :title="t('settings.panel.other.recordFps')"
            :min="1"
            :max="120"
            :step="1"
            class="settings-full-width"
          />
        </a-col>
      </a-row>

      <a-typography-text type="secondary" class="settings-text-secondary">
        {{ t('settings.panel.other.recordFpsHint') }}
      </a-typography-text>
    </a-form-item>
  </a-form>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

import { useSettingsSiderContext } from '../useSettingsSiderContext';

const { t } = useI18n();
const { settings, patchSettings } = useSettingsSiderContext();

const showAxesModel = computed({
  get: () => settings.value.showAxes,
  set: (v: boolean) => patchSettings({ showAxes: v }),
});

const refreshBondsOnPlayModel = computed({
  get: () => settings.value.refreshBondsOnPlay ?? false,
  set: (v: boolean) => patchSettings({ refreshBondsOnPlay: v }),
});

const recordFpsModel = computed({
  get: () => settings.value.frame_rate ?? 60,
  set: (v: number) => patchSettings({ frame_rate: Math.max(1, Math.min(120, Math.floor(v))) }),
});
</script>
