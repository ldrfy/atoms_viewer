<template>
  <a-form layout="vertical">
    <a-form-item :label="t('settings.panel.files.export.header')">
      <!-- 倍率 + 透明：同一行，两端对齐（移动端更紧凑） -->
      <a-row justify="space-between" align="middle" :gutter="8">
        <a-col>
          <a-input-number
            v-model:value="exportScale"
            aria-label="Export scale"
            title="Export scale"
            :min="1"
            :max="5"
            :step="0.1"
            :precision="1"
            style="width: 140px"
          />
        </a-col>
        <a-col>
          <a-checkbox v-model:checked="exportTransparent">
            {{ t('settings.panel.files.export.transparent') }}
          </a-checkbox>
        </a-col>
      </a-row>

      <div style="margin-top: 8px">
        <a-button
          block
          type="primary"
          :disabled="!hasAnyLayer"
          @click="onExport"
        >
          {{ t('settings.panel.files.export.button') }}
        </a-button>
      </div>

      <a-typography-text
        type="secondary"
        style="display: block; margin-top: 6px"
      >
        {{ t('settings.panel.files.export.hint') }}
      </a-typography-text>
    </a-form-item>

    <a-divider style="margin: 8px 0" />

    <a-form-item :label="t('settings.panel.files.parse.header')">
      <a-space direction="vertical" :size="6" style="width: 100%">
        <a-select
          v-model:value="parseModeModel"
          :aria-label="t('viewer.parse.mode')"
          :title="t('viewer.parse.mode')"
          :options="parseModeOptions"
          :disabled="!hasAnyLayer"
          style="width: 100%"
        />

        <a-alert
          v-if="viewerApi?.parseInfo.success === false"
          type="error"
          show-icon
          :description="viewerApi?.parseInfo.errorMsg || '-'"
        />

        <a-descriptions size="small" :column="1" bordered>
          <a-descriptions-item :label="t('viewer.parse.format')">
            <a-tag>{{ viewerApi?.parseInfo.format || '-' }}</a-tag>
          </a-descriptions-item>
          <a-descriptions-item :label="t('viewer.parse.file')">
            <span style="word-break: break-all">{{
              viewerApi?.parseInfo.fileName || '-'
            }}</span>
          </a-descriptions-item>
          <a-descriptions-item :label="t('viewer.parse.atoms')">
            {{ viewerApi?.parseInfo.atomCount ?? 0 }}
          </a-descriptions-item>
          <a-descriptions-item
            v-if="(viewerApi?.parseInfo.frameCount ?? 0) > 1"
            :label="t('viewer.parse.frames')"
          >
            {{ viewerApi?.parseInfo.frameCount }}
          </a-descriptions-item>
        </a-descriptions>
      </a-space>
    </a-form-item>
  </a-form>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import { viewerApiRef } from '../../../lib/viewer/bridge';
import type { ParseMode } from '../../../lib/structure/parse';

const { t } = useI18n();

const viewerApi = computed(() => viewerApiRef.value);
const hasAnyLayer = computed(() => (viewerApi.value?.layers.value.length ?? 0) > 0);

const exportScale = ref<number>(2);
const exportTransparent = ref<boolean>(true);

const parseModeModel = computed<ParseMode>({
  get: () => viewerApi.value?.parseMode.value ?? 'auto',
  set: v => viewerApi.value?.setParseMode(v),
});

const parseModeOptions = computed(() => [
  { value: 'auto' as const, label: t('viewer.parse.modeOptions.auto') },
  { value: 'xyz' as const, label: t('viewer.parse.modeOptions.xyz') },
  { value: 'pdb' as const, label: t('viewer.parse.modeOptions.pdb') },
  { value: 'lammpsdump' as const, label: t('viewer.parse.modeOptions.lammpsdump') },
  { value: 'lammpsdata' as const, label: t('viewer.parse.modeOptions.lammpsdata') },
]);

function onExport(): void {
  if (!viewerApi.value) return;
  void viewerApi.value.exportPng({
    scale: exportScale.value,
    transparent: exportTransparent.value,
  });
}
</script>
