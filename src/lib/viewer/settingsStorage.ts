import {
  DEFAULT_SETTINGS,
  type ViewerSettings,
} from './settings';

export const SETTINGS_STORAGE_KEY = 'atomsViewer.settings.v1';
export const SETTINGS_STORAGE_VERSION = 1;

type StoredSettings = {
  version: number;
  data: ViewerSettings;
};

export function buildDefaultSettings(): ViewerSettings {
  return {
    ...DEFAULT_SETTINGS,
    rotationDeg: { ...DEFAULT_SETTINGS.rotationDeg },
    autoRotate: { ...DEFAULT_SETTINGS.autoRotate },
    lammpsTypeMap: [...(DEFAULT_SETTINGS.lammpsTypeMap ?? [])],
    colorMapTemplate: [...(DEFAULT_SETTINGS.colorMapTemplate ?? [])],
    viewPresets: DEFAULT_SETTINGS.viewPresets
      ? [...DEFAULT_SETTINGS.viewPresets]
      : undefined,
  };
}

export function normalizeSettings(input: Partial<ViewerSettings> | null): ViewerSettings {
  const base = buildDefaultSettings();
  if (!input || typeof input !== 'object') return base;

  const v = input as Partial<ViewerSettings>;
  return {
    ...base,
    ...v,
    rotationDeg: { ...base.rotationDeg, ...(v.rotationDeg ?? {}) },
    autoRotate: {
      ...base.autoRotate,
      ...(v.autoRotate ?? {}),
      // Never persist system auto-enable state.
      autoEnabledBySystem: false,
    },
    lammpsTypeMap: Array.isArray(v.lammpsTypeMap)
      ? v.lammpsTypeMap.map(r => ({ ...r }))
      : base.lammpsTypeMap,
    colorMapTemplate: Array.isArray(v.colorMapTemplate)
      ? v.colorMapTemplate.map(r => ({ ...r }))
      : base.colorMapTemplate,
    viewPresets: Array.isArray(v.viewPresets)
      ? (v.viewPresets as any)
      : base.viewPresets,
  };
}

function migrateSettings(
  raw: Partial<ViewerSettings> | null,
): ViewerSettings {
  return normalizeSettings(raw);
}

export function loadSettingsFromStorage(): ViewerSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return buildDefaultSettings();

    const parsed = JSON.parse(raw) as StoredSettings | Partial<ViewerSettings>;
    const version
      = typeof (parsed as StoredSettings).version === 'number'
        ? (parsed as StoredSettings).version
        : 0;
    const data = (parsed as StoredSettings).data ?? parsed;

    if (version < SETTINGS_STORAGE_VERSION) {
      const migrated = migrateSettings(data as Partial<ViewerSettings>);
      saveSettingsToStorage(migrated);
      return migrated;
    }

    return normalizeSettings(data as Partial<ViewerSettings>);
  }
  catch {
    return buildDefaultSettings();
  }
}

export function saveSettingsToStorage(settings: ViewerSettings): void {
  try {
    const data: ViewerSettings = {
      ...settings,
      autoRotate: { ...settings.autoRotate },
      rotationDeg: { ...settings.rotationDeg },
    };
    if (data.autoRotate.autoEnabledBySystem) {
      data.autoRotate.enabled = false;
      data.autoRotate.autoEnabledBySystem = false;
    }
    const payload: StoredSettings = {
      version: SETTINGS_STORAGE_VERSION,
      data,
    };
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(payload));
  }
  catch {
    // ignore storage failures
  }
}

export function clearSettingsStorage(): void {
  try {
    localStorage.removeItem(SETTINGS_STORAGE_KEY);
  }
  catch {
    // ignore
  }
}
