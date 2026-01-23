import type { ViewerPublicApi } from './bridge';
import type { ViewerSettings } from './settings';
import type { LayerSnapshot } from './sessionTypes';
import type { SupportLocale } from '../../i18n';

import {
  buildDefaultSettings,
  clearSettingsStorage,
  normalizeSettings,
  saveSettingsToStorage,
} from './settingsStorage';
import { clearSessionStorage } from './sessionStorage';
import { buildSettingsSnapshot, type ApplyAllLayersFlags } from './projectPackage';
import { flattenCategorizedSettings } from './sessionTemplates';

export type ParsedSettingsImport = {
  nextSettings: ViewerSettings;
  locale?: SupportLocale;
  layers?: LayerSnapshot[];
  applyAllLayers?: ApplyAllLayersFlags;
};

export async function applyDefaultSettings(params: {
  currentSettings: ViewerSettings;
  viewerApi: ViewerPublicApi | null;
  replaceSettings: (next: ViewerSettings) => void;
  nextTick?: () => Promise<void>;
}): Promise<ViewerSettings> {
  const { currentSettings, viewerApi, replaceSettings, nextTick } = params;
  const defaults = buildDefaultSettings();
  const initialDistance = currentSettings.initialDualViewDistance;
  const dist = typeof initialDistance === 'number' && Number.isFinite(initialDistance)
    ? initialDistance
    : defaults.initialDualViewDistance;

  const nextSettings: ViewerSettings = {
    ...defaults,
    dualViewDistance: dist,
    initialDualViewDistance: dist,
    rotationDeg: { x: 0, y: 0, z: 0 },
  };

  if (viewerApi) {
    viewerApi.suspendSettingsSync(300);
    viewerApi.setCacheRemoteOnExport?.(nextSettings.cacheRemoteOnExport ?? true);
  }

  replaceSettings(nextSettings);
  if (viewerApi && nextTick) {
    await nextTick();
    viewerApi.applyViewFromSettings(nextSettings);
  }

  if (!viewerApi) return nextSettings;

  viewerApi.setActiveLayerDisplay(
    {
      atomScale: defaults.atomScale,
      showBonds: defaults.showBonds,
      sphereSegments: defaults.sphereSegments,
      bondFactor: defaults.bondFactor,
      bondRadius: defaults.bondRadius,
      atomRoughness: defaults.atomRoughness,
    },
    { applyToAll: true },
  );

  viewerApi.resetAllLayersTypeMapToDefaults({
    templateRows: [...(defaults.lammpsTypeMap ?? [])],
    useAtomDefaults: false,
  });
  viewerApi.resetAllLayersColorMapToDefaults();

  return nextSettings;
}

export async function clearAllSettings(params: {
  currentSettings: ViewerSettings;
  viewerApi: ViewerPublicApi | null;
  replaceSettings: (next: ViewerSettings) => void;
  nextTick?: () => Promise<void>;
  onAfterClear?: () => void;
}): Promise<void> {
  clearSettingsStorage();
  params.onAfterClear?.();
  const nextSettings = await applyDefaultSettings(params);
  saveSettingsToStorage(nextSettings);
  await clearSessionStorage();
}

export async function buildSettingsExportJson(params: {
  settings: ViewerSettings;
  viewerApi: ViewerPublicApi | null;
  locale?: SupportLocale;
  applyAllLayers?: ApplyAllLayersFlags;
}): Promise<{ json: string; fileStem: string }> {
  const { settings, viewerApi, locale, applyAllLayers } = params;
  const data = normalizeSettings(settings);
  const layerSnapshots: LayerSnapshot[] = viewerApi?.getLayerSnapshots
    ? await viewerApi.getLayerSnapshots()
    : [];
  const payload = buildSettingsSnapshot(
    data,
    layerSnapshots,
    locale ? { locale } : undefined,
    applyAllLayers,
  );
  const json = JSON.stringify(payload, null, 2);
  const fileStem = viewerApi?.parseInfo?.fileName ?? 'atoms-viewer';
  return { json, fileStem };
}

