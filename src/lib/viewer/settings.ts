import type { ViewPreset } from './viewPresets';
import type { ThemeMode } from '../../theme/mode';
import type { AutoRotatePresetId } from './autoRotate';
export type LammpsTypeMapRecord = Record<string, string>;

export type InspectSelectionItem = {
  atomIndex: number;
  element?: string;
  id?: number;
  typeId?: number;
  position?: [number, number, number];
  // Order index in the global selection list.
  // 全局选中列表中的顺序索引。
  order?: number;
};

export type RotationDeg = {
  x: number;
  y: number;
  z: number;
};

export type RotateSettingsGroup = {
  /** Enable auto rotation in the render loop. */
  enabled: boolean;
  /** Built-in preset id (UI maps it to an axis direction). */
  presetId: AutoRotatePresetId;
  /** Angular speed in degrees per second (independent from preset). */
  speedDegPerSec: number;
  /** Pause auto-rotation while user is interacting (OrbitControls start/end). */
  pauseOnInteract: boolean;
  /** Resume delay after interaction end (ms). */
  resumeDelayMs: number;
};

export type VisualStyleId = 'default' | 'jmol';
export type RepresentationId
  = | 'ballAndStick'
    | 'stick'
    | 'wireframe'
    | 'spacefill'
    | 'points'
    | 'custom';

/**
 * ViewerSettings 与导出设置结构一致：
 * files -> rotation -> view -> pan -> record -> other
 */
export type ViewerSettings = {
  files: FileSettingsGroup;
  rotation: RotateSettingsGroup;
  view: DisplaySettingsGroup;
  pan: PanSettingsGroup;
  record: RecordSettingsGroup;
  effectRange: EffectRangeSettingsGroup;
  other: OtherSettingsGroup;
};

export type DetailsSettingsGroup = {
  representation: RepresentationId;
  atomScale: number;
  showBonds: boolean;
  sphereSegments: number;
  bondFactor: number;
  bondRadius: number;
  atomRoughness: number;
  showAtomIndex: boolean;
  showElementSymbol: boolean;
};

export const DEFAULT_DETAILS: DetailsSettingsGroup = {
  representation: 'ballAndStick',
  atomScale: 1,
  showBonds: true,
  sphereSegments: 24,
  bondFactor: 1.05,
  bondRadius: 0.1,
  atomRoughness: 0.35,
  showAtomIndex: false,
  showElementSymbol: false,
};

// 分组默认值（与设置面板分类一致）
export type FileSettingsGroup = {
  exportPngScale: number;
  exportPngTransparent: boolean;
  exportImageFormat: 'png' | 'webp' | 'jpg';
  cacheRemoteOnExport: boolean;
};
export const DEFAULT_FILES: FileSettingsGroup = {
  exportPngScale: 2,
  exportPngTransparent: true,
  exportImageFormat: 'png',
  cacheRemoteOnExport: true,
};

export const DEFAULT_AUTO_ROTATE: RotateSettingsGroup = {
  enabled: false,
  presetId: 'diag',
  speedDegPerSec: 8,
  pauseOnInteract: true,
  resumeDelayMs: 600,
};

export type DisplaySettingsGroup = {
  rotationDeg: RotationDeg;
  orthographic: boolean;
  resetViewSeq?: number;
  viewPresets: ViewPreset[];
  dualViewDistance: number;
  initialDualViewDistance: number;
  dualViewSplit: number;
};
export const DEFAULT_DISPLAY: DisplaySettingsGroup = {
  rotationDeg: { x: 0, y: 0, z: 0 } as RotationDeg,
  orthographic: false,
  resetViewSeq: 0,
  viewPresets: ['front'] as ViewPreset[],
  dualViewDistance: 10,
  initialDualViewDistance: 10,
  dualViewSplit: 0.5,
};

export const DEFAULT_TYPE_MAP: LammpsTypeMapRecord = {};
export const DEFAULT_COLOR_MAP: Record<string, string> = {};

// 平移参数统一放在 pan 分组。
// Pan settings are stored under the "pan" group.
export type PanSettingsGroup = {
  panOffset: { x: number; y: number; z: number };
  panOffsetLeft: { x: number; y: number; z: number };
  panOffsetRight: { x: number; y: number; z: number };
};
export const DEFAULT_PAN: PanSettingsGroup = {
  panOffset: { x: 0, y: 0, z: 0 },
  panOffsetLeft: { x: 0, y: 0, z: 0 },
  panOffsetRight: { x: 0, y: 0, z: 0 },
};

export type ColorsSettingsGroup = {
  data: Record<string, string>;
};
export const DEFAULT_COLORS: ColorsSettingsGroup = {
  data: {},
};

export type LammpsSettingsGroup = {
  data: LammpsTypeMapRecord;
};
export const DEFAULT_LAMMPS: LammpsSettingsGroup = {
  data: {},
};

