import type { RotationDeg, ViewerSettings } from './settings';

export type SettingsPatch = Omit<Partial<ViewerSettings>, 'rotationDeg'> & {
  rotationDeg?: Partial<RotationDeg>;
};

export function cloneSettings(v: ViewerSettings): ViewerSettings {
  return {
    ...v,
    rotationDeg: { ...v.rotationDeg },
  };
}

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

export type SettingsShadow = {
  get: () => ViewerSettings;
  syncFrom: (next: ViewerSettings) => void;
  patch: (patch: SettingsPatch) => ViewerSettings;
  replace: (next: ViewerSettings) => ViewerSettings;
};

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
