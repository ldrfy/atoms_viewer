import type { ViewerPublicApi } from './bridge';
import type { ViewerSettings } from './settings';
import { buildColorTemplateRows } from './settings';
import type { LayerSnapshot } from './sessionTypes';
import type { SupportLocale } from '../../i18n';
import { PANEL_KEYS } from './panelKeys';

import {
  buildDefaultSettings,
  clearSettingsStorage,
  saveSettingsToStorage,
} from './settingsStorage';
import { clearSessionStorage } from './sessionStorage';
import { buildSettingsSnapshot } from './projectPackage';
import { flattenCategorizedSettings } from './sessionTemplates';

export type ParsedSettingsImport = {
  nextSettings: ViewerSettings;
  locale?: SupportLocale;
  layers?: LayerSnapshot[];
  applyAllLayers: {
    details: boolean;
    colors: boolean;
  };
  animState: {
    frameIndex: number;
    playFps: number;
    recordDelaySec: number;
  };
};

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
    templateRows: [...(defaults.lammps ?? [])],
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
  };
}): Promise<{ json: string; fileStem: string }> {
  const { settings, viewerApi, locale, applyAllLayers } = params;
  const data = settings;
  const layerSnapshots: LayerSnapshot[] = viewerApi?.getLayerSnapshots
    ? await viewerApi.getLayerSnapshots()
    : [];
  const animState = viewerApi?.getAnimState ? viewerApi.getAnimState() : undefined;
  const payload = buildSettingsSnapshot(
    data,
    layerSnapshots,
    locale ? { locale } : undefined,
    animState,
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

  if (!topSettings || typeof topSettings !== 'object') {
    throw new Error('Invalid settings format');
  }

  const categorized = topSettings as any;
  const anim = categorized.anim as Record<string, unknown> | undefined;
  const details = categorized.details as Record<string, unknown> | undefined;
  const colors = categorized.colors as Record<string, unknown> | undefined;
  const applyAllLayers = {
    details: typeof details?.applyAllLayers === 'boolean' ? details.applyAllLayers : true,
    colors: typeof colors?.applyAllLayers === 'boolean' ? colors.applyAllLayers : true,
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

  const extractedSettings = flattenCategorizedSettings(categorized as any);
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
  const hasLayerSnapshots = Array.isArray(layers) && layers.length > 0;
  if (hasLayerSnapshots && viewerApi.applyLayerSnapshots) {
    await viewerApi.applyLayerSnapshots(layers as LayerSnapshot[]);
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
  const colorRows = buildColorTemplateRows(nextSettings.colors.data);
  if (parsed.applyAllLayers.colors) {
    viewerApi.setAllLayersColorMap(colorRows);
    viewerApi.refreshColorMap({ applyToAll: true });
  }
  else {
    viewerApi.setActiveLayerColorMap(colorRows);
    viewerApi.refreshColorMap({ applyToAll: false });
  }
  viewerApi.resetAllLayersTypeMapToDefaults({
    templateRows: [...(nextSettings.lammps ?? [])],
    useAtomDefaults: false,
  });
  viewerApi.applyAnimState?.(parsed.animState);
}
