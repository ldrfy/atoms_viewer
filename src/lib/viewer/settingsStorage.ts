import {
  DEFAULT_SETTINGS,
  type ViewerSettings,
} from './settings';

// Local storage key for viewer settings. / 本地设置存储键名。
export const SETTINGS_STORAGE_KEY = 'atomsViewer.settings.v1';
// Storage schema version. / 本地设置存储版本号。
export const SETTINGS_STORAGE_VERSION = 1;

type StoredSettings = {
  version: number;
  data: ViewerSettings;
};

/**
 * Build a fresh default settings object (deep-ish copy).
 * 构建一份新的默认设置（避免引用共享）。
 */
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

/**
 * Normalize incoming settings (merge with defaults, fill missing fields).
 * 归一化输入设置（合并默认值，补齐缺失字段）。
 */
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

/**
 * Load settings from localStorage with migration fallback.
 * 从本地读取设置，必要时进行迁移与回退。
 */
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

/**
 * Save settings to localStorage (system auto-rotate is never persisted).
 * 保存设置到本地（系统自动启用旋转不会持久化）。
 */
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

/**
 * Clear persisted settings from localStorage.
 * 清理本地持久化设置。
 */
export function clearSettingsStorage(): void {
  try {
    localStorage.removeItem(SETTINGS_STORAGE_KEY);
  }
  catch {
    // ignore
  }
}
