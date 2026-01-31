<template>
  <a-form layout="vertical">
    <a-form-item :label="t('settings.panel.files.export.header')">
      <!-- 倍率 + 透明：同一行，两端对齐（移动端更紧凑） -->
      <a-checkbox v-model:checked="exportTransparent">
        {{ t('settings.panel.files.export.transparent') }}
      </a-checkbox>
      <div class="export-row settings-gap-top-sm">
        <a-tooltip :title="t('settings.panel.files.export.hint')">
          <a-input-number
            v-model:value="exportScale"
            style="width: 72px"
            :aria-label="t('settings.panel.files.export.scaleLabel')"
            :title="t('settings.panel.files.export.scaleLabel')"
            :min="1"
            :max="20"
            :step="0.5"
            :precision="1"
          />
        </a-tooltip>
        <a-select
          v-model:value="exportImageFormat"
          :options="exportImageFormatOptions"
          style="flex: 1; min-width: 0;"
        />
      </div>

      <a-row :gutter="8" class="settings-gap-top-sm" align="middle">
        <a-col :span="12">
          <a-button
            block
            type="primary"
            :loading="exportingPng"
            :disabled="!hasAnyLayer || exportingPng"
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
    </a-form-item>

    <a-divider class="settings-divider" />

    <a-form-item :label="t('settings.panel.files.project.header')">
      <a-checkbox v-model:checked="cacheRemoteModel">
        {{ t('settings.panel.files.project.cacheRemote') }}
      </a-checkbox>

      <a-row :gutter="8" align="middle" class="settings-gap-top-sm">
        <a-col :span="12">
          <a-button
            type="primary"
            block
            :loading="exportingProject"
            :disabled="!hasAnyLayer || exportingProject"
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

    <a-form-item :label="t('settings.panel.files.config.header')">
      <a-checkbox v-model:checked="exportFullSettings">
        {{ t('settings.panel.files.config.exportFull') }}
      </a-checkbox>

      <a-row :gutter="8" class="settings-gap-top-sm">
        <a-col :span="12">
          <a-button
            type="primary"
            block
            @click="onExportSettings"
          >
            {{ t('settings.exportSettings') }}
          </a-button>
        </a-col>
        <a-col :span="12">
          <a-button block @click="onImportSettings">
            {{ t('settings.importSettings') }}
          </a-button>
        </a-col>
      </a-row>
      <input
        ref="settingsImportInputRef"
        class="settings-import-input"
        type="file"
        accept="application/json,.json"
        hidden
        @change="onImportFile"
      >
    </a-form-item>

    <a-divider class="settings-divider" />

    <a-form-item :label="t('settings.panel.files.format.header')">
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
              type="primary"
              :disabled="!hasAnyLayer"
              @click="onExportStructure"
            >
              {{ t('settings.panel.files.format.button') }}
            </a-button>
          </a-col>
        </a-row>
      </div>
    </a-form-item>
  </a-form>
</template>

<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { message } from 'ant-design-vue';

import { viewerApiRef } from '../../../lib/viewer/bridge';
import { settingsSiderDirtyContextKey } from '../context';
import { useSettingsSiderContext } from '../useSettingsSiderContext';
import { useSettingsSiderControlContext } from '../useSettingsSiderControlContext';
import { useSettingsSiderResetContext } from '../useSettingsSiderResetContext';
import { PANEL_KEYS } from '../../../lib/viewer/panelKeys';
import { DEFAULT_SETTINGS } from '../../../lib/viewer/settings';
import { buildProjectZip, parseProjectZip } from '../../../lib/viewer/projectPackage';
import { getLocale, setLocale, SUPPORT_LOCALES } from '../../../i18n';
import type { StructureExportFormat } from '../../../lib/structure/export';
import { buildSettingsExportJson, applyImportedSettings, parseSettingsImport } from '../../../lib/viewer/settingsActions';
import { buildExportFilename } from '../../../lib/file/filename';
import { setThemeMode } from '../../../theme/mode';

