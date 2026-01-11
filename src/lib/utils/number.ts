/**
 * Clamp a numeric value into [min, max].
 * 将数值限制在 [min, max] 范围内。
 */
export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}
