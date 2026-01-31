import type { ViewerSettings } from './viewer/settings';
import { PANEL_KEYS } from './viewer/panelKeys';

function parseBoolean(raw: string): boolean | null {
  const lowered = raw.trim().toLowerCase();
  if (lowered === 'true' || lowered === '1') return true;
  if (lowered === 'false' || lowered === '0') return false;
  return null;
}

function tryParseJson(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  }
  catch {
    return null;
  }
}

export function readSettingsOverridesFromUrl(
  base: ViewerSettings,
): Partial<ViewerSettings> {
  if (typeof window === 'undefined') return {};
  const params = new URLSearchParams(window.location.search);
  const overrides: Partial<ViewerSettings> = {};

  const jsonKeys = new Set<string>([
    PANEL_KEYS.files,
    PANEL_KEYS.rotation,
    PANEL_KEYS.view,
    PANEL_KEYS.other,
    'pan',
    'record',
  ]);
  const groupPrefixes = new Set<string>([
    'files',
    'rotation',
    'view',
    'pan',
    'record',
    'other',
  ]);

  const entries: { key: string; values: string[] }[] = [];
  for (const key of params.keys()) {
    const values = params.getAll(key);
    if (values.length === 0) continue;
    let normalized = key;
    const dotIndex = key.indexOf('.');
    if (dotIndex > 0) {
      const prefix = key.slice(0, dotIndex);
      if (groupPrefixes.has(prefix)) {
        normalized = key.slice(dotIndex + 1);
      }
    }
    entries.push({ key: normalized, values });
  }

  function parseValue(
    sample: unknown,
    rawAll: string[],
    rawLast: string,
    topKey: string,
    pathLen: number,
    endKey: string,
  ): unknown {
    if (pathLen === 1 && jsonKeys.has(topKey)) {
      const parsed = tryParseJson(rawLast);
      return parsed !== null ? parsed : null;
    }
    if (Array.isArray(sample)) {
      if (sample.length > 0 && typeof sample[0] !== 'object') {
        const list = rawAll
          .flatMap(v => v.split(','))
          .map(v => v.trim())
          .filter(Boolean);
        return list.length > 0 ? list : null;
      }
      const parsed = tryParseJson(rawLast);
      return parsed !== null ? parsed : null;
    }
    if (typeof sample === 'number') {
      const n = Number.parseFloat(rawLast);
      return Number.isFinite(n) ? n : null;
    }
    if (typeof sample === 'boolean') {
      return parseBoolean(rawLast);
    }
    if (typeof sample === 'string') {
      if (endKey === 'backgroundColor') {
        const trimmed = rawLast.trim();
        if (/^0x[0-9a-fA-F]{6}$/.test(trimmed)) {
          return `#${trimmed.slice(2)}`;
        }
        if (/^[0-9a-fA-F]{6}$/.test(trimmed) || /^[0-9a-fA-F]{3}$/.test(trimmed)) {
          return `#${trimmed}`;
        }
      }
      return rawLast;
    }
    const parsed = tryParseJson(rawLast);
    return parsed !== null ? parsed : null;
  }

  function setNestedValue(path: string[], value: unknown): void {
    if (path.length === 0) return;
    const topKey = path[0] as keyof ViewerSettings;
    if (!(topKey in base)) return;
    if (path.length === 1) {
      (overrides as Record<string, unknown>)[topKey] = value as any;
      return;
    }
    const current = (overrides as Record<string, unknown>)[topKey];
    const seed = (typeof current === 'object' && current)
      ? current
      : (typeof base[topKey] === 'object' && base[topKey] !== null)
          ? { ...(base[topKey] as Record<string, unknown>) }
          : {};
    let cursor: Record<string, unknown> = seed as Record<string, unknown>;
    for (let i = 1; i < path.length - 1; i += 1) {
      const key = path[i]!;
      const existing = cursor[key];
      if (typeof existing === 'object' && existing !== null) {
        cursor = existing as Record<string, unknown>;
      }
      else {
        const next: Record<string, unknown> = {};
        cursor[key] = next;
        cursor = next;
      }
    }
    cursor[path[path.length - 1]!] = value;
    (overrides as Record<string, unknown>)[topKey] = seed as any;
  }

  for (const entry of entries) {
    const rawAll = entry.values;
    const rawLast = rawAll[rawAll.length - 1];
    if (!rawLast) continue;

    const path = entry.key.split('.').filter(Boolean);
    if (path.length === 0) continue;
    const topKey = path[0]!;
    if (!(topKey in base)) continue;
    const sample = (base as Record<string, unknown>)[topKey];
    const nestedSample
      = path.length > 1 && sample && typeof sample === 'object'
        ? (sample as Record<string, unknown>)[path[1]!]
        : sample;
    const endKey = path[path.length - 1]!;
    const parsed = parseValue(nestedSample, rawAll, rawLast, topKey, path.length, endKey);
    if (parsed === null || parsed === undefined) continue;
    setNestedValue(path, parsed);
  }

  return overrides;
}
