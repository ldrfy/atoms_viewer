/**
 * Common numeric ranges for viewer UI controls.
 * 常用数值范围（界面控制项）统一管理，便于维护与一致性。
 */
// Auto-rotate speed range (deg/s). / 自动旋转速度范围（度/秒）。
export const AUTO_ROTATE_SPEED_MIN = 0;
export const AUTO_ROTATE_SPEED_MAX = 120;
// Auto-rotate resume delay range (ms). / 自动旋转恢复延迟范围（毫秒）。
export const AUTO_ROTATE_RESUME_MIN = 0;
export const AUTO_ROTATE_RESUME_MAX = 2000;

// Recording FPS range. / 录制帧率范围。
export const RECORD_FPS_MIN = 1;
export const RECORD_FPS_MAX = 120;

// Dual-view distance range. / 双视图视距范围。
export const DUAL_VIEW_DISTANCE_MIN = 1;

// Layer display ranges. / 图层外观参数范围。
export const BOND_FACTOR_MIN = 0.8;
export const BOND_FACTOR_MAX = 1.3;
export const BOND_RADIUS_MIN = 0.03;
export const BOND_RADIUS_MAX = 0.3;
export const ATOM_SCALE_MIN = 0.2;
export const ATOM_SCALE_MAX = 2;
export const SPHERE_SEGMENTS_MIN = 8;
export const SPHERE_SEGMENTS_MAX = 64;

/** Dual-view split ratio bounds in percent (UI). */
/** 双视图分割比例（百分比）用于 UI 控件。 */
export const DUAL_VIEW_SPLIT_MIN_PCT = 10;
export const DUAL_VIEW_SPLIT_MAX_PCT = 90;
