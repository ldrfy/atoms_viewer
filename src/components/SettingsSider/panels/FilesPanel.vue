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

      <a-row :gutter="8" class="settings-gap-top-sm" align="middle">
        <a-col :span="12">
          <a-button
            block
            type="primary"
            :disabled="!hasAnyLayer"
            @click="onExport"
          >
            {{ t('settings.panel.files.export.button') }}
          </a-button>
        </a-col>
        <a-col :span="12">
          <a-button
            block
            :disabled="!hasAnyLayer"
            @click="onExportSelect"
          >
            {{ t('settings.panel.files.export.selectButton') }}
          </a-button>
        </a-col>
      </a-row>

      <a-typography-text
        type="secondary"
        class="settings-text-secondary"
      >
        {{ t('settings.panel.files.export.hint') }}
      </a-typography-text>
    </a-form-item>

    <a-form-item :label="t('settings.panel.files.export.formatButton')">
      <div>
        <a-row :gutter="8" align="middle">
          <a-col :span="12">
            <a-select
              v-model:value="exportFormatModel"
              :options="exportFormatOptions"
              class="settings-full-width"
            />
          </a-col>
          <a-col :span="12">
            <a-button
              block
              :disabled="!hasAnyLayer"
              @click="onExportStructure"
            >
              {{ t('settings.panel.files.export.formatButton') }}
            </a-button>
          </a-col>
        </a-row>
        <a-typography-text type="secondary" class="settings-text-secondary">
          {{ t('settings.panel.files.export.formatHint') }}
        </a-typography-text>
      </div>
    </a-form-item>

    <a-form-item :label="t('settings.panel.files.project.header')">
      <a-row :gutter="8" align="middle">
        <a-col :span="12">
          <a-button
            type="primary"
            block
            :disabled="!hasAnyLayer"
            @click="onExportProject"
          >
            {{ t('settings.panel.files.project.export') }}
          </a-button>
        </a-col>
        <a-col :span="12">
          <a-button block @click="onImportProject">
            {{ t('settings.panel.files.project.import') }}
          </a-button>
        </a-col>
      </a-row>

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
import { DEFAULT_SETTINGS } from '../../../lib/viewer/settings';
import { buildProjectZip, parseProjectZip } from '../../../lib/viewer/projectPackage';
import { getLocale } from '../../../i18n';
import type { StructureExportFormat } from '../../../lib/structure/export';

const { t } = useI18n();
const { hasAnyLayer, settings, patchSettings } = useSettingsSiderContext();

const viewerApi = computed(() => viewerApiRef.value);
const projectInputRef = ref<HTMLInputElement | null>(null);
const DEFAULT_EXPORT_SCALE = DEFAULT_SETTINGS.exportPngScale;
const DEFAULT_EXPORT_TRANSPARENT = DEFAULT_SETTINGS.exportPngTransparent;
const DEFAULT_CACHE_REMOTE = DEFAULT_SETTINGS.cacheRemoteOnExport;
const DEFAULT_EXPORT_FORMAT: StructureExportFormat = 'xyz';

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

const cacheRemoteModel = computed<boolean>({
  get: () => settings.value.cacheRemoteOnExport ?? DEFAULT_CACHE_REMOTE,
  set: (v) => {
    patchSettings({ cacheRemoteOnExport: !!v });
    viewerApi.value?.setCacheRemoteOnExport?.(!!v);
  },
});

const exportFormatModel = ref<StructureExportFormat>(DEFAULT_EXPORT_FORMAT);
const exportFormatOptions = computed(() => ([
  { label: 'XYZ', value: 'xyz' },
  { label: 'PDB', value: 'pdb' },
  { label: 'MOL', value: 'mol' },
] as { label: string; value: StructureExportFormat }[]));

const dirtyContext = inject(settingsSiderDirtyContextKey, null);

const isDirty = computed(() => {
  return (
    exportScale.value !== DEFAULT_EXPORT_SCALE
    || exportTransparent.value !== DEFAULT_EXPORT_TRANSPARENT
    || cacheRemoteModel.value !== DEFAULT_CACHE_REMOTE
  );
});

watch(
  () => settings.value.cacheRemoteOnExport,
  (v) => {
    if (v == null) return;
    viewerApi.value?.setCacheRemoteOnExport?.(!!v);
  },
  { immediate: true },
);

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

async function onExportStructure(): Promise<void> {
  const api = viewerApi.value;
  if (!api) return;
  try {
    const { blob, filename } = await api.exportStructureFile(exportFormatModel.value);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    message.success(t('settings.panel.files.export.formatSuccess'));
  }
  catch (err) {
    console.error(err);
    message.error(t('common.error'));
  }
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
      app: { locale: getLocale() },
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
