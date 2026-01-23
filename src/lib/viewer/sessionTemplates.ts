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
    rotation: settings.autoRotate,
    view: {
      rotationDeg: settings.rotationDeg,
      orthographic: settings.orthographic,
      viewPresets: settings.viewPresets ?? [],
      dualViewEnabled: settings.dualViewEnabled ?? false,
      dualViewDistance: Number(settings.dualViewDistance ?? DEFAULT_SETTINGS.dualViewDistance),
      initialDualViewDistance: Number(settings.initialDualViewDistance ?? DEFAULT_SETTINGS.initialDualViewDistance),
      dualViewSplit: Number(settings.dualViewSplit ?? DEFAULT_SETTINGS.dualViewSplit),
      resetViewSeq: Number(settings.resetViewSeq ?? 0),
    },
    details: {
      atomScale: settings.atomScale,
      sphereSegments: settings.sphereSegments,
      showBonds: settings.showBonds,
      bondFactor: settings.bondFactor,
      bondRadius: settings.bondRadius,
      atomRoughness: settings.atomRoughness,
    },
    lammps: (settings.lammpsTypeMap ?? []).map(r => ({ ...r })),
    colors: (settings.colorMapTemplate ?? []).map(r => ({ ...r })),
    other: {
      showAxes: settings.showAxes,
      refreshBondsOnPlay: settings.refreshBondsOnPlay,
      backgroundColor: settings.backgroundColor,
      backgroundColorMode: settings.backgroundColorMode,
      backgroundTransparent: settings.backgroundTransparent,
      themeReadabilityCheckOnOpen: settings.themeReadabilityCheckOnOpen,
      modelLightIntensity: settings.modelLightIntensity,
      frame_rate: settings.frame_rate,
      autoRotateOnLoad: settings.autoRotateOnLoad,
      themeMode: settings.themeMode,
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
    if (apply.view.dualViewEnabled !== undefined) base.dualViewEnabled = apply.view.dualViewEnabled;
    if (apply.view.dualViewDistance !== undefined) base.dualViewDistance = apply.view.dualViewDistance;
    if (apply.view.initialDualViewDistance !== undefined) base.initialDualViewDistance = apply.view.initialDualViewDistance;
    if (apply.view.dualViewSplit !== undefined) base.dualViewSplit = apply.view.dualViewSplit;
    if (apply.view.resetViewSeq !== undefined) base.resetViewSeq = apply.view.resetViewSeq;
  }

  if (apply.details) {
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
    base.colorMapTemplate = apply.colors.map(r => ({ ...r }));
  }

  if (apply.other) {
    Object.assign(base, apply.other);
  }

  return base;
}
