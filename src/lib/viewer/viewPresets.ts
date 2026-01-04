export type ViewPreset = 'front' | 'side' | 'top';

function isViewPreset(v: unknown): v is ViewPreset {
  return v === 'front' || v === 'side' || v === 'top';
}

/**
 * Normalize a preset list to at most two unique views.
 *
 * Important: preserve the incoming order.
 * The order is semantically meaningful because it defines the left/right viewport mapping.
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
