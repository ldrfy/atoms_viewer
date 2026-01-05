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
        <a-col>{{ t('settings.panel.other.bonds') }}</a-col>
        <a-col>
          <a-switch v-model:checked="showBondsModel" :aria-label="t('settings.panel.other.bonds')" :title="t('settings.panel.other.bonds')" />
        </a-col>
      </a-row>
    </a-form-item>

    <a-form-item :label="t('settings.panel.other.bondFactor')">
      <a-row :gutter="8" align="middle">
        <a-col :flex="1">
          <a-slider
            v-model:value="bondFactorModel"
            :min="0.8"
            :max="1.3"
            :step="0.01"
          />
        </a-col>
        <a-col :style="{ width: '96px' }">
          <a-input-number
            v-model:value="bondFactorModel"
            :aria-label="t('settings.panel.other.bondFactor')"
            :title="t('settings.panel.other.bondFactor')"
            :min="0.8"
            :max="1.3"
            :step="0.01"
            style="width: 100%"
          />
        </a-col>
      </a-row>

      <a-typography-text type="secondary" style="display: block; margin-top: 6px">
        {{ t('settings.panel.other.bondFactorHint') }}
      </a-typography-text>
    </a-form-item>

    <a-form-item :label="t('settings.panel.other.atomSize')">
      <a-row :gutter="8" align="middle">
        <a-col :flex="1">
          <a-slider
            v-model:value="atomScaleModel"
            :min="0.2"
            :max="2"
            :step="0.05"
          />
        </a-col>
        <a-col :style="{ width: '96px' }">
          <a-input-number
            v-model:value="atomScaleModel"
            :aria-label="t('settings.panel.other.atomSize')"
            :title="t('settings.panel.other.atomSize')"
            :min="0.2"
            :max="2"
            :step="0.05"
            style="width: 100%"
          />
        </a-col>
      </a-row>
    </a-form-item>

    <a-form-item :label="t('settings.panel.other.sphereSegments')">
      <a-row :gutter="8" align="middle">
        <a-col :flex="1">
          <a-slider
            v-model:value="sphereSegmentsModel"
            :min="8"
            :max="64"
            :step="1"
          />
        </a-col>
        <a-col :style="{ width: '96px' }">
          <a-input-number
            v-model:value="sphereSegmentsModel"
            :aria-label="t('settings.panel.other.sphereSegments')"
            :title="t('settings.panel.other.sphereSegments')"
            :min="8"
            :max="64"
            :step="1"
            style="width: 100%"
          />
        </a-col>
      </a-row>

      <a-typography-text type="secondary" style="display: block; margin-top: 6px">
        {{ t('settings.panel.other.sphereSegmentsHint') }}
      </a-typography-text>
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
        <a-col :style="{ width: '96px' }">
          <a-input-number
            v-model:value="recordFpsModel"
            :aria-label="t('settings.panel.other.recordFps')"
            :title="t('settings.panel.other.recordFps')"
            :min="1"
            :max="120"
            :step="1"
            style="width: 100%"
          />
        </a-col>
      </a-row>

      <a-typography-text type="secondary" style="display: block; margin-top: 6px">
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

const showBondsModel = computed({
  get: () => settings.value.showBonds,
  set: (v: boolean) => patchSettings({ showBonds: v }),
});

const bondFactorModel = computed({
  get: () => settings.value.bondFactor ?? 1.05,
  set: (v: number) => {
    const n = Number(v);
    const clamped = Number.isFinite(n) ? Math.max(0.8, Math.min(1.3, n)) : 1.05;
    // Keep two decimals stability to reduce noisy updates.
    patchSettings({ bondFactor: Math.round(clamped * 100) / 100 });
  },
});

const refreshBondsOnPlayModel = computed({
  get: () => settings.value.refreshBondsOnPlay ?? false,
  set: (v: boolean) => patchSettings({ refreshBondsOnPlay: v }),
});

const atomScaleModel = computed({
  get: () => settings.value.atomScale,
  set: (v: number) => patchSettings({ atomScale: v }),
});

const sphereSegmentsModel = computed({
  get: () => settings.value.sphereSegments ?? 24,
  set: (v: number) => {
    const n = Math.max(8, Math.min(64, Math.floor(Number(v))));
    patchSettings({ sphereSegments: Number.isFinite(n) ? n : 24 });
  },
});

const recordFpsModel = computed({
  get: () => settings.value.frame_rate ?? 60,
  set: (v: number) => patchSettings({ frame_rate: Math.max(1, Math.min(120, Math.floor(v))) }),
});
</script>
