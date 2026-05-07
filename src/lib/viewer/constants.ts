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
export const MODEL_LIGHT_INTENSITY_MAX = 3;
// Atom material roughness range. / 原子材质粗糙度范围。
export const ATOM_ROUGHNESS_MIN = 0;
export const ATOM_ROUGHNESS_MAX = 1;

// Dual-view distance lower bound.
// 双视图视距下限；数值越小，模型看起来越大。
export const DUAL_VIEW_DISTANCE_MIN = 0.0001;
// Dual-view distance max fallback used by the UI slider.
// 双视图视距滑条的保底最大值。
export const DUAL_VIEW_DISTANCE_MAX_BASE = 200;
// Dual-view distance slider growth factor based on current/default value.
// 双视图视距滑条的动态放大倍数，基于当前值和默认值计算。
export const DUAL_VIEW_DISTANCE_MAX_FACTOR = 2;
// Dual-view distance slider step in the UI.
// 双视图视距滑条步长。
export const DUAL_VIEW_DISTANCE_SLIDER_STEP = 0.001;
// Dual-view distance numeric input step in the UI.
// 双视图视距输入框步长。
export const DUAL_VIEW_DISTANCE_INPUT_STEP = 0.0001;
// Dual-view distance numeric input precision in the UI.
// 双视图视距输入框精度。
export const DUAL_VIEW_DISTANCE_PRECISION = 4;
// Camera fit margin applied when loading a model.
// 模型载入时相机自动拟合的余量倍数；越大则初始看起来越远。
export const DUAL_VIEW_FIT_MARGIN = 1.8;
// Default layer-position mode. / 图层相对位置模式默认值。
export const DEFAULT_LAYER_USE_REAL_POSITIONS = false;

// Layer display ranges. / 图层外观参数范围。
export const BOND_FACTOR_MIN = 0.5;
export const BOND_FACTOR_MAX = 2;
// 键半径
export const BOND_RADIUS_MIN = 0.01;
export const BOND_RADIUS_MAX = 0.5;
// 原子大小
export const ATOM_SCALE_MIN = 0.01;
export const ATOM_SCALE_MAX = 5;
// 亮度
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

// Session save debounce (ms). / 会话保存节流（毫秒）。
export const SESSION_SAVE_DELAY_LAYERS_MS = 500;
export const SESSION_SAVE_DELAY_SETTINGS_MS = 600;
// View settings (rotation/distance) save debounce (ms).
// 视角设置（旋转/视距）本地保存防抖（毫秒）。
export const VIEW_SETTINGS_SAVE_DELAY_MS = 700;
