<template>
  <a-form layout="vertical">
    <a-form-item>
      <a-row justify="space-between" align="middle">
        <a-col>{{ t('settings.panel.autoRotate.enable') }}</a-col>
        <a-col>
          <a-switch
            v-model:checked="autoRotateEnabledModel"
            :aria-label="t('settings.panel.autoRotate.enable')"
            :title="t('settings.panel.autoRotate.enable')"
          />
        </a-col>
      </a-row>
    </a-form-item>

    <a-form-item :label="t('settings.panel.autoRotate.mode')">
      <a-dropdown trigger="click">
        <a-button block>
          {{ currentAutoRotatePresetLabel }}
          <span style="margin-left: 6px; opacity: 0.75">▾</span>
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

      <a-typography-text type="secondary" style="display: block; margin-top: 6px">
        {{ currentAutoRotatePresetHint }}
      </a-typography-text>
    </a-form-item>

    <a-form-item :label="t('settings.panel.autoRotate.speed')">
      <a-row :gutter="8" align="middle">
        <a-col :flex="1">
          <a-slider
            v-model:value="autoRotateSpeedModel"
            :min="0"
            :max="120"
            :step="1"
          />
        </a-col>
        <a-col :style="{ width: '96px' }">
          <a-input-number
            v-model:value="autoRotateSpeedModel"
            :aria-label="t('settings.panel.autoRotate.speed')"
            :title="t('settings.panel.autoRotate.speed')"
            :min="0"
            :max="120"
            :step="1"
            style="width: 100%"
          />
        </a-col>
      </a-row>
      <a-typography-text type="secondary" style="display: block; margin-top: 6px">
        {{ t('settings.panel.autoRotate.speedHint') }}
      </a-typography-text>
    </a-form-item>

    <a-form-item>
      <a-row justify="space-between" align="middle">
        <a-col>{{ t('settings.panel.autoRotate.pauseOnInteract') }}</a-col>
        <a-col>
          <a-switch
            v-model:checked="autoRotatePauseOnInteractModel"
            :aria-label="t('settings.panel.autoRotate.pauseOnInteract')"
            :title="t('settings.panel.autoRotate.pauseOnInteract')"
          />
        </a-col>
      </a-row>
    </a-form-item>

    <a-form-item
      v-if="autoRotatePauseOnInteractModel"
      :label="t('settings.panel.autoRotate.resumeDelay')"
    >
      <a-row :gutter="8" align="middle">
        <a-col :flex="1">
          <a-slider
            v-model:value="autoRotateResumeDelayMsModel"
            :min="0"
            :max="2000"
            :step="50"
          />
        </a-col>
        <a-col :style="{ width: '96px' }">
          <a-input-number
            v-model:value="autoRotateResumeDelayMsModel"
            :aria-label="t('settings.panel.autoRotate.resumeDelay')"
            :title="t('settings.panel.autoRotate.resumeDelay')"
            :min="0"
            :max="2000"
            :step="50"
            style="width: 100%"
          />
        </a-col>
      </a-row>
    </a-form-item>
  </a-form>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

import {
  AUTO_ROTATE_PRESETS,
  DEFAULT_AUTO_ROTATE_PRESET_ID,
  getAutoRotatePreset,
  type AutoRotatePresetId,
} from '../../../lib/viewer/autoRotate';

import { useSettingsSiderContext } from '../useSettingsSiderContext';

const { t } = useI18n();
const { settings, patchSettings } = useSettingsSiderContext();

function patchAutoRotate(patch: Partial<(typeof settings.value)['autoRotate']>): void {
  patchSettings({
    autoRotate: {
      ...settings.value.autoRotate,
      ...patch,
      autoEnabledBySystem: false,
    },
  });
}

const autoRotateEnabledModel = computed({
  get: () => !!settings.value.autoRotate.enabled,
  set: (v: boolean) => {
    const cur = settings.value.autoRotate;
    // Legacy: earlier versions allowed a "presetId=off".
    // Now ON/OFF is controlled solely by the enable switch.
    if (v && (cur.presetId === 'off' || !cur.presetId)) {
      patchAutoRotate({ enabled: true, presetId: DEFAULT_AUTO_ROTATE_PRESET_ID });
      return;
    }
    if (!v && cur.presetId === 'off') {
      patchAutoRotate({ enabled: false, presetId: DEFAULT_AUTO_ROTATE_PRESET_ID });
      return;
    }
    patchAutoRotate({ enabled: v });
  },
});

function normalizePresetId(raw: unknown): AutoRotatePresetId {
  const s = String(raw ?? '').trim();
  if (s === '' || s === 'off') return DEFAULT_AUTO_ROTATE_PRESET_ID;
  const id = getAutoRotatePreset(s, DEFAULT_AUTO_ROTATE_PRESET_ID).id;
  return (id === 'off' ? DEFAULT_AUTO_ROTATE_PRESET_ID : (id as AutoRotatePresetId));
}

const autoRotatePresetIdModel = computed({
  // Normalize legacy preset ids to the current canonical id set.
  get: () => normalizePresetId(settings.value.autoRotate.presetId),
  set: (v: string) => {
    const id = String(v);
    patchAutoRotate({ presetId: id as AutoRotatePresetId, enabled: true });
  },
});

const autoRotateSpeedModel = computed({
  get: () => {
    const n = settings.value.autoRotate.speedDegPerSec;
    return Number.isFinite(n) ? Math.max(0, Math.min(120, n)) : 8;
  },
  set: (v: number) => {
    const n = Number.isFinite(v) ? Math.max(0, Math.min(120, v)) : 8;
    patchAutoRotate({ speedDegPerSec: n });
  },
});

const autoRotatePauseOnInteractModel = computed({
  get: () => !!settings.value.autoRotate.pauseOnInteract,
  set: (v: boolean) => patchAutoRotate({ pauseOnInteract: v }),
});

const autoRotateResumeDelayMsModel = computed({
  get: () => {
    const n = settings.value.autoRotate.resumeDelayMs;
    return Number.isFinite(n) ? Math.max(0, Math.min(2000, n)) : 600;
  },
  set: (v: number) => {
    const n = Number.isFinite(v) ? Math.max(0, Math.min(2000, v)) : 600;
    patchAutoRotate({ resumeDelayMs: n });
  },
});

const autoRotatePresetOptions = computed(() => {
  return AUTO_ROTATE_PRESETS
    // "off" is legacy; enable switch controls ON/OFF.
    .filter(p => p.id !== 'off')
    .map((p) => {
      const labelKey = `settings.panel.autoRotate.presets.${p.id}.name`;
      const hintKey = `settings.panel.autoRotate.presets.${p.id}.hint`;
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
</script>
