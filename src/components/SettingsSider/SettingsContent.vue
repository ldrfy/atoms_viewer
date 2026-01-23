<template>
  <div class="settings-header">
    <!-- Mobile only: grab handle -->
    <div
      v-if="showGrab"
      class="settings-grab"
      aria-label="resize"
      :title="t('common.resize')"
      role="button"
      tabindex="0"
      @pointerdown.stop.prevent="onResizeStart"
    >
      <div class="settings-grab-bar" />
    </div>

    <div class="settings-header-row">
      <a-typography-text strong>
        {{ t('settings.title') }}
      </a-typography-text>

      <a-button
        type="text"
        size="small"
        aria-label="close"
        :title="t('common.close')"
        @click="emit('close')"
      >
        <CloseOutlined />
      </a-button>
    </div>
  </div>

  <div class="settings-body">
    <a-collapse
      v-model:active-key="activeKeyProxy"
      ghost
      class="settings-collapse"
      expand-icon-position="end"
    >
      <a-collapse-panel
        v-for="p in panels"
        :key="p.key"
      >
        <template #header>
          <span class="settings-panel-header">
            <component :is="p.icon" class="settings-panel-icon" />
            <a-typography-text strong>
              {{ t(p.headerKey) }}
            </a-typography-text>
            <span v-if="isPanelDirty(p.key)" class="settings-panel-dirty" aria-hidden="true" />
          </span>
        </template>
        <component :is="p.comp" />
      </a-collapse-panel>
    </a-collapse>

    <div class="settings-reset">
      <a-button block danger @click="onClearStorage">
        {{ t('settings.clearStorage') }}
      </a-button>
      <a-typography-text type="secondary" class="settings-text-secondary">
        {{ t('settings.clearStorageHint') }}
      </a-typography-text>
      <div class="settings-import-export">
        <a-row :gutter="8">
          <a-col :span="12">
            <a-button block @click="onExportSettings">
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
          ref="importInputRef"
          class="settings-import-input"
          type="file"
          accept="application/json,.json"
          @change="onImportFile"
        >
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, provide, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Modal, message } from 'ant-design-vue';
import {
  AppstoreOutlined,
  BgColorsOutlined,
  CloseOutlined,
  EyeOutlined,
  FolderOpenOutlined,
  SettingOutlined,
  SlidersOutlined,
  SwapOutlined,
  SyncOutlined,
} from '@ant-design/icons-vue';

import FilesPanel from './panels/FilesPanel.vue';
import LayersPanel from './panels/LayersPanel.vue';
import ViewPanel from './panels/ViewPanel.vue';
import RotatePanel from './panels/RotatePanel.vue';
import LammpsPanel from './panels/LammpsPanel.vue';
import ColorsPanel from './panels/ColorsPanel.vue';
import DetailsPanel from './panels/DetailsPanel.vue';
import OtherPanel from './panels/OtherPanel.vue';
import {
  DEFAULT_SETTINGS,
  DEFAULT_LAYER_DISPLAY,
} from '../../lib/viewer/settings';
import type { ViewerSettings } from '../../lib/viewer/settings';
import { useSettingsSiderContext } from './useSettingsSiderContext';
import { useSettingsSiderControlContext } from './useSettingsSiderControlContext';
import { settingsSiderDirtyContextKey, settingsSiderDerivedContextKey } from './context';
import { viewerApiRef } from '../../lib/viewer/bridge';
import {
  buildDefaultSettings,
  clearSettingsStorage,
  normalizeSettings,
  saveSettingsToStorage,
} from '../../lib/viewer/settingsStorage';
import { clearSessionStorage } from '../../lib/viewer/sessionStorage';
import { buildExportFilename } from '../../lib/file/filename';
import { setThemeMode } from '../../theme/mode';
import { getLocale, setLocale, SUPPORT_LOCALES, type SupportLocale } from '../../i18n';
import { isLammpsDumpFormat } from '../../lib/structure/parsers/lammpsDump';
import { isLammpsDataFormat } from '../../lib/structure/parsers/lammpsData';
import type { LayerSnapshot } from '../../lib/viewer/sessionTypes';
import { flattenCategorizedSettings } from '../../lib/viewer/sessionTemplates';
import { buildSettingsSnapshot } from '../../lib/viewer/projectPackage';
import { PANEL_KEYS, PANEL_HEADER_KEYS } from '../../lib/viewer/panelKeys';

