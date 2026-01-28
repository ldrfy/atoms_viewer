import type { ViewerSettings } from './settings';
import { DEFAULT_SETTINGS } from './settings';
import type { ViewerSettingsCategorized } from './sessionTypes';

export type CategorizedSettings = ViewerSettingsCategorized;

export function buildCategorizedSettings(
  settings: ViewerSettings,
  animState?: Partial<NonNullable<ViewerSettingsCategorized['anim']>>,
  applyAllLayers?: Partial<{ details: boolean; colors: boolean }>,
): ViewerSettingsCategorized {
  const nextAnim = {
    ...settings.anim,
    ...(animState ?? {}),
  };
  return {
    files: { ...settings.files },
    rotation: { ...settings.rotation },
    view: {
      ...settings.view,
      rotationDeg: { ...settings.view.rotationDeg },
      viewPresets: settings.view.viewPresets ? [...settings.view.viewPresets] : [],
    },
    lammps: (settings.lammps ?? []).map(r => ({ ...r })),
    details: {
      ...settings.details,
      applyAllLayers: applyAllLayers?.details ?? settings.details.applyAllLayers,
    },
    colors: {
      applyAllLayers: applyAllLayers?.colors ?? settings.colors.applyAllLayers,
      data: { ...settings.colors.data },
    },
    anim: {
      ...nextAnim,
    },
    other: { ...settings.other },
  };
}

export function mergeCategorizedSettings(
  categorized: CategorizedSettings | Partial<CategorizedSettings>,
): ViewerSettings {
  const base: ViewerSettings = {
    files: { ...DEFAULT_SETTINGS.files },
    rotation: { ...DEFAULT_SETTINGS.rotation },
    view: {
      ...DEFAULT_SETTINGS.view,
      rotationDeg: { ...DEFAULT_SETTINGS.view.rotationDeg },
      viewPresets: DEFAULT_SETTINGS.view.viewPresets
        ? [...DEFAULT_SETTINGS.view.viewPresets]
        : [],
    },
    lammps: [...(DEFAULT_SETTINGS.lammps ?? [])],
    details: { ...DEFAULT_SETTINGS.details },
    colors: {
      applyAllLayers: DEFAULT_SETTINGS.colors.applyAllLayers,
      data: { ...DEFAULT_SETTINGS.colors.data },
    },
    anim: { ...DEFAULT_SETTINGS.anim },
    other: { ...DEFAULT_SETTINGS.other },
  };
  const apply = categorized as Partial<CategorizedSettings>;

  if (apply.files) {
    base.files = {
      ...base.files,
      ...apply.files,
    };
  }

  if (apply.rotation) {
    base.rotation = {
      ...base.rotation,
      ...apply.rotation,
    };
  }

  if (apply.view) {
    const nextRotation = apply.view.rotationDeg
      ? { ...base.view.rotationDeg, ...apply.view.rotationDeg }
      : base.view.rotationDeg;
    base.view = {
      ...base.view,
      ...apply.view,
      rotationDeg: nextRotation,
      viewPresets: apply.view.viewPresets ?? base.view.viewPresets,
    };
  }

  if (apply.lammps) {
    base.lammps = apply.lammps.map(r => ({ ...r }));
  }

  if (apply.details) {
    base.details = {
      ...base.details,
      ...apply.details,
    };
  }

  if (apply.colors) {
    base.colors = {
      ...base.colors,
      ...apply.colors,
      data: apply.colors.data ? { ...base.colors.data, ...apply.colors.data } : base.colors.data,
    };
  }

  if (apply.anim) {
    base.anim = {
      ...base.anim,
      ...apply.anim,
    };
  }

  if (apply.other) {
    base.other = {
      ...base.other,
      ...apply.other,
    };
  }

  return base;
}

function arraysEqual<T>(a: T[] | undefined, b: T[] | undefined): boolean {
  if (a === b) return true;
  const aa = a ?? [];
  const bb = b ?? [];
  if (aa.length !== bb.length) return false;
  for (let i = 0; i < aa.length; i += 1) {
    if (aa[i] !== bb[i]) return false;
  }
  return true;
}

