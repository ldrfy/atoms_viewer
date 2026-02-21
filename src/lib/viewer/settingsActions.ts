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
import { DEFAULT_COLORS, DEFAULT_DETAILS, DEFAULT_LAMMPS } from './settings';

export type ParsedSettingsImport = {
  nextSettings: ViewerSettings;
  locale?: SupportLocale;
  layers?: LayersSnapshot;
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

  // 清空当前选中，保留缓存选中。
  // Clear current selections only; keep cached selections.
  viewerApi.clearSelections();

  viewerApi.setActiveLayerDisplay(
    {
      atomScale: DEFAULT_DETAILS.atomScale,
      showBonds: DEFAULT_DETAILS.showBonds,
      sphereSegments: DEFAULT_DETAILS.sphereSegments,
      bondFactor: DEFAULT_DETAILS.bondFactor,
      bondRadius: DEFAULT_DETAILS.bondRadius,
      atomRoughness: DEFAULT_DETAILS.atomRoughness,
      showAtomIndex: DEFAULT_DETAILS.showAtomIndex,
      showElementSymbol: DEFAULT_DETAILS.showElementSymbol,
    },
    { applyToAll: true },
  );

  viewerApi.resetAllLayersTypeMapToDefaults({
    templateMap: DEFAULT_LAMMPS.data,
    useAtomDefaults: false,
  });
  viewerApi.resetAllLayersColorMapToDefaults();
  viewerApi.resetAllLayersAnimToDefaults();
  if (Object.keys(DEFAULT_COLORS.data ?? {}).length > 0) {
    viewerApi.setAllLayersColorMap(DEFAULT_COLORS.data);
  }

  return nextSettings;
}

export async function clearAllSettings(params: {
  currentSettings: ViewerSettings;
  viewerApi: ViewerPublicApi | null;
  replaceSettings: (next: ViewerSettings) => void;
  nextTick?: () => Promise<void>;
  onAfterClear?: () => void;
}): Promise<void> {
  // 先清空当前模型，避免立即把会话重新写回本地。
  // Clear current models first to prevent re-saving the session.
  try {
    const api = params.viewerApi;
    const ids = api?.layers?.value?.map(l => l.id) ?? [];
    for (const id of ids) {
      api?.removeLayer?.(id);
    }
  }
  catch {
    // ignore
  }
  clearSettingsStorage();
  // 清理本地缓存/偏好（不包含 settings 本身，会在下方重新写入）。
  // Clear local caches/preferences (settings will be re-saved below).
  try {
    const keys = [
      'atomsViewer.layerSnapshotCache.v1',
      'atomsViewer.cacheRemoteModels',
      'settings.details.applyAllLayers',
      'settings.colors.applyAllLayers',
      'settings.lammps.applyAllLayers',
      'settings.scope.colors',
      'settings.scope.details',
      'settings.scope.lammps',
      'settingsDrawer.desktopWidth',
      'settingsDrawer.mobileHeight',
      'themeMode',
      'locale',
    ];
    for (const key of keys) localStorage.removeItem(key);
  }
  catch {
    // ignore
  }
  params.onAfterClear?.();
  const nextSettings = await applyDefaultSettings(params);
  saveSettingsToStorage(nextSettings);
  await clearSessionStorage();
}

export async function buildSettingsExportJson(params: {
  settings: ViewerSettings;
  viewerApi: ViewerPublicApi | null;
  locale?: SupportLocale;
  fullSettings?: boolean;
}): Promise<{ json: string; fileStem: string }> {
  const { settings, viewerApi, locale, fullSettings } = params;
  const data = settings;
  const layerSnapshots: LayerSnapshot[] = viewerApi?.getLayerSnapshots
    ? await viewerApi.getLayerSnapshots()
    : [];
  const layersSortBy = viewerApi?.layerSortBy?.value ?? 'name,ASC';
  const payload = buildSettingsSnapshot(
    data,
    layerSnapshots,
    locale ? { locale } : undefined,
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

  const extractedSettings = mergeCategorizedSettings(topSettings as any);
  const nextSettings = extractedSettings as ViewerSettings;
  return {
    nextSettings,
    locale,
    layers,
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
    return;
  }
}