const props = withDefaults(
  defineProps<{
    showGrab?: boolean;
    activeKey: string[];
  }>(),
  {
    showGrab: false,
  },
);

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'resize-start', ev: PointerEvent): void;
  (e: 'clear-storage'): void;
  (e: 'update:activeKey', v: string[]): void;
}>();

const { t } = useI18n();
const { settings } = useSettingsSiderContext();
const { replaceSettings } = useSettingsSiderControlContext();

const viewerApi = computed(() => viewerApiRef.value);
const importInputRef = ref<HTMLInputElement | null>(null);
const layerList = computed(() => viewerApi.value?.layers.value ?? []);
const activeLayerId = computed(() => viewerApi.value?.activeLayerId.value ?? null);
const activeLayerInfo = computed(() => {
  const id = activeLayerId.value;
  if (!id) return null;
  return layerList.value.find(l => l.id === id) ?? null;
});
const activeLayerIsLammps = computed(() => {
  const format = activeLayerInfo.value?.sourceFormat ?? '';
  return isLammpsDumpFormat(format) || isLammpsDataFormat(format);
});

function extractSettingsPayload(input: unknown): {
  settings: Partial<ViewerSettings>;
  locale?: SupportLocale;
  layers?: LayerSnapshot[];
} {
  if (!input || typeof input !== 'object') {
    return { settings: {} };
  }
  const anyInput = input as Record<string, unknown>;
  const topSettings = anyInput.settings as Record<string, any> | undefined;
  const app = anyInput.app as Record<string, unknown> | undefined;
  const locale = app?.locale as SupportLocale | undefined;
  const layers = Array.isArray(anyInput.layers)
    ? (anyInput.layers as LayerSnapshot[])
    : undefined;

  const maybeCategorized = topSettings && typeof topSettings === 'object'
    && (
      'files' in topSettings
      || 'rotation' in topSettings
      || 'view' in topSettings
      || 'details' in topSettings
      || 'colors' in topSettings
      || 'lammps' in topSettings
    );

  if (maybeCategorized) {
    const categorized = topSettings as any;
    const flat = flattenCategorizedSettings(categorized as any);
    return {
      locale,
      layers,
      settings: flat,
    };
  }
  if (topSettings && typeof topSettings === 'object') {
    return {
      locale,
      layers,
      settings: topSettings as Partial<ViewerSettings>,
    };
  }
  const data = anyInput.data;
  if (data && typeof data === 'object') {
    return {
      locale,
      layers,
      settings: data as Partial<ViewerSettings>,
    };
  }
  return {
    locale,
    layers,
    settings: anyInput as Partial<ViewerSettings>,
  };
}

const panelDirtyFlags = reactive<Record<string, boolean>>({});
provide(settingsSiderDirtyContextKey, {
  setPanelDirty: (key: string, dirty: boolean) => {
    panelDirtyFlags[key] = dirty;
  },
});

const filesDirty = computed(() => {
  const exportScale = settings.value.exportPngScale ?? DEFAULT_SETTINGS.exportPngScale;
  const exportTransparent = settings.value.exportPngTransparent ?? DEFAULT_SETTINGS.exportPngTransparent;
  const cacheRemoteOnExport = settings.value.cacheRemoteOnExport ?? DEFAULT_SETTINGS.cacheRemoteOnExport;
  return (
    exportScale !== DEFAULT_SETTINGS.exportPngScale
    || exportTransparent !== DEFAULT_SETTINGS.exportPngTransparent
    || cacheRemoteOnExport !== DEFAULT_SETTINGS.cacheRemoteOnExport
  );
});
const layersDirty = computed(() => (viewerApi.value?.layers.value.length ?? 0) > 1);

