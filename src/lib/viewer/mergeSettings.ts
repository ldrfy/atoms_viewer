import type { RotationDeg, ViewerSettings } from './settings';

/**
 * Patch type that supports partial rotation fields.
 * 支持 rotationDeg 局部更新的补丁类型。
 */
export type SettingsPatch = {
  files?: Partial<ViewerSettings['files']>;
  rotation?: Partial<ViewerSettings['rotation']>;
  view?: Omit<Partial<ViewerSettings['view']>, 'rotationDeg'> & {
    rotationDeg?: Partial<RotationDeg>;
  };
  lammps?: Partial<ViewerSettings['lammps']>;
  details?: Partial<ViewerSettings['details']>;
  colors?: Partial<ViewerSettings['colors']> & {
    data?: Record<string, string>;
  };
  anim?: Partial<ViewerSettings['anim']>;
  other?: Partial<ViewerSettings['other']>;
};

/**
 * Clone settings with nested arrays/objects copied as needed.
 * 复制设置：必要的嵌套对象与数组会被深拷贝。
 */
export function cloneSettings(v: ViewerSettings): ViewerSettings {
  return {
    files: { ...v.files },
    rotation: { ...v.rotation },
    view: {
      ...v.view,
      rotationDeg: { ...v.view.rotationDeg },
      viewPresets: v.view.viewPresets ? [...v.view.viewPresets] : [],
    },
    lammps: { ...v.lammps, data: { ...(v.lammps.data ?? {}) } },
    details: { ...v.details },
    colors: { ...v.colors, data: { ...v.colors.data } },
    anim: { ...v.anim },
    other: { ...v.other },
  };
}

/**
 * Merge settings with a patch (rotationDeg merged shallowly).
 * 合并设置与补丁（rotationDeg 使用浅合并）。
 */
export function mergeSettings(
  base: ViewerSettings,
  patch: SettingsPatch,
): ViewerSettings {
  const next = cloneSettings(base);
  if (patch.files) next.files = { ...next.files, ...patch.files };
  if (patch.rotation) next.rotation = { ...next.rotation, ...patch.rotation };
  if (patch.view) {
    next.view = {
      ...next.view,
      ...patch.view,
      rotationDeg: patch.view.rotationDeg
        ? { ...next.view.rotationDeg, ...patch.view.rotationDeg }
        : next.view.rotationDeg,
      viewPresets: patch.view.viewPresets ?? next.view.viewPresets,
    };
  }
  if (patch.lammps) {
    next.lammps = {
      ...next.lammps,
      ...patch.lammps,
      data: patch.lammps.data ? { ...patch.lammps.data } : next.lammps.data,
    };
  }
  if (patch.details) next.details = { ...next.details, ...patch.details };
  if (patch.colors) {
    next.colors = {
      ...next.colors,
      ...patch.colors,
      data: patch.colors.data ? { ...patch.colors.data } : next.colors.data,
    };
  }
  if (patch.anim) next.anim = { ...next.anim, ...patch.anim };
  if (patch.other) next.other = { ...next.other, ...patch.other };
  return next;
}

/**
 * Shadow copy to avoid lost updates when multiple patches arrive.
 * 设置的影子副本，避免多次 patch 时丢更新。
 */
export type SettingsShadow = {
  get: () => ViewerSettings;
  syncFrom: (next: ViewerSettings) => void;
  patch: (patch: SettingsPatch) => ViewerSettings;
  replace: (next: ViewerSettings) => ViewerSettings;
};

/**
 * Create a settings shadow helper.
 * 创建设置影子副本的辅助对象。
 */
export function createSettingsShadow(initial: ViewerSettings): SettingsShadow {
  let shadow = cloneSettings(initial);

  return {
    get: () => shadow,
    syncFrom: (next) => {
      shadow = cloneSettings(next);
    },
    patch: (patch) => {
      shadow = mergeSettings(shadow, patch);
      return shadow;
    },
    replace: (next) => {
      shadow = cloneSettings(next);
      return shadow;
    },
  };
}
