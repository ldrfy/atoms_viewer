import type { ViewerSettings } from './settings';
import { DEFAULT_SETTINGS } from './settings';
import type { ViewerSettingsCategorized } from './sessionTypes';

export type CategorizedSettings = ViewerSettingsCategorized;

export function buildCategorizedSettings(
  settings: ViewerSettings,
  animState?: Partial<NonNullable<ViewerSettingsCategorized['anim']>>,
  applyAllLayers?: Partial<{ details: boolean; colors: boolean }>,
): ViewerSettingsCategorized {
  const nextAnim = {
    ...settings.anim,
    ...(animState ?? {}),
  };
  return {
    files: { ...settings.files },
    rotation: { ...settings.rotation },
    view: {
      ...settings.view,
      rotationDeg: { ...settings.view.rotationDeg },
      viewPresets: settings.view.viewPresets ? [...settings.view.viewPresets] : [],
    },
    lammps: (settings.lammps ?? []).map(r => ({ ...r })),
    details: {
      ...settings.details,
      applyAllLayers: applyAllLayers?.details ?? settings.details.applyAllLayers,
    },
    colors: {
      applyAllLayers: applyAllLayers?.colors ?? settings.colors.applyAllLayers,
      data: { ...settings.colors.data },
    },
    anim: {
      ...nextAnim,
    },
    other: { ...settings.other },
  };
}

export function flattenCategorizedSettings(
  categorized: CategorizedSettings | Partial<CategorizedSettings>,
): ViewerSettings {
  const base: ViewerSettings = {
    files: { ...DEFAULT_SETTINGS.files },
    rotation: { ...DEFAULT_SETTINGS.rotation },
    view: {
      ...DEFAULT_SETTINGS.view,
      rotationDeg: { ...DEFAULT_SETTINGS.view.rotationDeg },
      viewPresets: DEFAULT_SETTINGS.view.viewPresets
        ? [...DEFAULT_SETTINGS.view.viewPresets]
        : [],
    },
    lammps: [...(DEFAULT_SETTINGS.lammps ?? [])],
    details: { ...DEFAULT_SETTINGS.details },
    colors: {
      applyAllLayers: DEFAULT_SETTINGS.colors.applyAllLayers,
      data: { ...DEFAULT_SETTINGS.colors.data },
    },
    anim: { ...DEFAULT_SETTINGS.anim },
    other: { ...DEFAULT_SETTINGS.other },
  };
  const apply = categorized as Partial<CategorizedSettings>;

  if (apply.files) {
    base.files = {
      ...base.files,
      ...apply.files,
    };
  }

  if (apply.rotation) {
    base.rotation = {
      ...base.rotation,
      ...apply.rotation,
    };
  }

  if (apply.view) {
    const nextRotation = apply.view.rotationDeg
      ? { ...base.view.rotationDeg, ...apply.view.rotationDeg }
      : base.view.rotationDeg;
    base.view = {
      ...base.view,
      ...apply.view,
      rotationDeg: nextRotation,
      viewPresets: apply.view.viewPresets ?? base.view.viewPresets,
    };
  }

  if (apply.lammps) {
    base.lammps = apply.lammps.map(r => ({ ...r }));
  }

  if (apply.details) {
    base.details = {
      ...base.details,
      ...apply.details,
    };
  }

  if (apply.colors) {
    base.colors = {
      ...base.colors,
      ...apply.colors,
      data: apply.colors.data ? { ...base.colors.data, ...apply.colors.data } : base.colors.data,
    };
  }

  if (apply.anim) {
    base.anim = {
      ...base.anim,
      ...apply.anim,
    };
  }

  if (apply.other) {
    base.other = {
      ...base.other,
      ...apply.other,
    };
  }

  return base;
}
