import { isDark } from "../../theme/mode";
export type LammpsTypeMapItem = {
  typeId: number;
  element: string;
};

export type RotationDeg = {
  x: number;
  y: number;
  z: number;
};

export type ViewerSettings = {
  atomScale: number;
  showAxes: boolean;
  showBonds: boolean;
  rotationDeg: RotationDeg;
  // 新增：是否正交（关闭透视）
  orthographic: boolean;

  // 新增：触发“恢复视角”的序号（每次 +1）
  resetViewSeq: number;

  lammpsTypeMap: LammpsTypeMapItem[];
  backgroundColor: string;
  backgroundTransparent?: boolean;

  /** Dual view: show front + side view simultaneously */
  dualViewEnabled?: boolean;
  /** Dual view camera distance (world units, used for both views) */
  dualViewDistance?: number;
  /** Dual view split ratio for left viewport width (0..1). */
  dualViewSplit?: number;

//   录制帧率
  frame_rate: number;
};

export const DEFAULT_SETTINGS: ViewerSettings = {
  atomScale: 1,
  showAxes: false,
  showBonds: true,
  rotationDeg: { x: 0, y: 0, z: 0 },
  orthographic: false,
  resetViewSeq: 0,

  lammpsTypeMap: [],
  backgroundColor: isDark.value ? "#000000" : "#ffffff",
  backgroundTransparent: true,

  dualViewEnabled: false,
  dualViewDistance: 10,
  dualViewSplit: 0.5,

  frame_rate: 60,
};

/**
 * 判断元素映射是否为未知占位符（E）
 *
 * Check whether element mapping is an unknown placeholder ("E").
 */
function isUnknownElement(element: string | undefined | null): boolean {
  return (element ?? "").trim().toUpperCase() === "E";
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
  typeIds: number[]
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