const detailsDirty = computed(() => {
  const active = viewerApi.value?.activeLayerDisplay?.value;
  const cur = active ?? settings.value;
  return (
    cur.atomScale !== DEFAULT_LAYER_DISPLAY.atomScale
    || cur.showBonds !== DEFAULT_LAYER_DISPLAY.showBonds
    || cur.sphereSegments !== DEFAULT_LAYER_DISPLAY.sphereSegments
    || cur.bondFactor !== DEFAULT_LAYER_DISPLAY.bondFactor
    || cur.bondRadius !== DEFAULT_LAYER_DISPLAY.bondRadius
    || cur.atomRoughness !== DEFAULT_LAYER_DISPLAY.atomRoughness
  );
});

const viewDirty = computed(() => {
  const defaultDistance = Number.isFinite(settings.value.initialDualViewDistance)
    ? (settings.value.initialDualViewDistance as number)
    : DEFAULT_SETTINGS.dualViewDistance;
  return (
    settings.value.orthographic !== DEFAULT_SETTINGS.orthographic
    || settings.value.dualViewEnabled !== DEFAULT_SETTINGS.dualViewEnabled
    || !arraysEqual(settings.value.viewPresets, DEFAULT_SETTINGS.viewPresets)
    || settings.value.dualViewSplit !== DEFAULT_SETTINGS.dualViewSplit
    || (settings.value.dualViewDistance ?? defaultDistance) !== defaultDistance
    || settings.value.rotationDeg.x !== 0
    || settings.value.rotationDeg.y !== 0
    || settings.value.rotationDeg.z !== 0
  );
});

const rotationDirty = computed(() => {
  const cur = settings.value.autoRotate;
  const def = DEFAULT_SETTINGS.autoRotate;
  return (
    !!cur.enabled !== !!def.enabled
    || cur.presetId !== def.presetId
    || cur.speedDegPerSec !== def.speedDegPerSec
    || !!cur.pauseOnInteract !== !!def.pauseOnInteract
    || cur.resumeDelayMs !== def.resumeDelayMs
    || !!cur.autoEnabledBySystem
  );
});

const otherDirty = computed(() => {
  return (
    settings.value.showAxes !== DEFAULT_SETTINGS.showAxes
    || settings.value.refreshBondsOnPlay !== DEFAULT_SETTINGS.refreshBondsOnPlay
    || settings.value.frame_rate !== DEFAULT_SETTINGS.frame_rate
    || settings.value.autoRotateOnLoad !== DEFAULT_SETTINGS.autoRotateOnLoad
    || settings.value.themeMode !== DEFAULT_SETTINGS.themeMode
    || settings.value.modelLightIntensity !== DEFAULT_SETTINGS.modelLightIntensity
    || (settings.value.themeReadabilityCheckOnOpen ?? true)
      !== (DEFAULT_SETTINGS.themeReadabilityCheckOnOpen ?? true)
  );
});

provide(settingsSiderDerivedContextKey, {
  filesDirty,
  layersDirty,
  viewDirty,
  rotationDirty,
  otherDirty,
  detailsDirty,
});

function arraysEqual(a: unknown, b: unknown): boolean {
  const arrA = Array.isArray(a) ? a : [];
  const arrB = Array.isArray(b) ? b : [];
  if (arrA.length !== arrB.length) return false;
  return arrA.every((v, i) => v === arrB[i]);
}

function hasCustomColors(): boolean {
  const rows = viewerApi.value?.activeLayerColorMap?.value ?? [];
  return rows.some(r => r.isCustom);
}

function hasCustomTypeMap(): boolean {
  const template = settings.value.lammpsTypeMap ?? [];
  const rows = viewerApi.value?.activeLayerTypeMap?.value ?? [];
  const all = [...template, ...rows];
  return all.some(r => (r.element ?? '').toString().trim().toUpperCase() !== 'E');
}

