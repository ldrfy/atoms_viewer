import { readApplyAllLayersFlags } from './applyAllStorage';

export type PanelScopeKey = 'colors' | 'details' | 'lammps';
export type LayerScope = 'current' | 'visible' | 'all';

const STORAGE_KEYS: Record<PanelScopeKey, string> = {
  colors: 'settings.scope.colors',
  details: 'settings.scope.details',
  lammps: 'settings.scope.lammps',
};

const LEGACY_FLAG_MAP: Record<PanelScopeKey, keyof ReturnType<typeof readApplyAllLayersFlags>> = {
  colors: 'colors',
  details: 'details',
  lammps: 'lammps',
};

const DEFAULT_SCOPES: Record<PanelScopeKey, LayerScope> = {
  colors: 'all',
  details: 'all',
  lammps: 'current',
};

function safeRead(key: string): string | null {
  try {
    return localStorage.getItem(key);
  }
  catch {
    return null;
  }
}

function safeWrite(key: string, value: string | null): void {
  try {
    if (value == null) {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, value);
  }
  catch {
    // ignore storage failures
  }
}

// 读取图层作用域偏好（优先新键，兼容旧存储）。
// Read the layer scope preference (new key first, with legacy fallback).
export function readLayerScope(panel: PanelScopeKey): LayerScope | undefined {
  const stored = safeRead(STORAGE_KEYS[panel]);
  if (stored === 'current' || stored === 'visible' || stored === 'all') {
    return stored;
  }

  const legacy = readApplyAllLayersFlags();
  const flag = legacy[LEGACY_FLAG_MAP[panel]];
  if (flag === true) return 'all';
  if (flag === false) return 'current';
  return undefined;
}

// 将图层作用域写入本地存储。
// Persist the layer scope preference to localStorage.
export function writeLayerScope(panel: PanelScopeKey, value: LayerScope | undefined): void {
  safeWrite(STORAGE_KEYS[panel], value ?? null);
}

// 为某个面板返回默认的作用域。
// Return the default scope for the given panel.
export function getDefaultLayerScope(panel: PanelScopeKey): LayerScope {
  return DEFAULT_SCOPES[panel];
}
