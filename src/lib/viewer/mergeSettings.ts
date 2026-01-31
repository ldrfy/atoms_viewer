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
  pan?: Partial<ViewerSettings['pan']>;
  record?: Partial<ViewerSettings['record']>;
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
    pan: {
      panOffset: { ...v.pan.panOffset },
      panOffsetLeft: { ...v.pan.panOffsetLeft },
      panOffsetRight: { ...v.pan.panOffsetRight },
    },
    record: { ...v.record },
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
  // 平移设置单独合并，避免覆盖未修改的轴。
  // Merge pan settings to avoid overwriting untouched axes.
  if (patch.pan) {
    next.pan = {
      ...next.pan,
      ...patch.pan,
      panOffset: patch.pan.panOffset
        ? { ...next.pan.panOffset, ...patch.pan.panOffset }
        : next.pan.panOffset,
      panOffsetLeft: patch.pan.panOffsetLeft
        ? { ...next.pan.panOffsetLeft, ...patch.pan.panOffsetLeft }
        : next.pan.panOffsetLeft,
      panOffsetRight: patch.pan.panOffsetRight
        ? { ...next.pan.panOffsetRight, ...patch.pan.panOffsetRight }
        : next.pan.panOffsetRight,
    };
  }
  if (patch.record) next.record = { ...next.record, ...patch.record };
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
