import type { ViewPreset } from './viewPresets';
import type { ThemeMode } from '../../theme/mode';
import type { AutoRotatePresetId } from './autoRotate';
import { normalizeElementSymbol } from '../structure/chem';
export type LammpsTypeMapItem = {
  typeId: number;
  element: string;
};

/**
 * Per-layer atom color mapping entry.
 *
 * - Common formats: element only (e.g. "C")
 * - LAMMPS with typeId mapping: element + typeId (e.g. "C1", "C2")
 */
export type AtomTypeColorMapItem = {
  element: string;
  /** Optional; present when the source provides typeId (LAMMPS, etc.). */
  typeId?: number;
  /** Hex color string, e.g. "#RRGGBB". */
  color: string;
  /**
   * Whether the color has been explicitly customized by the user.
   *
   * If false/undefined, the row is treated as "auto" and will follow built-in
   * element colors when the LAMMPS type→element mapping changes.
   */
  isCustom?: boolean;
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
 * files -> rotation -> view -> lammps -> details -> colors -> anim -> other
 */
export type ViewerSettings = {
  files: FileSettingsGroup;
  rotation: RotateSettingsGroup;
  view: DisplaySettingsGroup;
  lammps: LammpsSettingsGroup;
  details: DetailsSettingsGroup;
  colors: ColorsSettingsGroup;
  anim: AnimSettingsGroup;
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
  applyAllLayers?: boolean;
};

export const DEFAULT_DETAILS: DetailsSettingsGroup = {
  representation: 'ballAndStick',
  atomScale: 1,
  showBonds: true,
  sphereSegments: 24,
  bondFactor: 1.05,
  bondRadius: 0.1,
  atomRoughness: 0.35,
  applyAllLayers: true,
};

// 分组默认值（与设置面板分类一致）
export type FileSettingsGroup = {
  exportPngScale: number;
  exportPngTransparent: boolean;
  cacheRemoteOnExport: boolean;
};
export const DEFAULT_FILES: FileSettingsGroup = {
  exportPngScale: 2,
  exportPngTransparent: true,
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

export const DEFAULT_TYPE_MAP: LammpsTypeMapItem[] = [];
export const DEFAULT_COLOR_MAP: AtomTypeColorMapItem[] = [];

export type ColorsSettingsGroup = {
  applyAllLayers: boolean;
  data: Record<string, string>;
};
export const DEFAULT_COLORS: ColorsSettingsGroup = {
  applyAllLayers: true,
  data: {},
};

export type LammpsSettingsGroup = LammpsTypeMapItem[];
export const DEFAULT_LAMMPS: LammpsSettingsGroup = [];

export type OtherSettingsGroup = {
  showAxes: boolean;
  refreshBondsOnPlay: boolean;
  themeReadabilityCheckOnOpen?: boolean;
  modelLightIntensity: number;
  frame_rate: number;
  autoRotateOnLoad: boolean;
  themeMode: ThemeMode;
  visualStyle: VisualStyleId;
};
export const DEFAULT_OTHER: OtherSettingsGroup = {
  showAxes: false,
  refreshBondsOnPlay: true,
  themeReadabilityCheckOnOpen: true,
  modelLightIntensity: 1.5,
  frame_rate: 60,
  autoRotateOnLoad: true,
  themeMode: 'system',
  visualStyle: 'default',
};

export type AnimSettingsGroup = {
  backgroundColor: string;
  backgroundColorMode: 'auto' | 'custom';
  backgroundTransparent: boolean;
  frameIndex: number;
  playFps: number;
  recordDelaySec: number;
};
export const DEFAULT_ANIM: AnimSettingsGroup = {
  backgroundColor: '#ffffff',
  backgroundColorMode: 'custom',
  backgroundTransparent: true,
  frameIndex: 0,
  playFps: 6,
  recordDelaySec: 0,
};

/**
 * Default viewer settings for a fresh session.
 * 初始默认设置（首次进入或清理后使用）。
 */
export const DEFAULT_SETTINGS: ViewerSettings = {
  files: DEFAULT_FILES,
  rotation: DEFAULT_AUTO_ROTATE,
  view: DEFAULT_DISPLAY,
  lammps: DEFAULT_LAMMPS,
  details: DEFAULT_DETAILS,
  colors: DEFAULT_COLORS,
  anim: DEFAULT_ANIM,
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
  rows: LammpsTypeMapItem[],
  typeIds: number[],
): boolean {
  if (typeIds.length === 0) return false;

  const set = new Set<number>(typeIds);
  for (const r of rows) {
    if (!set.has(r.typeId)) continue;
    if (isUnknownElement(r.element)) return true;
  }
  return false;
}

export function buildColorTemplateRows(
  data: Record<string, string> | undefined,
): AtomTypeColorMapItem[] {
  const out: AtomTypeColorMapItem[] = [];
  for (const [key, value] of Object.entries(data ?? {})) {
    const element = normalizeElementSymbol(key) || '';
    if (!element) continue;
    const color = String(value ?? '').trim();
    if (!color) continue;
    out.push({
      element,
      color,
      isCustom: true,
    });
  }
  return out;
}

export function buildElementColorRecordFromRows(
  rows: AtomTypeColorMapItem[] | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of rows ?? []) {
    if (!row.isCustom) continue;
    const element = normalizeElementSymbol(row.element) || '';
    if (!element) continue;
    const color = String(row.color ?? '').trim();
    if (!color) continue;
    out[element] = color;
  }
  return out;
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
