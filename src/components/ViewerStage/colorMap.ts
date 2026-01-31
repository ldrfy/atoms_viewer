import type { Atom } from '../../lib/structure/types';
import { getElementColorHex, normalizeElementSymbol } from '../../lib/structure/chem';

export type ColorMapRecord = Record<string, string>;
export type ParsedColorValue = { hex: string; alpha: number };

/**
 * Create a stable "color key" for an atom.
 *
 * - Generic formats: use element only, e.g. "C".
 * - LAMMPS: one element can map to multiple typeIds; use "C.1", "C.2", ...
 */

export function getAtomTypeColorKey(element: string, typeId?: number): string {
  const el = normalizeElementSymbol(element) || 'E';
  const tid = typeof typeId === 'number' && Number.isFinite(typeId) ? Math.floor(typeId) : undefined;
  return tid && tid > 0 ? `${el}.${tid}` : el;
}

type WantedKey = { element: string; typeId?: number };

export function collectWantedColorKeysFromAtoms(
  atoms: Atom[],
  preferTypeId: boolean,
): WantedKey[] {
  // Collect the set of keys that should be shown/edited in Settings.
  if (!atoms || atoms.length === 0) return [];

  if (preferTypeId) {
    const map = new Map<number, string>();
    for (const a of atoms) {
      const tid = a.typeId;
      if (typeof tid !== 'number' || !Number.isFinite(tid) || tid <= 0) continue;
      if (!map.has(tid)) map.set(Math.floor(tid), a.element);
    }
    const out: WantedKey[] = Array.from(map.entries())
      .map(([typeId, element]) => ({ typeId, element: normalizeElementSymbol(element) || 'E' }))
      .sort((a, b) => (a.typeId ?? 0) - (b.typeId ?? 0));
    return out;
  }

  const set = new Set<string>();
  for (const a of atoms) {
    const el = normalizeElementSymbol(a.element) || 'E';
    set.add(el);
  }

  const out: WantedKey[] = Array.from(set)
    .map(el => ({ element: el }))
    .sort((a, b) => a.element.localeCompare(b.element));
  return out;
}

export function buildColorMapKeysFromAtoms(
  atoms: Atom[],
  preferTypeId: boolean,
): string[] {
  const wanted = collectWantedColorKeysFromAtoms(atoms, preferTypeId);
  return wanted.map(w =>
    getAtomTypeColorKey(w.element, preferTypeId ? w.typeId : undefined),
  );
}

export function buildColorMapFromAtoms(
  existing: ColorMapRecord | undefined,
  atoms: Atom[],
  preferTypeId: boolean,
): ColorMapRecord {
  const data = existing ?? {};
  const keys = buildColorMapKeysFromAtoms(atoms, preferTypeId);
  const out: ColorMapRecord = {};
  for (const key of keys) {
    const { element } = parseAtomTypeColorKey(key);
    const color = data[key] ?? data[element] ?? getElementColorHex(element);
    if (!color) continue;
    out[key] = color;
  }
  return out;
}

export function syncColorMapRecordFromAtoms(
  existing: ColorMapRecord | undefined,
  atoms: Atom[],
  preferTypeId: boolean,
): ColorMapRecord {
  return buildColorMapFromAtoms(existing, atoms, preferTypeId);
}

export function buildColorMapRecord(
  rows: ColorMapRecord | undefined,
): ColorMapRecord {
  const out: ColorMapRecord = {};
  for (const [key, value] of Object.entries(rows ?? {})) {
    const c = String(value ?? '').trim();
    if (!c) continue;
    out[key] = c;
  }
  return out;
}

export function buildElementColorRecordFromMap(
  map: ColorMapRecord | undefined,
  baseByElement?: Record<string, string>,
): ColorMapRecord {
  const out: ColorMapRecord = {};
  const data = map ?? {};
  for (const [key, value] of Object.entries(data)) {
    const color = String(value ?? '').trim();
    if (!color) continue;
    const { element, typeId } = parseAtomTypeColorKey(key);
    if (!element) continue;
    if (baseByElement) {
      const base = String(baseByElement[element] ?? '').trim();
      if (base && base.toUpperCase() === color.toUpperCase()) continue;
    }
    if (typeId == null && !(element in out)) {
      out[element] = color;
      continue;
    }
    if (!(element in out)) {
      out[element] = color;
    }
  }
  return out;
}

function parseAtomTypeColorKey(key: string): { element: string; typeId?: number } {
  const trimmed = String(key ?? '').trim();
  const [elementRaw = '', typeIdRaw] = trimmed.split('.', 2);
  const element = normalizeElementSymbol(elementRaw) || 'E';
  const typeId = typeIdRaw ? Number.parseInt(typeIdRaw, 10) : undefined;
  return {
    element,
    typeId: Number.isFinite(typeId) && (typeId as number) > 0 ? typeId : undefined,
  };
}

export function parseColorMapKey(key: string): { element: string; typeId?: number } {
  return parseAtomTypeColorKey(key);
}

export function buildCustomColorMapRecord(
  rows: ColorMapRecord | undefined,
  baseByElement: Record<string, string>,
): ColorMapRecord {
  const out: ColorMapRecord = {};
  const record = buildColorMapRecord(rows);
  for (const [key, value] of Object.entries(record)) {
    const c = String(value ?? '').trim();
    if (!c) continue;
    const { element } = parseAtomTypeColorKey(key);
    const base = String(baseByElement[element] ?? getElementColorHex(element)).trim();
    if (base && base.toUpperCase() === c.toUpperCase()) continue;
    out[key] = c;
  }
  return out;
}

export function parseColorMapRecord(
  data: Record<string, string> | undefined,
): ColorMapRecord {
  return buildColorMapRecord(data);
}

/**
 * Parse a color value with optional alpha suffix.
 * 解析带可选透明度后缀的颜色值。
 *
 * Supported formats:
 * - #RRGGBB / #RGB
 * - #RRGGBB@0.5 (alpha 0..1)
 */
export function parseColorValue(input: unknown): ParsedColorValue | null {
  const raw = String(input ?? '').trim();
  if (!raw) return null;
  const [hexRaw, alphaRaw] = raw.split('@', 2).map(v => v.trim());
  const hex = normalizeHexColor(hexRaw);
  if (!hex) return null;
  let alpha = 1;
  if (alphaRaw) {
    const n = Number(alphaRaw);
    if (Number.isFinite(n)) {
      alpha = n > 1 ? n / 100 : n;
    }
  }
  alpha = Math.min(1, Math.max(0, alpha));
  return { hex, alpha };
}

/**
 * Format a color value with alpha suffix if needed.
 * 如有需要，将颜色与透明度格式化为带后缀的字符串。
 */
export function formatColorValue(hex: string, alpha: number): string {
  const safeHex = normalizeHexColor(hex) ?? '#FFFFFF';
  const a = Math.min(1, Math.max(0, Number.isFinite(alpha) ? alpha : 1));
  if (a >= 0.999) return safeHex;
  const text = a.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return `${safeHex}@${text}`;
}

function normalizeHexColor(input: unknown): string | null {
  const s = String(input ?? '').trim();
  if (!s) return null;
  const m = s.match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (!m) return null;
  let hex = m[1]!.toUpperCase();
  if (hex.length === 3) hex = hex.split('').map(ch => ch + ch).join('');
  return `#${hex}`;
}
