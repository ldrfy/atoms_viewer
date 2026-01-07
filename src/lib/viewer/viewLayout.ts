import { clampNumber } from '../utils/number';

/** Dual-view split ratio bounds (left viewport width fraction). */
/** 双视图分割比例边界（左视口宽度占比）。 */
export const DUAL_VIEW_SPLIT_MIN = 0.1;
export const DUAL_VIEW_SPLIT_MAX = 0.9;
/** Dual-view split ratio bounds in percent (UI). */
/** 双视图分割比例（百分比）用于 UI 控件。 */
export const DUAL_VIEW_SPLIT_MIN_PCT = 10;
export const DUAL_VIEW_SPLIT_MAX_PCT = 90;

/**
 * Clamp dual-view split ratio to a safe range.
 * 将双视图分割比例限制在安全范围内，避免视口过窄。
 */
export function clampDualViewSplit(value: number): number {
  return clampNumber(value, DUAL_VIEW_SPLIT_MIN, DUAL_VIEW_SPLIT_MAX);
}
