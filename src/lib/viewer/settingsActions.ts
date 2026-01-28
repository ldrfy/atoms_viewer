import type { ViewerPublicApi } from './bridge';
import type { ViewerSettings } from './settings';
import type { LayerSnapshot, LayersSnapshot, LayerSortBy } from './sessionTypes';
import type { SupportLocale } from '../../i18n';

import {
  buildDefaultSettings,
  clearSettingsStorage,
  saveSettingsToStorage,
} from './settingsStorage';
import { clearSessionStorage } from './sessionStorage';
import { buildSettingsSnapshot } from './projectPackage';
import { mergeCategorizedSettings } from './sessionTemplates';

export type ParsedSettingsImport = {
  nextSettings: ViewerSettings;
  locale?: SupportLocale;
  layers?: LayersSnapshot;
  applyAllLayers: {
    details: boolean;
    colors: boolean;
    lammps: boolean;
  };
  animState: {
    frameIndex: number;
    playFps: number;
    recordDelaySec: number;
  };
};

function normalizeLayerSnapshots(
  layers?: LayersSnapshot,
): { sortBy: LayerSortBy; snaps: LayerSnapshot[] } {
  const sortBy = layers?.sortBy ?? 'name,ASC';
  const snaps = layers?.data ? Object.values(layers.data) : [];
  return { sortBy, snaps };
}

