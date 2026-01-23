import type { ViewerSettings } from './settings';
import { DEFAULT_SETTINGS } from './settings';
import type { ViewerSettingsCategorized } from './sessionTypes';

export type CategorizedSettings = Partial<ViewerSettingsCategorized> & {
  files?: {
    exportPngScale: number;
    exportPngTransparent: boolean;
    cacheRemoteOnExport: boolean;
  };
  view?: ViewerSettingsCategorized['view'];
  rotation?: ViewerSettingsCategorized['rotation'];
  details?: ViewerSettingsCategorized['details'];
  lammps?: ViewerSettingsCategorized['lammps'];
  colors?: ViewerSettingsCategorized['colors'];
  other?: Partial<ViewerSettingsCategorized['other']>;
};

export function buildCategorizedSettings(
  settings: ViewerSettings,
): ViewerSettingsCategorized {
  return {
    files: {
      exportPngScale: settings.exportPngScale,
      exportPngTransparent: settings.exportPngTransparent,
      cacheRemoteOnExport: settings.cacheRemoteOnExport,
    },
    rotation: {
      enabled: settings.autoRotate.enabled,
      presetId: settings.autoRotate.presetId,
      speedDegPerSec: settings.autoRotate.speedDegPerSec,
      pauseOnInteract: settings.autoRotate.pauseOnInteract,
      resumeDelayMs: settings.autoRotate.resumeDelayMs,
    },
    view: {
      viewPresets: settings.viewPresets ?? [],
      dualViewSplit: Number(settings.dualViewSplit ?? DEFAULT_SETTINGS.dualViewSplit),
      orthographic: settings.orthographic,
      dualViewDistance: Number(settings.dualViewDistance ?? DEFAULT_SETTINGS.dualViewDistance),
      rotationDeg: settings.rotationDeg,
      initialDualViewDistance: Number(settings.initialDualViewDistance ?? DEFAULT_SETTINGS.initialDualViewDistance),
    },
    lammps: (settings.lammpsTypeMap ?? []).map(r => ({ ...r })),
    details: {
      representation: settings.representation,
      showBonds: settings.showBonds,
      bondRadius: settings.bondRadius,
      atomScale: settings.atomScale,
      atomRoughness: settings.atomRoughness,
      bondFactor: settings.bondFactor,
      sphereSegments: settings.sphereSegments,
    },
    colors: (settings.colorMapTemplate ?? []).map(r => ({ ...r })),
    other: {
      themeMode: settings.themeMode,
      themeReadabilityCheckOnOpen: settings.themeReadabilityCheckOnOpen,
      visualStyle: settings.visualStyle,
      modelLightIntensity: settings.modelLightIntensity,
      showAxes: settings.showAxes,
      autoRotateOnLoad: settings.autoRotateOnLoad,
      refreshBondsOnPlay: settings.refreshBondsOnPlay,
      frame_rate: settings.frame_rate,
      backgroundColor: settings.backgroundColor,
      backgroundColorMode: settings.backgroundColorMode,
      backgroundTransparent: settings.backgroundTransparent,
    },
  };
}

export function flattenCategorizedSettings(
  categorized: CategorizedSettings,
): ViewerSettings {
  const base: ViewerSettings = { ...DEFAULT_SETTINGS };
  const apply = categorized || {};

  if (apply.files) {
    base.exportPngScale = apply.files.exportPngScale ?? base.exportPngScale;
    base.exportPngTransparent = apply.files.exportPngTransparent ?? base.exportPngTransparent;
    base.cacheRemoteOnExport = apply.files.cacheRemoteOnExport ?? base.cacheRemoteOnExport;
  }

  if (apply.rotation) {
    base.autoRotate = { ...base.autoRotate, ...apply.rotation };
  }

  if (apply.view) {
    base.rotationDeg = apply.view.rotationDeg ?? base.rotationDeg;
    if (apply.view.orthographic !== undefined) base.orthographic = apply.view.orthographic;
    if (apply.view.viewPresets) base.viewPresets = apply.view.viewPresets;
    if (apply.view.dualViewDistance !== undefined) base.dualViewDistance = apply.view.dualViewDistance;
    if (apply.view.initialDualViewDistance !== undefined) base.initialDualViewDistance = apply.view.initialDualViewDistance;
    if (apply.view.dualViewSplit !== undefined) base.dualViewSplit = apply.view.dualViewSplit;
  }

  if (apply.details) {
    base.representation = apply.details.representation ?? base.representation;
    base.atomScale = apply.details.atomScale ?? base.atomScale;
    base.sphereSegments = apply.details.sphereSegments ?? base.sphereSegments;
    base.showBonds = apply.details.showBonds ?? base.showBonds;
    base.bondFactor = apply.details.bondFactor ?? base.bondFactor;
    base.bondRadius = apply.details.bondRadius ?? base.bondRadius;
    base.atomRoughness = apply.details.atomRoughness ?? base.atomRoughness;
  }

  if (apply.lammps) {
    base.lammpsTypeMap = apply.lammps.map(r => ({ ...r }));
  }
  if (apply.colors) {
    const rows = Array.isArray(apply.colors)
      ? apply.colors
      : Array.isArray(apply.colors.rows)
        ? apply.colors.rows
        : [];
    base.colorMapTemplate = rows.map(r => ({ ...r }));
  }

  if (apply.other) {
    Object.assign(base, apply.other);
  }

  return base;
}