export function parseSettingsImport(raw: string): ParsedSettingsImport {
  const parsed = JSON.parse(raw) as any;
  const anyInput = parsed as Record<string, unknown>;
  const topSettings = anyInput.settings as Record<string, any> | undefined;
  const app = anyInput.app as Record<string, unknown> | undefined;
  const locale = app?.locale as SupportLocale | undefined;
  const layers = Array.isArray(anyInput.layers)
    ? (anyInput.layers as LayerSnapshot[])
    : undefined;

  const applyAllLayers: ApplyAllLayersFlags = {};
  if (topSettings?.details && typeof topSettings.details === 'object') {
    const val = topSettings.details.applyAllLayers;
    if (typeof val === 'boolean') applyAllLayers.details = val;
  }
  const colorsPayload = topSettings?.colors;
  if (colorsPayload && typeof colorsPayload === 'object' && !Array.isArray(colorsPayload)) {
    const val = (colorsPayload as any).applyAllLayers;
    if (typeof val === 'boolean') applyAllLayers.colors = val;
  }

  const maybeCategorized = topSettings && typeof topSettings === 'object'
    && (
      'files' in topSettings
      || 'rotation' in topSettings
      || 'view' in topSettings
      || 'details' in topSettings
      || 'colors' in topSettings
      || 'lammps' in topSettings
    );

  const extractedSettings = (() => {
    if (maybeCategorized) {
      const categorized = topSettings as any;
      return flattenCategorizedSettings(categorized as any);
    }
    if (topSettings && typeof topSettings === 'object') {
      return topSettings as Partial<ViewerSettings>;
    }
    const data = anyInput.data;
    if (data && typeof data === 'object') {
      return data as Partial<ViewerSettings>;
    }
    return anyInput as Partial<ViewerSettings>;
  })();

  const nextSettings = normalizeSettings(extractedSettings as ViewerSettings);
  return {
    nextSettings,
    locale,
    layers,
    applyAllLayers: Object.keys(applyAllLayers).length > 0 ? applyAllLayers : undefined,
  };
}

export async function applyImportedSettings(params: {
  parsed: ParsedSettingsImport;
  viewerApi: ViewerPublicApi | null;
  replaceSettings: (next: ViewerSettings) => void;
  setLocale?: (loc: SupportLocale) => void;
  setThemeMode?: (mode: ViewerSettings['themeMode']) => void;
  nextTick?: () => Promise<void>;
}): Promise<void> {
  const { parsed, viewerApi, replaceSettings, setLocale, setThemeMode, nextTick } = params;
  const { nextSettings, locale, layers } = parsed;

  if (viewerApi) {
    viewerApi.suspendSettingsSync(300);
  }

  if (locale && setLocale) {
    setLocale(locale);
  }

  replaceSettings(nextSettings);
  viewerApi?.setCacheRemoteOnExport?.(nextSettings.cacheRemoteOnExport ?? true);
  if (setThemeMode) setThemeMode(nextSettings.themeMode);
  saveSettingsToStorage(nextSettings);

  if (!viewerApi || !nextTick) return;

  await nextTick();
  viewerApi.applyViewFromSettings(nextSettings);
  const hasLayerSnapshots = Array.isArray(layers) && layers.length > 0;
  if (hasLayerSnapshots && viewerApi.applyLayerSnapshots) {
    await viewerApi.applyLayerSnapshots(layers as LayerSnapshot[]);
    return;
  }

  viewerApi.setActiveLayerDisplay(
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
  viewerApi.setAllLayersColorMap(nextSettings.colorMapTemplate ?? []);
  viewerApi.refreshColorMap({ applyToAll: true });
  viewerApi.resetAllLayersTypeMapToDefaults({
    templateRows: [...(nextSettings.lammpsTypeMap ?? [])],
    useAtomDefaults: false,
  });
}
