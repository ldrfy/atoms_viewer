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
    lammps: [...(DEFAULT_SETTINGS.lammps ?? [])],
    details: { ...DEFAULT_SETTINGS.details },
    colors: {
      applyAllLayers: DEFAULT_SETTINGS.colors.applyAllLayers,
      data: { ...DEFAULT_SETTINGS.colors.data },
    },
    anim: { ...DEFAULT_SETTINGS.anim },
    other: { ...DEFAULT_SETTINGS.other },
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
    return mergeCategorizedSettings(parsed as any);
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
      files: { ...settings.files },
      rotation: { ...settings.rotation },
      view: {
        ...settings.view,
        rotationDeg: { ...settings.view.rotationDeg },
        viewPresets: settings.view.viewPresets ? [...settings.view.viewPresets] : [],
      },
      lammps: [...(settings.lammps ?? [])],
      details: { ...settings.details },
      colors: {
        applyAllLayers: settings.colors.applyAllLayers,
        data: { ...settings.colors.data },
      },
      anim: { ...settings.anim },
      other: { ...settings.other },
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
