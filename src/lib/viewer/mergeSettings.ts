import type { RotationDeg, ViewerSettings } from './settings';

/**
 * Patch type that supports partial rotation fields.
 * 支持 rotationDeg 局部更新的补丁类型。
 */
export type SettingsPatch = Omit<Partial<ViewerSettings>, 'rotationDeg'> & {
  rotationDeg?: Partial<RotationDeg>;
};

/**
 * Shallow clone with nested rotation copy.
 * 浅拷贝并额外复制 rotationDeg。
 */
export function cloneSettings(v: ViewerSettings): ViewerSettings {
  return {
    ...v,
    rotationDeg: { ...v.rotationDeg },
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
  return {
    ...base,
    ...patch,
    rotationDeg: {
      ...base.rotationDeg,
      ...(patch.rotationDeg ?? {}),
    },
  };
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