function isTypeMapApplied(): boolean {
  return !!viewerApi.value?.activeLayerTypeMapApplied?.value;
}

function isPanelDirty(key: string): boolean {
  if (key === PANEL_KEYS.files) return filesDirty.value;
  if (key === PANEL_KEYS.layers) return layersDirty.value;
  if (key === PANEL_KEYS.colors) return hasCustomColors();
  if (key === PANEL_KEYS.lammps) return isTypeMapApplied() && hasCustomTypeMap();
  if (key === PANEL_KEYS.details) return detailsDirty.value;
  if (key === PANEL_KEYS.view) return viewDirty.value;
  if (key === PANEL_KEYS.rotation) return rotationDirty.value;
  if (key === PANEL_KEYS.other) return otherDirty.value;
  return false;
}

const basePanels = [
  { key: PANEL_KEYS.files, headerKey: PANEL_HEADER_KEYS.files, comp: FilesPanel, icon: FolderOpenOutlined },
  { key: PANEL_KEYS.rotation, headerKey: PANEL_HEADER_KEYS.rotation, comp: RotatePanel, icon: SyncOutlined },
  { key: PANEL_KEYS.view, headerKey: PANEL_HEADER_KEYS.view, comp: ViewPanel, icon: EyeOutlined },
  { key: PANEL_KEYS.layers, headerKey: PANEL_HEADER_KEYS.layers, comp: LayersPanel, icon: AppstoreOutlined },
  { key: PANEL_KEYS.lammps, headerKey: PANEL_HEADER_KEYS.lammps, comp: LammpsPanel, icon: SwapOutlined },
  { key: PANEL_KEYS.details, headerKey: PANEL_HEADER_KEYS.details, comp: DetailsPanel, icon: SlidersOutlined },
  { key: PANEL_KEYS.colors, headerKey: PANEL_HEADER_KEYS.colors, comp: ColorsPanel, icon: BgColorsOutlined },
  { key: PANEL_KEYS.other, headerKey: PANEL_HEADER_KEYS.other, comp: OtherPanel, icon: SettingOutlined },
] as const;
const panels = computed(() =>
  activeLayerIsLammps.value
    ? basePanels
    : basePanels.filter(p => p.key !== PANEL_KEYS.lammps),
);

const activeKeyProxy = computed<string[]>({
  get: () => props.activeKey,
  set: (v: unknown) => {
    const next = Array.isArray(v)
      ? v.map(x => String(x))
      : v != null && String(v) !== ''
        ? [String(v)]
        : [];
    emit('update:activeKey', next);
  },
});

watch(
  () => activeLayerIsLammps.value,
  (isLammps) => {
    if (isLammps) return;
    if (props.activeKey.includes(PANEL_KEYS.lammps)) {
      emit('update:activeKey', props.activeKey.filter(k => k !== PANEL_KEYS.lammps));
    }
  },
);

function onResizeStart(ev: PointerEvent): void {
  emit('resize-start', ev);
}