const { t } = useI18n();
const { hasAnyLayer, settings, patchSettings } = useSettingsSiderContext();
const { replaceSettings } = useSettingsSiderControlContext();

const viewerApi = computed(() => viewerApiRef.value);
const projectInputRef = ref<HTMLInputElement | null>(null);
const settingsImportInputRef = ref<HTMLInputElement | null>(null);
const DEFAULT_EXPORT_SCALE = DEFAULT_SETTINGS.files.exportPngScale;
const DEFAULT_EXPORT_TRANSPARENT = DEFAULT_SETTINGS.files.exportPngTransparent;
const DEFAULT_CACHE_REMOTE = DEFAULT_SETTINGS.files.cacheRemoteOnExport;
const DEFAULT_EXPORT_FORMAT: StructureExportFormat = 'xyz';

const exportScale = computed<number>({
  get: () => settings.value.files.exportPngScale ?? DEFAULT_EXPORT_SCALE,
  set: (v) => {
    patchSettings({ files: { exportPngScale: v } });
  },
});

const exportTransparent = computed<boolean>({
  get: () => settings.value.files.exportPngTransparent ?? DEFAULT_EXPORT_TRANSPARENT,
  set: (v) => {
    patchSettings({ files: { exportPngTransparent: v } });
  },
});

const cacheRemoteModel = computed<boolean>({
  get: () => settings.value.files.cacheRemoteOnExport ?? DEFAULT_CACHE_REMOTE,
  set: (v) => {
    patchSettings({ files: { cacheRemoteOnExport: !!v } });
    viewerApi.value?.setCacheRemoteOnExport?.(!!v);
  },
});

const exportFormatModel = ref<StructureExportFormat>(DEFAULT_EXPORT_FORMAT);
const exportingProject = ref(false);
const exportingPng = ref(false);
const exportFullSettings = ref(false);
const exportImageFormat = computed<'png' | 'webp' | 'jpg'>({
  get: () => settings.value.files.exportImageFormat ?? 'png',
  set: (v) => {
    patchSettings({ files: { exportImageFormat: v } });
  },
});
const exportFormatOptions = computed(() => ([
  { label: 'XYZ', value: 'xyz' },
  { label: 'PDB', value: 'pdb' },
  { label: 'MOL', value: 'mol' },
] as { label: string; value: StructureExportFormat }[]));
const exportImageFormatOptions = computed(() => {
  const opts = [
    { label: t('settings.panel.files.export.format.png'), value: 'png' },
    { label: t('settings.panel.files.export.format.webp'), value: 'webp' },
  ] as { label: string; value: 'png' | 'webp' | 'jpg' }[];
  if (!exportTransparent.value) opts.push({ label: t('settings.panel.files.export.format.jpg'), value: 'jpg' });
  return opts;
});

watch(
  () => exportTransparent.value,
  (v) => {
    if (v && exportImageFormat.value === 'jpg') {
      exportImageFormat.value = 'png';
    }
  },
);

watch(
  exportImageFormatOptions,
  (opts) => {
    if (!opts.some(o => o.value === exportImageFormat.value)) {
      exportImageFormat.value = 'png';
    }
  },
  { immediate: true },
);

const dirtyContext = inject(settingsSiderDirtyContextKey, null);

const isDirty = computed(() => {
  return (
    exportScale.value !== DEFAULT_EXPORT_SCALE
    || exportTransparent.value !== DEFAULT_EXPORT_TRANSPARENT
    || cacheRemoteModel.value !== DEFAULT_CACHE_REMOTE
  );
});