export type EffectRange = 'current' | 'visible' | 'all';
// 生效范围设置（用于面板的作用域选择）。
// Effect-range settings (scope selector per panel).
export type EffectRangeSettingsGroup = {
  colors: EffectRange;
  details: EffectRange;
  lammps: EffectRange;
};
// 默认生效范围。
// Default effect ranges.
export const DEFAULT_EFFECT_RANGE: EffectRangeSettingsGroup = {
  colors: 'current',
  details: 'current',
  lammps: 'current',
};

// 图层播放状态（用于每层持久化）。
// Per-layer playback state for persistence.
export type LayerAnimState = {
  frameIndex: number;
  playFps: number;
};
export const DEFAULT_LAYER_ANIM: LayerAnimState = {
  frameIndex: 0,
  playFps: 6,
};

export type OtherSettingsGroup = {
  showAxes: boolean;
  refreshBondsOnPlay: boolean;
  // Keep active selection when hiding a layer.
  // 隐藏图层时保留选中状态。
  keepActiveLayerOnHide: boolean;
  themeReadabilityCheckOnOpen?: boolean;
  modelLightIntensity: number;
  themeMode: ThemeMode;
  visualStyle: VisualStyleId;
  selectionHighlightColor: string;
  panStepScale: number;
  backgroundColor: string;
  backgroundColorMode: 'auto' | 'custom';
  backgroundTransparent: boolean;
};
export const DEFAULT_OTHER: OtherSettingsGroup = {
  showAxes: false,
  refreshBondsOnPlay: true,
  // Keep active selection when hiding a layer.
  // 隐藏图层时保留选中状态。
  keepActiveLayerOnHide: false,
  themeReadabilityCheckOnOpen: true,
  modelLightIntensity: 1.5,
  themeMode: 'system',
  visualStyle: 'default',
  selectionHighlightColor: '#ffd400',
  panStepScale: 1,
  backgroundColor: '#ffffff',
  backgroundColorMode: 'custom',
  backgroundTransparent: true,
};

// 录制相关设置统一放在 record 分组。
// Recording-related settings live under "record".
export type RecordCropBox = { x: number; y: number; w: number; h: number };
export type RecordSettingsGroup = {
  frame_rate: number;
  recordDelaySec: number;
  recordCropBox: RecordCropBox | null;
};
export const DEFAULT_RECORD: RecordSettingsGroup = {
  frame_rate: 60,
  recordDelaySec: 0,
  recordCropBox: null,
};

/**
 * Default viewer settings for a fresh session.
 * 初始默认设置（首次进入或清理后使用）。
 */
export const DEFAULT_SETTINGS: ViewerSettings = {
  files: DEFAULT_FILES,
  rotation: DEFAULT_AUTO_ROTATE,
  view: DEFAULT_DISPLAY,
  pan: DEFAULT_PAN,
  record: DEFAULT_RECORD,
  effectRange: DEFAULT_EFFECT_RANGE,
  other: DEFAULT_OTHER,
};

/**
 * 判断元素映射是否为未知占位符（E）
 *
 * Check whether element mapping is an unknown placeholder ("E").
 */
function isUnknownElement(element: string | undefined | null): boolean {
  return (element ?? '').trim().toUpperCase() === 'E';
}

/**
 * 判断“本次 dump 出现的 typeId”中，是否存在未完成映射（element="E"）
 *
 * Check whether any detected typeId is still mapped to "E" (unresolved).
 *
 * Args:
 *   rows: 当前 typeId→element 映射表
 *   typeIds: 本次 dump 第一帧检测到的 typeId 列表
 *
 * Returns:
 *   boolean: true 表示存在未完成映射（需要用户补全）
 */
export function hasUnknownElementMappingForTypeIds(
  map: LammpsTypeMapRecord,
  typeIds: number[],
): boolean {
  if (typeIds.length === 0) return false;
  const source = map ?? {};
  for (const tid0 of typeIds) {
    const tid = Math.max(1, Math.floor(tid0));
    if (!Number.isFinite(tid)) continue;
    const val = source[String(tid)];
    if (isUnknownElement(val) || val == null) return true;
  }
  return false;
}

/**
 * 统计“本次 dump 出现的 typeId”中仍为未知映射（E/缺失）的数量。
 *
 * Count unresolved mappings ("E" or missing) for detected typeIds.
 */
export function countUnknownElementMappingForTypeIds(
  map: LammpsTypeMapRecord,
  typeIds: number[],
): number {
  if (typeIds.length === 0) return 0;
  const source = map ?? {};
  let count = 0;
  for (const tid0 of typeIds) {
    const tid = Math.max(1, Math.floor(tid0));
    if (!Number.isFinite(tid)) continue;
    const val = source[String(tid)];
    if (isUnknownElement(val) || val == null || String(val).trim() === '') count += 1;
  }
  return count;
}

/**
 * 打开设置时可能携带的 payload
 * Payload for opening settings
 */
export type OpenSettingsPayload = {
  /** 需要聚焦（展开）的折叠面板 key / Collapse panel key to focus */
  focusKey?: string;
  /** 需要聚焦（展开）的折叠面板 key 列表 / Multiple collapse panel keys to focus */
  focusKeys?: string[];
  /** 是否打开抽屉；false 表示只切换 activeKey，不改变 open 状态 */
  open?: boolean;
};
