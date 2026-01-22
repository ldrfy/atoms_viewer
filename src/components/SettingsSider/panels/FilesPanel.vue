<template>
  <a-form layout="vertical">
    <a-form-item :label="t('settings.panel.files.export.header')">
      <!-- 倍率 + 透明：同一行，两端对齐（移动端更紧凑） -->
      <a-row justify="space-between" align="middle" :gutter="8">
        <a-col>
          <a-input-number
            v-model:value="exportScale"
            :aria-label="t('settings.panel.files.export.scaleLabel')"
            :title="t('settings.panel.files.export.scaleLabel')"
            :min="1"
            :max="10"
            :step="0.1"
            :precision="1"
            class="settings-input-wide"
          />
        </a-col>
        <a-col>
          <a-checkbox v-model:checked="exportTransparent">
            {{ t('settings.panel.files.export.transparent') }}
          </a-checkbox>
        </a-col>
      </a-row>

      <div class="settings-gap-top-sm">
        <a-button
          block
          type="primary"
          :disabled="!hasAnyLayer"
          @click="onExport"
        >
          {{ t('settings.panel.files.export.button') }}
        </a-button>
      </div>
      <div class="settings-gap-top-sm">
        <a-button
          block
          :disabled="!hasAnyLayer"
          @click="onExportSelect"
        >
          {{ t('settings.panel.files.export.selectButton') }}
        </a-button>
      </div>

      <a-typography-text
        type="secondary"
        class="settings-text-secondary"
      >
        {{ t('settings.panel.files.export.hint') }}
      </a-typography-text>
    </a-form-item>

    <a-form-item :label="t('settings.panel.files.project.header')">
      <a-space direction="vertical" :size="6" class="settings-full-width">
        <a-button
          block
          :disabled="!hasAnyLayer"
          @click="onExportProject"
        >
          {{ t('settings.panel.files.project.export') }}
        </a-button>
        <a-button block @click="onImportProject">
          {{ t('settings.panel.files.project.import') }}
        </a-button>
      </a-space>

      <a-row justify="space-between" align="middle" class="settings-gap-top-sm">
        <a-col>
          <a-typography-text type="secondary">
            {{ t('settings.panel.files.project.cacheRemote') }}
          </a-typography-text>
        </a-col>
        <a-col>
          <a-switch
            v-model:checked="cacheRemoteModel"
            :aria-label="t('settings.panel.files.project.cacheRemote')"
            :title="t('settings.panel.files.project.cacheRemote')"
          />
        </a-col>
      </a-row>

      <a-typography-text type="secondary" class="settings-text-secondary">
        {{ t('settings.panel.files.project.hint') }}
      </a-typography-text>

      <input
        ref="projectInputRef"
        class="settings-import-input"
        type="file"
        accept=".zip,application/zip"
        hidden
        @change="onProjectFilePicked"
      >
    </a-form-item>

    <a-divider class="settings-divider" />

    <a-form-item :label="t('settings.panel.files.parse.header')">
      <a-space direction="vertical" :size="6" class="settings-full-width">
        <a-select
          v-model:value="parseModeModel"
          :aria-label="t('viewer.parse.mode')"
          :title="t('viewer.parse.mode')"
          :options="parseModeOptions"
          :disabled="!canChangeParseMode"
          class="settings-full-width"
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
            <span class="settings-word-break">{{
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
import { computed, inject, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { message } from 'ant-design-vue';

import { viewerApiRef } from '../../../lib/viewer/bridge';
import { settingsSiderDirtyContextKey } from '../context';
import { useSettingsSiderContext } from '../useSettingsSiderContext';
import { PANEL_KEYS } from '../../../lib/viewer/panelKeys';
import type { ParseMode } from '../../../lib/structure/parse';
import { buildParseModeOptions } from '../../../lib/structure/parseOptions';
import { DEFAULT_SETTINGS } from '../../../lib/viewer/settings';
import { buildProjectZip, parseProjectZip } from '../../../lib/viewer/projectPackage';

const { t } = useI18n();
const { hasAnyLayer, settings, patchSettings } = useSettingsSiderContext();

const viewerApi = computed(() => viewerApiRef.value);
const projectInputRef = ref<HTMLInputElement | null>(null);
// Allow switching parse mode even if no layer was created, as long as a file was attempted.
const canChangeParseMode = computed(() => {
  const api = viewerApi.value;
  if (!api) return false;
  if (hasAnyLayer.value) return true;
  const fn = api.parseInfo?.fileName;
  return typeof fn === 'string' && fn.trim().length > 0;
});

const DEFAULT_EXPORT_SCALE = DEFAULT_SETTINGS.exportPngScale;
const DEFAULT_EXPORT_TRANSPARENT = DEFAULT_SETTINGS.exportPngTransparent;
const DEFAULT_PARSE_MODE: ParseMode = 'auto';

const exportScale = computed<number>({
  get: () => settings.value.exportPngScale ?? DEFAULT_EXPORT_SCALE,
  set: (v) => {
    patchSettings({ exportPngScale: v });
  },
});

const exportTransparent = computed<boolean>({
  get: () => settings.value.exportPngTransparent ?? DEFAULT_EXPORT_TRANSPARENT,
  set: (v) => {
    patchSettings({ exportPngTransparent: v });
  },
});

const parseModeModel = computed<ParseMode>({
  get: () => viewerApi.value?.parseMode.value ?? 'auto',
  set: v => viewerApi.value?.setParseMode(v),
});

const parseModeOptions = computed(() => buildParseModeOptions(t));
const cacheRemoteModel = computed<boolean>({
  get: () => viewerApi.value?.cacheRemoteOnExport?.value ?? false,
  set: (v) => {
    viewerApi.value?.setCacheRemoteOnExport?.(!!v);
  },
});

const dirtyContext = inject(settingsSiderDirtyContextKey, null);

const isDirty = computed(() => {
  return (
    exportScale.value !== DEFAULT_EXPORT_SCALE
    || exportTransparent.value !== DEFAULT_EXPORT_TRANSPARENT
    || parseModeModel.value !== DEFAULT_PARSE_MODE
  );
});

watch(
  isDirty,
  (v) => {
    dirtyContext?.setPanelDirty(PANEL_KEYS.files, v);
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  dirtyContext?.setPanelDirty(PANEL_KEYS.files, false);
});

function onExport(): void {
  if (!viewerApi.value) return;
  void viewerApi.value.exportPng({
    scale: exportScale.value,
    transparent: exportTransparent.value,
  });
}

function onExportSelect(): void {
  if (!viewerApi.value) return;
  viewerApi.value.exportPngWithSelection({
    scale: exportScale.value,
    transparent: exportTransparent.value,
  });
}

async function onExportProject(): Promise<void> {
  try {
    const api = viewerApi.value;
    if (!api) return;
    const snaps = api.getLayerSnapshots ? await api.getLayerSnapshots() : [];
    const sources = api.getLayerSources ? await api.getLayerSources() : [];
    const { blob, filename } = await buildProjectZip({
      settings: settings.value,
      layers: snaps,
      sources,
      modelFileName: api.parseInfo?.fileName ?? 'atoms-viewer',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    message.success(t('settings.exportSuccess'));
  }
  catch (err) {
    console.error(err);
    message.error(t('common.error'));
  }
}

function onImportProject(): void {
  projectInputRef.value?.click();
}

async function onProjectFilePicked(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement | null;
  const file = input?.files?.[0];
  if (!file) return;
  try {
    const parsed = await parseProjectZip(file);
    const files = parsed.files?.map(f => f.file) ?? [];
    const api = viewerApi.value;
    if (api && api.applySessionSnapshot) {
      message.loading(t('settings.importing'), 1);
      await api.applySessionSnapshot(parsed.snapshot, files);
    }
    else {
      window.dispatchEvent(new CustomEvent('atoms-viewer:import-session', {
        detail: { snapshot: parsed.snapshot, files },
      }));
    }
  }
  catch (err) {
    console.error(err);
    message.error(t('settings.importFailed'));
  }
  finally {
    if (input) input.value = '';
  }
}
</script>