export async function applyDefaultSettings(params: {
  currentSettings: ViewerSettings;
  viewerApi: ViewerPublicApi | null;
  replaceSettings: (next: ViewerSettings) => void;
  nextTick?: () => Promise<void>;
}): Promise<ViewerSettings> {
  const { currentSettings, viewerApi, replaceSettings, nextTick } = params;
  const defaults = buildDefaultSettings();
  const initialDistance = currentSettings.view.initialDualViewDistance;
  const dist = typeof initialDistance === 'number' && Number.isFinite(initialDistance)
    ? initialDistance
    : defaults.view.initialDualViewDistance;

  const nextSettings: ViewerSettings = {
    ...defaults,
    view: {
      ...defaults.view,
      dualViewDistance: dist,
      initialDualViewDistance: dist,
      rotationDeg: { x: 0, y: 0, z: 0 },
    },
  };

  if (viewerApi) {
    viewerApi.suspendSettingsSync(300);
    viewerApi.setCacheRemoteOnExport?.(nextSettings.files.cacheRemoteOnExport ?? true);
  }

  replaceSettings(nextSettings);
  if (viewerApi && nextTick) {
    await nextTick();
    viewerApi.applyViewFromSettings(nextSettings);
  }

  if (!viewerApi) return nextSettings;

  viewerApi.setActiveLayerDisplay(
    {
      atomScale: defaults.details.atomScale,
      showBonds: defaults.details.showBonds,
      sphereSegments: defaults.details.sphereSegments,
      bondFactor: defaults.details.bondFactor,
      bondRadius: defaults.details.bondRadius,
      atomRoughness: defaults.details.atomRoughness,
    },
    { applyToAll: true },
  );

  viewerApi.resetAllLayersTypeMapToDefaults({
    templateMap: defaults.lammps.data,
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
  applyAllLayers: {
    details: boolean;
    colors: boolean;
    lammps: boolean;
  };
  fullSettings?: boolean;
}): Promise<{ json: string; fileStem: string }> {
  const { settings, viewerApi, locale, applyAllLayers, fullSettings } = params;
  const data = settings;
  const layerSnapshots: LayerSnapshot[] = viewerApi?.getLayerSnapshots
    ? await viewerApi.getLayerSnapshots()
    : [];
  const layersSortBy = viewerApi?.layerSortBy?.value ?? 'name,ASC';
  const animState = viewerApi?.getAnimState ? viewerApi.getAnimState() : undefined;
  const payload = buildSettingsSnapshot(
    data,
    layerSnapshots,
    locale ? { locale } : undefined,
    animState,
    applyAllLayers,
    layersSortBy,
    viewerApi?.activeLayerId?.value ?? null,
    !fullSettings,
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
  let layers: LayersSnapshot | undefined;
  if (anyInput.layers && typeof anyInput.layers === 'object') {
    const raw = anyInput.layers as Record<string, unknown>;
    const data = (raw.data && typeof raw.data === 'object')
      ? raw.data as Record<string, LayerSnapshot>
      : undefined;
    const sortBy = typeof raw.sortBy === 'string' ? raw.sortBy as LayerSortBy : 'name,ASC';
    if (data) layers = { sortBy, data };
  }

  if (!topSettings || typeof topSettings !== 'object') {
    throw new Error('Invalid settings format');
  }

  const categorized = topSettings as any;
  const details = categorized.details as Record<string, unknown> | undefined;
  const colors = categorized.colors as Record<string, unknown> | undefined;
  const applyAllLayers = {
    details: typeof details?.applyAllLayers === 'boolean' ? details.applyAllLayers : true,
    colors: typeof colors?.applyAllLayers === 'boolean' ? colors.applyAllLayers : true,
    lammps: typeof (categorized.lammps as any)?.applyAllLayers === 'boolean'
      ? (categorized.lammps as any).applyAllLayers
      : false,
  };

  const normalizedColors: Record<string, string> = {};
  if (colors && typeof colors === 'object' && typeof (colors as any).data === 'object') {
    const colorData = (colors as any).data as Record<string, unknown>;
    for (const [key, val] of Object.entries(colorData)) {
      if (/\d/.test(key)) continue;
      if (typeof val !== 'string') continue;
      const c = String(val).trim();
      if (!c) continue;
      normalizedColors[key] = c;
    }
  }

  if (colors && typeof colors === 'object') {
    categorized.colors = {
      applyAllLayers: applyAllLayers.colors,
      data: normalizedColors,
    };
  }
  if (categorized.lammps && typeof categorized.lammps === 'object') {
    const raw = categorized.lammps as any;
    categorized.lammps = {
      applyAllLayers: applyAllLayers.lammps,
      data: (raw.data && typeof raw.data === 'object') ? raw.data : {},
    };
  }

  const extractedSettings = mergeCategorizedSettings(categorized as any);
  const animState = {
    frameIndex: Number(extractedSettings.anim.frameIndex ?? 0),
    playFps: Number(extractedSettings.anim.playFps ?? 6),
    recordDelaySec: Number(extractedSettings.anim.recordDelaySec ?? 0),
  };

  const nextSettings = extractedSettings as ViewerSettings;
  return {
    nextSettings,
    locale,
    layers,
    applyAllLayers,
    animState,
  };
}

export async function applyImportedSettings(params: {
  parsed: ParsedSettingsImport;
  viewerApi: ViewerPublicApi | null;
  replaceSettings: (next: ViewerSettings) => void;
  setLocale?: (loc: SupportLocale) => void;
  setThemeMode?: (mode: ViewerSettings['other']['themeMode']) => void;
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
  viewerApi?.setCacheRemoteOnExport?.(nextSettings.files.cacheRemoteOnExport ?? true);
  if (setThemeMode) setThemeMode(nextSettings.other.themeMode);
  saveSettingsToStorage(nextSettings);

  if (!viewerApi || !nextTick) return;

  await nextTick();
  viewerApi.applyViewFromSettings(nextSettings);
  const { sortBy, snaps } = normalizeLayerSnapshots(layers);
  if (snaps.length > 0 && viewerApi.applyLayerSnapshots) {
    await viewerApi.applyLayerSnapshots(snaps);
    viewerApi.sortLayers?.({
      by: sortBy.startsWith('time') ? 'time' : 'name',
      direction: sortBy.endsWith('DESC') ? 'desc' : 'asc',
    });
    viewerApi.applyAnimState?.(parsed.animState);
    return;
  }

  viewerApi.setActiveLayerDisplay(
    {
      atomScale: nextSettings.details.atomScale,
      sphereSegments: nextSettings.details.sphereSegments,
      showBonds: nextSettings.details.showBonds,
      bondFactor: nextSettings.details.bondFactor,
      bondRadius: nextSettings.details.bondRadius,
      atomRoughness: nextSettings.details.atomRoughness,
    },
    { applyToAll: true },
  );
  if (parsed.applyAllLayers.colors) {
    viewerApi.setAllLayersColorMap(nextSettings.colors.data);
    viewerApi.refreshColorMap({ applyToAll: true });
  }
  else {
    viewerApi.setActiveLayerColorMap(nextSettings.colors.data);
    viewerApi.refreshColorMap({ applyToAll: false });
  }
  viewerApi.resetAllLayersTypeMapToDefaults({
    templateMap: nextSettings.lammps.data,
    useAtomDefaults: false,
  });
  viewerApi.applyAnimState?.(parsed.animState);
}
