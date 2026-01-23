import type { ViewPreset } from './viewPresets';
import type { ThemeMode } from '../../theme/mode';
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
  /** Set when auto-rotation was enabled automatically (do not persist). */
  autoEnabledBySystem?: boolean;
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
 * 扁平的 ViewerSettings，但字段顺序/分组与 Settings 面板一致：
 * files -> rotation -> view -> details -> lammps/colors -> other
 */
export type ViewerSettings = {
  // files
  /** PNG 导出倍率 */
  exportPngScale: number;
  /** PNG 导出是否透明背景 */
  exportPngTransparent: boolean;
  /** 是否缓存远程模型用于导出/恢复 */
  cacheRemoteOnExport: boolean;

  // autoRotate
  /** Auto rotation (around an arbitrary axis with a constant speed). */
  autoRotate: AutoRotateSettings;
  /** Auto-enable rotation on model load (system hint). */
  autoRotateOnLoad: boolean;

  // display (view/camera)
  rotationDeg: RotationDeg;
  orthographic: boolean;
  resetViewSeq: number;
  /** Multi-view presets (choose 1 => single view, choose 2 => dual view). */
  viewPresets?: ViewPreset[];
  dualViewEnabled?: boolean;
  dualViewDistance?: number;
  initialDualViewDistance?: number;
  dualViewSplit?: number;

  // layerDisplay (per-layer defaults)
  representation: RepresentationId;
  atomScale: number;
  /** Sphere geometry segments (quality vs performance). */
  sphereSegments: number;
  showBonds: boolean;
  /** Bond cutoff factor used for bond inference: cutoff = (r_i + r_j) * bondFactor. */
  bondFactor: number;
  /** Bond cylinder radius (world units). */
  bondRadius: number;
  /** Material roughness for atom spheres. */
  atomRoughness: number;

  // lammps / colors defaults
  lammpsTypeMap: LammpsTypeMapItem[];
  /** Optional user-defined color map template (applied on new layer load). */
  colorMapTemplate?: AtomTypeColorMapItem[];

  // other
  showAxes: boolean;
  /** During multi-frame playback, refresh bond meshes each frame. */
  refreshBondsOnPlay: boolean;
  backgroundColor: string;
  /** Auto background follows theme; custom background sticks to user color. */
  backgroundColorMode?: 'auto' | 'custom';
  backgroundTransparent?: boolean;
  /** Check theme/background readability when entering viewer. */
  themeReadabilityCheckOnOpen?: boolean;
  /** Light intensity multiplier for model lighting. */
  modelLightIntensity: number;
  //   录制帧率
  frame_rate: number;
  /** UI theme mode */
  themeMode: ThemeMode;
  /** Visual style preset */
  visualStyle: VisualStyleId;
};

export type LayerDisplaySettings = {
  representation: RepresentationId;
  atomScale: number;
  showBonds: boolean;
  sphereSegments: number;
  bondFactor: number;
  bondRadius: number;
  atomRoughness: number;
};

export const DEFAULT_LAYER_DISPLAY: LayerDisplaySettings = {
  representation: 'ballAndStick',
  atomScale: 1,
  showBonds: true,
  sphereSegments: 24,
  bondFactor: 1.05,
  bondRadius: 0.1,
  atomRoughness: 0.35,
};

// 分组默认值（与设置面板分类一致）
export type FileSettingsGroup = Pick<
  ViewerSettings,
  'exportPngScale' | 'exportPngTransparent' | 'cacheRemoteOnExport'
>;
export const DEFAULT_FILES: FileSettingsGroup = {
  exportPngScale: 2,
  exportPngTransparent: true,
  cacheRemoteOnExport: true,
};

export const DEFAULT_AUTO_ROTATE: AutoRotateSettings = {
  enabled: false,
  presetId: 'diag',
  speedDegPerSec: 8,
  pauseOnInteract: true,
  resumeDelayMs: 600,
};

export type DisplaySettingsGroup = {
  rotationDeg: RotationDeg;
  orthographic: boolean;
  resetViewSeq: number;
  viewPresets: ViewPreset[];
  dualViewEnabled: boolean;
  dualViewDistance: number;
  initialDualViewDistance: number;
  dualViewSplit: number;
};
export const DEFAULT_DISPLAY: DisplaySettingsGroup = {
  rotationDeg: { x: 0, y: 0, z: 0 } as RotationDeg,
  orthographic: false,
  resetViewSeq: 0,
  viewPresets: ['front'] as ViewPreset[],
  dualViewEnabled: false,
  dualViewDistance: 10,
  initialDualViewDistance: 10,
  dualViewSplit: 0.5,
};

