import {
  DEFAULT_SETTINGS,
  type ViewerSettings,
} from './settings';
import { mergeCategorizedSettings } from './sessionTemplates';

// Local storage key for viewer settings. / 本地设置存储键名。
export const SETTINGS_STORAGE_KEY = 'atomsViewer.settings.v1';
/**
 * Build a fresh default settings object (deep-ish copy).
 * 构建一份新的默认设置（避免引用共享）。
 */
export function buildDefaultSettings(): ViewerSettings {
  return {
    files: { ...DEFAULT_SETTINGS.files },
    rotation: { ...DEFAULT_SETTINGS.rotation },
    view: {
      ...DEFAULT_SETTINGS.view,
      rotationDeg: { ...DEFAULT_SETTINGS.view.rotationDeg },
      viewPresets: DEFAULT_SETTINGS.view.viewPresets
        ? [...DEFAULT_SETTINGS.view.viewPresets]
        : [],
    },
    pan: {
      panOffset: { ...DEFAULT_SETTINGS.pan.panOffset },
      panOffsetLeft: { ...DEFAULT_SETTINGS.pan.panOffsetLeft },
      panOffsetRight: { ...DEFAULT_SETTINGS.pan.panOffsetRight },
    },
    record: { ...DEFAULT_SETTINGS.record },
    effectRange: { ...DEFAULT_SETTINGS.effectRange },
    other: {
      ...DEFAULT_SETTINGS.other,
    },
  };
}

/**
 * Load settings from localStorage.
 * 从本地读取设置。
 */
export function loadSettingsFromStorage(): ViewerSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return buildDefaultSettings();

    const parsed = JSON.parse(raw) as ViewerSettings;
    if (!parsed || typeof parsed !== 'object') return buildDefaultSettings();
    const next = mergeCategorizedSettings(parsed as any);
    return next;
  }
  catch {
    return buildDefaultSettings();
  }
}

/**
 * Save settings to localStorage.
 * 保存设置到本地。
 */
export function saveSettingsToStorage(settings: ViewerSettings): void {
  try {
    const data: ViewerSettings = {
      files: { ...settings.files },
      rotation: { ...settings.rotation },
      view: {
        ...settings.view,
        rotationDeg: { ...settings.view.rotationDeg },
        viewPresets: settings.view.viewPresets ? [...settings.view.viewPresets] : [],
      },
      pan: {
        panOffset: { ...settings.pan.panOffset },
        panOffsetLeft: { ...settings.pan.panOffsetLeft },
        panOffsetRight: { ...settings.pan.panOffsetRight },
      },
      record: { ...settings.record },
      effectRange: { ...settings.effectRange },
      other: {
        ...settings.other,
      },
    };
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(data));
  }
  catch {
    // ignore storage failures
  }
}

/**
 * Clear persisted settings from localStorage.
 * 清空本地持久化设置。
 */
export function clearSettingsStorage(): void {
  try {
    localStorage.removeItem(SETTINGS_STORAGE_KEY);
  }
  catch {
    // ignore
  }
}