function lammpsEqual(a: CategorizedSettings['lammps'], b: CategorizedSettings['lammps']): boolean {
  if (a === b) return true;
  const aa = a ?? [];
  const bb = b ?? [];
  if (aa.length !== bb.length) return false;
  for (let i = 0; i < aa.length; i += 1) {
    if (aa[i]?.typeId !== bb[i]?.typeId) return false;
    if (aa[i]?.element !== bb[i]?.element) return false;
  }
  return true;
}

/**
 * Remove default-valued fields from categorized settings.
 * 仅保留与默认值不同的字段（导出时减少体积，导入时按默认补全）。
 */
export function pruneDefaultSettings(
  input: ViewerSettingsCategorized,
): Partial<ViewerSettingsCategorized> {
  const out: Partial<ViewerSettingsCategorized> = {};
  const d = DEFAULT_SETTINGS;

  const files: Partial<ViewerSettingsCategorized['files']> = {};
  if (input.files.exportPngScale !== d.files.exportPngScale) files.exportPngScale = input.files.exportPngScale;
  if (input.files.exportPngTransparent !== d.files.exportPngTransparent) files.exportPngTransparent = input.files.exportPngTransparent;
  if (input.files.cacheRemoteOnExport !== d.files.cacheRemoteOnExport) files.cacheRemoteOnExport = input.files.cacheRemoteOnExport;
  if (Object.keys(files).length > 0) out.files = files as ViewerSettingsCategorized['files'];

  const rotation: Partial<ViewerSettingsCategorized['rotation']> = {};
  if (input.rotation.enabled !== d.rotation.enabled) rotation.enabled = input.rotation.enabled;
  if (input.rotation.presetId !== d.rotation.presetId) rotation.presetId = input.rotation.presetId;
  if (input.rotation.speedDegPerSec !== d.rotation.speedDegPerSec) rotation.speedDegPerSec = input.rotation.speedDegPerSec;
  if (input.rotation.pauseOnInteract !== d.rotation.pauseOnInteract) rotation.pauseOnInteract = input.rotation.pauseOnInteract;
  if (input.rotation.resumeDelayMs !== d.rotation.resumeDelayMs) rotation.resumeDelayMs = input.rotation.resumeDelayMs;
  if (Object.keys(rotation).length > 0) out.rotation = rotation as ViewerSettingsCategorized['rotation'];

  const view: Partial<ViewerSettingsCategorized['view']> & { rotationDeg?: Partial<ViewerSettingsCategorized['view']['rotationDeg']> } = {};
  const rot: Partial<ViewerSettingsCategorized['view']['rotationDeg']> = {};
  if (input.view.rotationDeg.x !== d.view.rotationDeg.x) rot.x = input.view.rotationDeg.x;
  if (input.view.rotationDeg.y !== d.view.rotationDeg.y) rot.y = input.view.rotationDeg.y;
  if (input.view.rotationDeg.z !== d.view.rotationDeg.z) rot.z = input.view.rotationDeg.z;
  if (Object.keys(rot).length > 0) view.rotationDeg = rot as ViewerSettingsCategorized['view']['rotationDeg'];
  if (input.view.orthographic !== d.view.orthographic) view.orthographic = input.view.orthographic;
  if (input.view.resetViewSeq !== d.view.resetViewSeq) view.resetViewSeq = input.view.resetViewSeq;
  if (!arraysEqual(input.view.viewPresets, d.view.viewPresets)) view.viewPresets = input.view.viewPresets;
  if (input.view.dualViewDistance !== d.view.dualViewDistance) view.dualViewDistance = input.view.dualViewDistance;
  if (input.view.initialDualViewDistance !== d.view.initialDualViewDistance) {
    view.initialDualViewDistance = input.view.initialDualViewDistance;
  }
  if (input.view.dualViewSplit !== d.view.dualViewSplit) view.dualViewSplit = input.view.dualViewSplit;
  if (Object.keys(view).length > 0) out.view = view as ViewerSettingsCategorized['view'];

  if (!lammpsEqual(input.lammps, d.lammps)) {
    out.lammps = (input.lammps ?? []).map(r => ({ ...r }));
  }

  const details: Partial<ViewerSettingsCategorized['details']> = {};
  if (input.details.representation !== d.details.representation) details.representation = input.details.representation;
  if (input.details.atomScale !== d.details.atomScale) details.atomScale = input.details.atomScale;
  if (input.details.showBonds !== d.details.showBonds) details.showBonds = input.details.showBonds;
  if (input.details.sphereSegments !== d.details.sphereSegments) details.sphereSegments = input.details.sphereSegments;
  if (input.details.bondFactor !== d.details.bondFactor) details.bondFactor = input.details.bondFactor;
  if (input.details.bondRadius !== d.details.bondRadius) details.bondRadius = input.details.bondRadius;
  if (input.details.atomRoughness !== d.details.atomRoughness) details.atomRoughness = input.details.atomRoughness;
  if (input.details.applyAllLayers !== d.details.applyAllLayers) details.applyAllLayers = input.details.applyAllLayers;
  if (Object.keys(details).length > 0) out.details = details as ViewerSettingsCategorized['details'];

  const colors: Partial<ViewerSettingsCategorized['colors']> & { data?: Record<string, string> } = {};
  if (input.colors.applyAllLayers !== d.colors.applyAllLayers) colors.applyAllLayers = input.colors.applyAllLayers;
  const colorData: Record<string, string> = {};
  for (const [key, val] of Object.entries(input.colors.data ?? {})) {
    if (d.colors.data[key] !== val) colorData[key] = val;
  }
  if (Object.keys(colorData).length > 0) colors.data = colorData;
  if (Object.keys(colors).length > 0) out.colors = colors as ViewerSettingsCategorized['colors'];

  const anim: Partial<ViewerSettingsCategorized['anim']> = {};
  if (input.anim.backgroundColor !== d.anim.backgroundColor) anim.backgroundColor = input.anim.backgroundColor;
  if (input.anim.backgroundColorMode !== d.anim.backgroundColorMode) anim.backgroundColorMode = input.anim.backgroundColorMode;
  if (input.anim.backgroundTransparent !== d.anim.backgroundTransparent) anim.backgroundTransparent = input.anim.backgroundTransparent;
  if (input.anim.backgroundTransparent === false) {
    anim.backgroundColor = input.anim.backgroundColor;
    anim.backgroundColorMode = input.anim.backgroundColorMode;
  }
  if (input.anim.frameIndex !== d.anim.frameIndex) anim.frameIndex = input.anim.frameIndex;
  if (input.anim.playFps !== d.anim.playFps) anim.playFps = input.anim.playFps;
  if (input.anim.recordDelaySec !== d.anim.recordDelaySec) anim.recordDelaySec = input.anim.recordDelaySec;
  if (Object.keys(anim).length > 0) out.anim = anim as ViewerSettingsCategorized['anim'];

  const other: Partial<ViewerSettingsCategorized['other']> = {};
  if (input.other.themeMode !== d.other.themeMode) other.themeMode = input.other.themeMode;
  if (input.other.themeReadabilityCheckOnOpen !== d.other.themeReadabilityCheckOnOpen) {
    other.themeReadabilityCheckOnOpen = input.other.themeReadabilityCheckOnOpen;
  }
  if (input.other.visualStyle !== d.other.visualStyle) other.visualStyle = input.other.visualStyle;
  if (input.other.modelLightIntensity !== d.other.modelLightIntensity) other.modelLightIntensity = input.other.modelLightIntensity;
  if (input.other.showAxes !== d.other.showAxes) other.showAxes = input.other.showAxes;
  if (input.other.autoRotateOnLoad !== d.other.autoRotateOnLoad) other.autoRotateOnLoad = input.other.autoRotateOnLoad;
  if (input.other.refreshBondsOnPlay !== d.other.refreshBondsOnPlay) other.refreshBondsOnPlay = input.other.refreshBondsOnPlay;
  if (input.other.frame_rate !== d.other.frame_rate) other.frame_rate = input.other.frame_rate;
  if (Object.keys(other).length > 0) out.other = other as ViewerSettingsCategorized['other'];

  return out;
}
