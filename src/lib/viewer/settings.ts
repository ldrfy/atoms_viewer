import { isDark } from '../../theme/mode';
import type { ViewPreset } from './viewPresets';
import type { AutoRotatePresetId } from './autoRotate';
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

export type AutoRotateSettings = {
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

export type ViewerSettings = {
  atomScale: number;
  /** Sphere geometry segments (quality vs performance). */
  sphereSegments: number;
  showAxes: boolean;
  showBonds: boolean;
  /** Bond cutoff factor used for bond inference: cutoff = (r_i + r_j) * bondFactor. */
  bondFactor: number;
  /** During multi-frame playback, refresh bond meshes each frame. */
  refreshBondsOnPlay: boolean;
  rotationDeg: RotationDeg;

  /** Auto rotation (around an arbitrary axis with a constant speed). */
  autoRotate: AutoRotateSettings;
  // 新增：是否正交（关闭透视）
  orthographic: boolean;

  // 新增：触发“恢复视角”的序号（每次 +1）
  resetViewSeq: number;

  lammpsTypeMap: LammpsTypeMapItem[];
  backgroundColor: string;
  backgroundTransparent?: boolean;

  /** Multi-view presets (choose 1 => single view, choose 2 => dual view). */
  viewPresets?: ViewPreset[];

  /** Dual view: show front + side view simultaneously */
  dualViewEnabled?: boolean;
  /** Dual view camera distance (world units, used for both views) */
  dualViewDistance?: number;
  /**
   * The fitted (original) distance captured on model load.
   * Used by the "Reset original distance" UI.
   */
  initialDualViewDistance?: number;
  /** Dual view split ratio for left viewport width (0..1). */
  dualViewSplit?: number;

  //   录制帧率
  frame_rate: number;
};

export const DEFAULT_SETTINGS: ViewerSettings = {
  atomScale: 1,
  sphereSegments: 24,
  showAxes: false,
  showBonds: true,
  bondFactor: 1.05,
  // Refreshing bonds each frame during playback can be extremely expensive for
  // large models. Default to OFF; users can enable explicitly when needed.
  refreshBondsOnPlay: true,
  rotationDeg: { x: 0, y: 0, z: 0 },

  autoRotate: {
    enabled: false,
    presetId: 'diag',
    speedDegPerSec: 8,
    pauseOnInteract: true,
    resumeDelayMs: 600,
  },

  orthographic: false,
  resetViewSeq: 0,

  lammpsTypeMap: [],
  backgroundColor: isDark.value ? '#000000' : '#ffffff',
  backgroundTransparent: true,

  // Enforce "at least one view" at the settings level. This avoids the UI being in an
  // undefined state for first-time users and ensures distance syncing works consistently.
  viewPresets: ['front'],

  dualViewEnabled: false,
  dualViewDistance: 10,
  initialDualViewDistance: 10,
  dualViewSplit: 0.5,

  frame_rate: 60,
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

/**
 * 打开设置时可能携带的 payload
 * Payload for opening settings
 */
export type OpenSettingsPayload = {
  /** 需要聚焦（展开）的折叠面板 key / Collapse panel key to focus */
  focusKey?: string;
  /** 是否打开抽屉；false 表示只切换 activeKey，不改变 open 状态 */
  open?: boolean;
};