watch(
  () => settings.value.files.cacheRemoteOnExport,
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

const { registerPanelReset } = useSettingsSiderResetContext();
const unregisterFilesReset = registerPanelReset(PANEL_KEYS.files, resetFilesSettings);
onBeforeUnmount(() => {
  dirtyContext?.setPanelDirty(PANEL_KEYS.files, false);
  unregisterFilesReset();
});

function resetFilesSettings(): void {
  patchSettings({
    files: {
      exportPngScale: DEFAULT_EXPORT_SCALE,
      exportPngTransparent: DEFAULT_EXPORT_TRANSPARENT,
      exportImageFormat: DEFAULT_SETTINGS.files.exportImageFormat,
      cacheRemoteOnExport: DEFAULT_CACHE_REMOTE,
    },
  });
  exportFormatModel.value = DEFAULT_EXPORT_FORMAT;
  exportFullSettings.value = false;
}

async function onExportSettings(): Promise<void> {
  try {
    const { json, fileStem } = await buildSettingsExportJson({
      settings: settings.value,
      viewerApi: viewerApi.value,
      locale: getLocale(),
      fullSettings: exportFullSettings.value,
    });
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = buildExportFilename({ modelFileName: fileStem, ext: 'json' });
    a.click();
    URL.revokeObjectURL(url);
    message.success(t('settings.exportSuccess'));
  }
  catch (err) {
    console.error(err);
    message.error(t('common.error'));
  }
}

function onImportSettings(): void {
  settingsImportInputRef.value?.click();
}

function onImportFile(e: Event): void {
  const input = e.target as HTMLInputElement | null;
  const file = input?.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const raw = String(reader.result ?? '');
      const parsed = parseSettingsImport(raw);
      const locale = parsed.locale && SUPPORT_LOCALES.includes(parsed.locale)
        ? parsed.locale
        : undefined;
      await applyImportedSettings({
        parsed: { ...parsed, locale },
        viewerApi: viewerApi.value,
        replaceSettings,
        setLocale: locale ? setLocale : undefined,
        setThemeMode,
        nextTick,
      });
      message.success(t('settings.importSuccess'));
    }
    catch {
      message.error(t('settings.importFailed'));
    }
    finally {
      if (input) input.value = '';
    }
  };
  reader.readAsText(file);
}

async function onExport(): Promise<void> {
  if (!viewerApi.value || exportingPng.value) return;
  exportingPng.value = true;
  await nextTick();
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  await new Promise<void>(resolve => setTimeout(resolve, 0));
  try {
    await viewerApi.value.exportPng({
      scale: exportScale.value,
      transparent: exportTransparent.value,
      format: exportImageFormat.value,
    });
  }
  finally {
    exportingPng.value = false;
  }
}

function onExportSelect(): void {
  if (!viewerApi.value) return;
  viewerApi.value.exportPngWithSelection({
    scale: exportScale.value,
    transparent: exportTransparent.value,
    format: exportImageFormat.value,
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
    message.success(t('settings.panel.files.format.success'));
  }
  catch (err) {
    console.error(err);
    message.error(t('common.error'));
  }
}

async function onExportProject(): Promise<void> {
  if (exportingProject.value) return;
  try {
    const api = viewerApi.value;
    if (!api) return;
    exportingProject.value = true;
    const snaps = api.getLayerSnapshots ? await api.getLayerSnapshots() : [];
    const sources = api.getLayerSources ? await api.getLayerSources() : [];
    const { blob, filename } = await buildProjectZip({
      settings: settings.value,
      layers: snaps,
      sources,
      modelFileName: api.parseInfo?.fileName ?? 'atoms-viewer',
      app: { locale: getLocale() },
      layersSortBy: api.layerSortBy?.value ?? 'name,ASC',
      activeLayerId: api.activeLayerId?.value ?? null,
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
  finally {
    exportingProject.value = false;
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
    if (!parsed.snapshot) {
      message.error(t('settings.importFailed'));
      return;
    }
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

<style scoped>
.export-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.settings-divider {
  margin: 12px 0;
}

.settings-import-input {
  display: none;
}
</style>
