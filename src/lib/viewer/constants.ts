/**
 * Fixed numeric values for viewer UI/logic.
 * 统一管理常量数值，便于维护与一致性。
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
// Model light intensity range (multiplier). / 模型灯光亮度范围（倍数）。
export const MODEL_LIGHT_INTENSITY_MIN = 0;
export const MODEL_LIGHT_INTENSITY_MAX = 2;
// Atom material roughness range. / 原子材质粗糙度范围。
export const ATOM_ROUGHNESS_MIN = 0;
export const ATOM_ROUGHNESS_MAX = 1;

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

// Auto-rotate → settings rotation sync interval (ms).
// 自动旋转同步到设置面板的时间间隔（毫秒）。
export const AUTO_ROTATE_ROTATION_SYNC_INTERVAL_MS = 200;
// Manual rotation → settings rotation sync interval (ms).
// 手动旋转同步到设置面板的时间间隔（毫秒）。
export const MANUAL_ROTATION_SYNC_INTERVAL_MS = 120;
// Manual zoom → settings distance sync interval (ms).
// 手动缩放同步到设置面板的时间间隔（毫秒）。
export const DUAL_VIEW_DISTANCE_SYNC_INTERVAL_MS = 120;