function applyDefaults() {
  const defaults = buildDefaultSettings();
  const initialDistance = settings.value.initialDualViewDistance;
  const dist = typeof initialDistance === 'number' && Number.isFinite(initialDistance)
    ? initialDistance
    : defaults.initialDualViewDistance;

  const nextSettings = {
    ...defaults,
    dualViewDistance: dist,
    initialDualViewDistance: dist,
    rotationDeg: { x: 0, y: 0, z: 0 },
    resetViewSeq: settings.value.resetViewSeq,
  };

  const api = viewerApiRef.value;
  if (api) {
    api.suspendSettingsSync(300);
    api.setCacheRemoteOnExport?.(nextSettings.cacheRemoteOnExport ?? true);
  }

  replaceSettings(nextSettings);
  if (api) {
    void nextTick(() => {
      api.applyViewFromSettings(nextSettings);
    });
  }

  if (!api) return nextSettings;

  api.setActiveLayerDisplay(
    {
      atomScale: DEFAULT_LAYER_DISPLAY.atomScale,
      showBonds: DEFAULT_LAYER_DISPLAY.showBonds,
      sphereSegments: DEFAULT_LAYER_DISPLAY.sphereSegments,
      bondFactor: DEFAULT_LAYER_DISPLAY.bondFactor,
      bondRadius: DEFAULT_LAYER_DISPLAY.bondRadius,
      atomRoughness: DEFAULT_LAYER_DISPLAY.atomRoughness,
    },
    { applyToAll: true },
  );

  api.resetAllLayersTypeMapToDefaults({
    templateRows: [...(DEFAULT_SETTINGS.lammpsTypeMap ?? [])],
    useAtomDefaults: false,
  });
  api.resetAllLayersColorMapToDefaults();

  return nextSettings;
}

function onClearStorage(): void {
  Modal.confirm({
    title: t('settings.clearStorageConfirmTitle'),
    content: t('settings.clearStorageConfirmBody'),
    centered: true,
    okText: t('common.confirm'),
    cancelText: t('common.cancel'),
    onOk: () => {
      clearSettingsStorage();
      emit('clear-storage');
      const nextSettings = applyDefaults();
      if (nextSettings) {
        saveSettingsToStorage(nextSettings);
      }
      void clearSessionStorage();
    },
  });
}

async function onExportSettings(): Promise<void> {
  try {
    const data = normalizeSettings(settings.value);
    const api = viewerApiRef.value;
    const layerSnapshots: LayerSnapshot[] = api?.getLayerSnapshots
      ? await api.getLayerSnapshots()
      : [];

    const payload = buildSettingsSnapshot(data, layerSnapshots, { locale: getLocale() });
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const fileStem = api?.parseInfo?.fileName ?? 'atoms-viewer';
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
  importInputRef.value?.click();
}

function onImportFile(e: Event): void {
  const input = e.target as HTMLInputElement | null;
  const file = input?.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const raw = String(reader.result ?? '');
      const parsed = JSON.parse(raw) as any;
      const extracted = extractSettingsPayload(parsed);
      const nextSettings = normalizeSettings(
        flattenCategorizedSettings(extracted.settings as any),
      );

      const api = viewerApiRef.value;
      if (api) {
        api.suspendSettingsSync(300);
      }

      if (extracted.locale && SUPPORT_LOCALES.includes(extracted.locale)) {
        setLocale(extracted.locale);
      }

      replaceSettings(nextSettings);
      if (api) {
        api.setCacheRemoteOnExport?.(nextSettings.cacheRemoteOnExport ?? true);
      }
      setThemeMode(nextSettings.themeMode);
      saveSettingsToStorage(nextSettings);

      const layerSnapshots = extracted.layers;
      if (api) {
        void nextTick(async () => {
          api.applyViewFromSettings(nextSettings);
          const hasLayerSnapshots = Array.isArray(layerSnapshots) && layerSnapshots.length > 0;
          if (hasLayerSnapshots && api.applyLayerSnapshots) {
            await api.applyLayerSnapshots(layerSnapshots as LayerSnapshot[]);
          }
          else {
            api.setActiveLayerDisplay(
              {
                atomScale: nextSettings.atomScale,
                sphereSegments: nextSettings.sphereSegments,
                showBonds: nextSettings.showBonds,
                bondFactor: nextSettings.bondFactor,
                bondRadius: nextSettings.bondRadius,
                atomRoughness: nextSettings.atomRoughness,
              },
              { applyToAll: true },
            );
            api.setAllLayersColorMap(nextSettings.colorMapTemplate ?? []);
            api.refreshColorMap({ applyToAll: true });
            api.resetAllLayersTypeMapToDefaults({
              templateRows: [...(nextSettings.lammpsTypeMap ?? [])],
              useAtomDefaults: false,
            });
          }
        });
      }
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
</script>
