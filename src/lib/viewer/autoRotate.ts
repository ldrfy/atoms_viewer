/**
 * Auto-rotation preset id.
 *
 * NOTE: Speed is controlled independently via settings (slider). Presets only
 * describe the *axis direction*.
 */
export type AutoRotatePresetId
  = | 'diag'
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
  /** Default angular speed (degrees/sec). */
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

/**
 * Type guard for auto-rotate preset id.
 * 自动旋转预设 id 的类型守卫。
 */
export function isAutoRotatePresetId(x: unknown): x is AutoRotatePresetId {
  return (
    x === 'diag'
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
  id: AutoRotatePresetId,
): AutoRotatePreset {
  return AUTO_ROTATE_PRESETS.find(p => p.id === id)!;
}
