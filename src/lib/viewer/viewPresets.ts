/** View preset enum (logical camera orientations). / 视图预设枚举（逻辑相机方向）。 */
export type ViewPreset = 'front' | 'side' | 'top';

/**
 * Type guard for view presets.
 * 视图预设的类型守卫。
 */
function isViewPreset(v: unknown): v is ViewPreset {
  return v === 'front' || v === 'side' || v === 'top';
}

/**
 * Normalize a preset list to at most two unique views.
 *
 * Important: preserve the incoming order.
 * The order is semantically meaningful because it defines the left/right viewport mapping.
 *
 * 归一化视图预设列表（最多两个且保持顺序）。
 * 顺序决定左右视口映射，不能打乱。
 */
export function normalizeViewPresets(input: unknown): ViewPreset[] {
  const arr = Array.isArray(input) ? input : [];
  const out: ViewPreset[] = [];
  const seen = new Set<ViewPreset>();

  for (const x of arr) {
    if (!isViewPreset(x)) continue;
    if (seen.has(x)) continue;
    out.push(x);
    seen.add(x);
    if (out.length >= 2) break;
  }

  return out;
}
