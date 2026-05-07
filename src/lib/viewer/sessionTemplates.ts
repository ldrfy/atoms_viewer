import type { ViewerSettings } from './settings';
import { DEFAULT_SETTINGS } from './settings';
import type { ViewerSettingsCategorized } from './sessionTypes';

export type CategorizedSettings = ViewerSettingsCategorized;

export function buildCategorizedSettings(
  settings: ViewerSettings,
): ViewerSettingsCategorized {
  return {
    files: { ...settings.files },
    rotation: { ...settings.rotation },
    view: {
      ...settings.view,
      rotationDeg: { ...settings.view.rotationDeg },
      viewPresets: settings.view.viewPresets ? [...settings.view.viewPresets] : [],
    },
    pan: {
      panOffset: { ...settings.pan.panOffset },
      panOffsetLeft: { ...settings.pan.panOffsetLeft },
      panOffsetRight: { ...settings.pan.panOffsetRight },
    },
    record: { ...settings.record },
    effectRange: { ...settings.effectRange },
    other: {
      ...settings.other,
    },
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
    pan: {
      panOffset: { ...DEFAULT_SETTINGS.pan.panOffset },
      panOffsetLeft: { ...DEFAULT_SETTINGS.pan.panOffsetLeft },
      panOffsetRight: { ...DEFAULT_SETTINGS.pan.panOffsetRight },
    },
    record: { ...DEFAULT_SETTINGS.record },
    effectRange: { ...DEFAULT_SETTINGS.effectRange },
    other: {
      ...DEFAULT_SETTINGS.other,
    },
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

  // 平移设置独立合并，避免覆盖其他轴。
  // Merge pan settings without clobbering untouched axes.
  if (apply.pan) {
    base.pan = {
      ...base.pan,
      ...apply.pan,
      panOffset: apply.pan.panOffset
        ? { ...base.pan.panOffset, ...apply.pan.panOffset }
        : base.pan.panOffset,
      panOffsetLeft: apply.pan.panOffsetLeft
        ? { ...base.pan.panOffsetLeft, ...apply.pan.panOffsetLeft }
        : base.pan.panOffsetLeft,
      panOffsetRight: apply.pan.panOffsetRight
        ? { ...base.pan.panOffsetRight, ...apply.pan.panOffsetRight }
        : base.pan.panOffsetRight,
    };
  }

  if (apply.record) {
    base.record = {
      ...base.record,
      ...apply.record,
    };
  }

  if (apply.effectRange) {
    base.effectRange = {
      ...base.effectRange,
      ...apply.effectRange,
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

/**
 * Remove default-valued fields from categorized settings.
 * 仅保留与默认值不同的字段（导出时减小体积，导入时按默认补全）。
 */
export function pruneDefaultSettings(
  input: ViewerSettingsCategorized,
): Partial<ViewerSettingsCategorized> {
  const out: Partial<ViewerSettingsCategorized> = {};
  const d = DEFAULT_SETTINGS;

  const files: Partial<ViewerSettingsCategorized['files']> = {};
  if (input.files.exportPngScale !== d.files.exportPngScale) files.exportPngScale = input.files.exportPngScale;
  if (input.files.exportPngTransparent !== d.files.exportPngTransparent) files.exportPngTransparent = input.files.exportPngTransparent;
  if (input.files.exportImageFormat !== d.files.exportImageFormat) files.exportImageFormat = input.files.exportImageFormat;
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
  if (input.view.dualViewDistance !== d.view.dualViewDistance) view.dualViewDistance = input.view.dualViewDistance;
  if (input.view.initialDualViewDistance !== d.view.initialDualViewDistance) {
    view.initialDualViewDistance = input.view.initialDualViewDistance;
  }
  if (input.view.dualViewSplit !== d.view.dualViewSplit) view.dualViewSplit = input.view.dualViewSplit;
  const curPresets = input.view.viewPresets ?? [];
  const defPresets = d.view.viewPresets ?? [];
  const presetsDiff = curPresets.length !== defPresets.length
    || curPresets.some((v, i) => v !== defPresets[i]);
  if (presetsDiff) view.viewPresets = curPresets;
  if (Object.keys(view).length > 0) out.view = view as ViewerSettingsCategorized['view'];

  const pan: Partial<ViewerSettingsCategorized['pan']> = {};
  if (
    input.pan.panOffset.x !== d.pan.panOffset.x
    || input.pan.panOffset.y !== d.pan.panOffset.y
    || input.pan.panOffset.z !== d.pan.panOffset.z
  ) {
    pan.panOffset = { ...input.pan.panOffset };
  }
  if (
    input.pan.panOffsetLeft.x !== d.pan.panOffsetLeft.x
    || input.pan.panOffsetLeft.y !== d.pan.panOffsetLeft.y
    || input.pan.panOffsetLeft.z !== d.pan.panOffsetLeft.z
  ) {
    pan.panOffsetLeft = { ...input.pan.panOffsetLeft };
  }
  if (
    input.pan.panOffsetRight.x !== d.pan.panOffsetRight.x
    || input.pan.panOffsetRight.y !== d.pan.panOffsetRight.y
    || input.pan.panOffsetRight.z !== d.pan.panOffsetRight.z
  ) {
    pan.panOffsetRight = { ...input.pan.panOffsetRight };
  }
  if (Object.keys(pan).length > 0) out.pan = pan as ViewerSettingsCategorized['pan'];

  const record: Partial<ViewerSettingsCategorized['record']> = {};
  if (input.record.frame_rate !== d.record.frame_rate) record.frame_rate = input.record.frame_rate;
  if (input.record.recordDelaySec !== d.record.recordDelaySec) record.recordDelaySec = input.record.recordDelaySec;
  if (input.record.recordCropBox) {
    const b = input.record.recordCropBox;
    const db = d.record.recordCropBox;
    const diff = !db
      || b.x !== db.x
      || b.y !== db.y
      || b.w !== db.w
      || b.h !== db.h;
    if (diff) record.recordCropBox = { ...b };
  }
  if (Object.keys(record).length > 0) out.record = record as ViewerSettingsCategorized['record'];

  const effectRange: Partial<ViewerSettingsCategorized['effectRange']> = {};
  if (input.effectRange.colors !== d.effectRange.colors) effectRange.colors = input.effectRange.colors;
  if (input.effectRange.details !== d.effectRange.details) effectRange.details = input.effectRange.details;
  if (input.effectRange.lammps !== d.effectRange.lammps) effectRange.lammps = input.effectRange.lammps;
  if (Object.keys(effectRange).length > 0) out.effectRange = effectRange as ViewerSettingsCategorized['effectRange'];

  const other: Partial<ViewerSettingsCategorized['other']> = {};
  if (input.other.themeMode !== d.other.themeMode) other.themeMode = input.other.themeMode;
  if (input.other.themeReadabilityCheckOnOpen !== d.other.themeReadabilityCheckOnOpen) {
    other.themeReadabilityCheckOnOpen = input.other.themeReadabilityCheckOnOpen;
  }
  if (input.other.visualStyle !== d.other.visualStyle) other.visualStyle = input.other.visualStyle;
  if (input.other.modelLightIntensity !== d.other.modelLightIntensity) other.modelLightIntensity = input.other.modelLightIntensity;
  if (input.other.showAxes !== d.other.showAxes) other.showAxes = input.other.showAxes;
  if (input.other.refreshBondsOnPlay !== d.other.refreshBondsOnPlay) other.refreshBondsOnPlay = input.other.refreshBondsOnPlay;
  if (input.other.keepActiveLayerOnHide !== d.other.keepActiveLayerOnHide) {
    other.keepActiveLayerOnHide = input.other.keepActiveLayerOnHide;
  }
  if (input.other.selectionHighlightColor !== d.other.selectionHighlightColor) {
    other.selectionHighlightColor = input.other.selectionHighlightColor;
  }
  if (input.other.showSelectionLines !== d.other.showSelectionLines) {
    other.showSelectionLines = input.other.showSelectionLines;
  }
  if (input.other.panStepScale !== d.other.panStepScale) {
    other.panStepScale = input.other.panStepScale;
  }
  if (input.other.backgroundColor !== d.other.backgroundColor) {
    other.backgroundColor = input.other.backgroundColor;
  }
  if (input.other.backgroundColorMode !== d.other.backgroundColorMode) {
    other.backgroundColorMode = input.other.backgroundColorMode;
  }
  if (input.other.backgroundTransparent !== d.other.backgroundTransparent) {
    other.backgroundTransparent = input.other.backgroundTransparent;
  }
  if (Object.keys(other).length > 0) out.other = other as ViewerSettingsCategorized['other'];

  return out;
}