export const DEFAULT_TYPE_MAP: LammpsTypeMapItem[] = [];
export const DEFAULT_COLOR_MAP: AtomTypeColorMapItem[] = [];

export type OtherSettingsGroup = Pick<
  ViewerSettings,
  | 'showAxes'
  | 'refreshBondsOnPlay'
  | 'backgroundColor'
  | 'backgroundColorMode'
  | 'backgroundTransparent'
  | 'themeReadabilityCheckOnOpen'
  | 'modelLightIntensity'
  | 'frame_rate'
  | 'autoRotateOnLoad'
  | 'themeMode'
  | 'visualStyle'
>;
export const DEFAULT_OTHER: OtherSettingsGroup = {
  showAxes: false,
  refreshBondsOnPlay: true,
  backgroundColor: '#ffffff',
  backgroundColorMode: 'custom' as ViewerSettings['backgroundColorMode'],
  backgroundTransparent: true,
  themeReadabilityCheckOnOpen: true,
  modelLightIntensity: 1.5,
  frame_rate: 60,
  autoRotateOnLoad: true,
  themeMode: 'system',
  visualStyle: 'default',
};

/**
 * Default viewer settings for a fresh session.
 * 初始默认设置（首次进入或清理后使用）。
 */
export const DEFAULT_SETTINGS: ViewerSettings = {
  // layer display defaults (mirrors layerDisplay section)
  representation: DEFAULT_LAYER_DISPLAY.representation,
  atomScale: DEFAULT_LAYER_DISPLAY.atomScale,
  sphereSegments: DEFAULT_LAYER_DISPLAY.sphereSegments,
  showBonds: DEFAULT_LAYER_DISPLAY.showBonds,
  bondFactor: DEFAULT_LAYER_DISPLAY.bondFactor,
  bondRadius: DEFAULT_LAYER_DISPLAY.bondRadius,
  atomRoughness: DEFAULT_LAYER_DISPLAY.atomRoughness,

  // files
  exportPngScale: DEFAULT_FILES.exportPngScale,
  exportPngTransparent: DEFAULT_FILES.exportPngTransparent,
  cacheRemoteOnExport: DEFAULT_FILES.cacheRemoteOnExport,

  // auto-rotate
  autoRotate: { ...DEFAULT_AUTO_ROTATE },
  autoRotateOnLoad: DEFAULT_OTHER.autoRotateOnLoad,

  // display (view)
  rotationDeg: DEFAULT_DISPLAY.rotationDeg,
  orthographic: DEFAULT_DISPLAY.orthographic,
  resetViewSeq: DEFAULT_DISPLAY.resetViewSeq,
  viewPresets: DEFAULT_DISPLAY.viewPresets,
  dualViewEnabled: DEFAULT_DISPLAY.dualViewEnabled,
  dualViewDistance: DEFAULT_DISPLAY.dualViewDistance,
  initialDualViewDistance: DEFAULT_DISPLAY.initialDualViewDistance,
  dualViewSplit: DEFAULT_DISPLAY.dualViewSplit,

  // defaults: colors & lammps
  lammpsTypeMap: DEFAULT_TYPE_MAP,
  colorMapTemplate: DEFAULT_COLOR_MAP,

  // other
  showAxes: DEFAULT_OTHER.showAxes,
  refreshBondsOnPlay: DEFAULT_OTHER.refreshBondsOnPlay,
  backgroundColor: DEFAULT_OTHER.backgroundColor,
  backgroundColorMode: DEFAULT_OTHER.backgroundColorMode,
  backgroundTransparent: DEFAULT_OTHER.backgroundTransparent,
  themeReadabilityCheckOnOpen: DEFAULT_OTHER.themeReadabilityCheckOnOpen,
  modelLightIntensity: DEFAULT_OTHER.modelLightIntensity,
  frame_rate: DEFAULT_OTHER.frame_rate,
  themeMode: DEFAULT_OTHER.themeMode,
  visualStyle: DEFAULT_OTHER.visualStyle,
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
  /** 需要聚焦（展开）的折叠面板 key 列表 / Multiple collapse panel keys to focus */
  focusKeys?: string[];
  /** 是否打开抽屉；false 表示只切换 activeKey，不改变 open 状态 */
  open?: boolean;
};
