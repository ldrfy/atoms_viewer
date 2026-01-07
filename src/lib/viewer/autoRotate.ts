/**
 * Auto-rotation preset id.
 *
 * NOTE: Speed is controlled independently via settings (slider). Presets only
 * describe the *axis direction*.
 */
export type AutoRotatePresetId
  = | 'off'
    | 'diag'
    | 'y'
    | 'x'
    | 'z'
    | 'diagXY'
    | 'diagYZ'
    | 'diagXZ'
    | 'space'
    | 'tilt';

/**
 * Auto-rotate preset definition.
 * 自动旋转预设定义。
 */
export type AutoRotatePreset = {
  id: AutoRotatePresetId;
  /** Unit axis vector in world space. */
  axis: [number, number, number];
  /**
   * Default angular speed (degrees/sec).
   *
   * UI speed slider should override this; it is used only as a fallback for
   * legacy settings or corrupted configs.
   */
  speedDegPerSec: number;
};

/**
 * Built-in auto-rotation presets.
 *
 * NOTE: This list is intentionally small and “display-oriented”.
 * If you later want user-defined presets, keep IDs stable and add a separate
 * user preset storage.
 */
export const AUTO_ROTATE_PRESETS: AutoRotatePreset[] = [
  { id: 'off', axis: [0, 1, 0], speedDegPerSec: 0 },
  // Common “isometric-like” diagonal.
  { id: 'diag', axis: [1, 1, 0.3], speedDegPerSec: 12 },
  // Single-axis presets.
  { id: 'y', axis: [0, 1, 0], speedDegPerSec: 12 },
  { id: 'x', axis: [1, 0, 0], speedDegPerSec: 12 },
  { id: 'z', axis: [0, 0, 1], speedDegPerSec: 12 },
  // Plane diagonals (more “angle presets”).
  { id: 'diagXY', axis: [1, 1, 0], speedDegPerSec: 12 },
  { id: 'diagYZ', axis: [0, 1, 1], speedDegPerSec: 12 },
  { id: 'diagXZ', axis: [1, 0, 1], speedDegPerSec: 12 },
  // Space diagonal.
  { id: 'space', axis: [1, 1, 1], speedDegPerSec: 12 },
  // A slightly tilted axis that often looks good for molecules/solids.
  { id: 'tilt', axis: [0.2, 1, 0.8], speedDegPerSec: 12 },
];

export const DEFAULT_AUTO_ROTATE_PRESET_ID: AutoRotatePresetId = 'diag';

/** Legacy preset ids from earlier versions (speed-encoded IDs). */
const LEGACY_PRESET_ALIAS: Record<string, AutoRotatePresetId> = {
  diagSlow: 'diag',
  diagMid: 'diag',
  yMid: 'y',
  xMid: 'x',
  zMid: 'z',
  spaceSlow: 'space',
  fast: 'tilt',
};

/**
 * Type guard for auto-rotate preset id.
 * 自动旋转预设 id 的类型守卫。
 */
export function isAutoRotatePresetId(x: unknown): x is AutoRotatePresetId {
  return (
    x === 'off'
    || x === 'diag'
    || x === 'y'
    || x === 'x'
    || x === 'z'
    || x === 'diagXY'
    || x === 'diagYZ'
    || x === 'diagXZ'
    || x === 'space'
    || x === 'tilt'
  );
}

/**
 * Resolve preset id to a valid preset (fallback-safe).
 * 将预设 id 解析为有效预设（带回退）。
 */
export function getAutoRotatePreset(
  id: unknown,
  fallback: AutoRotatePresetId = DEFAULT_AUTO_ROTATE_PRESET_ID,
): AutoRotatePreset {
  const raw = String(id ?? '').trim();
  const aliased = LEGACY_PRESET_ALIAS[raw] ?? raw;
  const pid = isAutoRotatePresetId(aliased) ? aliased : fallback;
  return (
    AUTO_ROTATE_PRESETS.find(p => p.id === pid)
    ?? AUTO_ROTATE_PRESETS.find(p => p.id === fallback)!
  );
}
