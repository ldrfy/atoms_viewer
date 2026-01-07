import type { Atom } from '../../lib/structure/types';
import { getAtomicNumber, getElementColorHex, normalizeElementSymbol } from '../../lib/structure/chem';
import type { AtomTypeColorMapItem } from '../../lib/viewer/settings';

/**
 * Create a stable "color key" for an atom.
 *
 * - Generic formats: use element only, e.g. "C".
 * - LAMMPS: one element can map to multiple typeIds; use "C1", "C2", ...
 */

export function getAtomTypeColorKey(element: string, typeId?: number): string {
  const el = normalizeElementSymbol(element) || 'E';
  const tid = typeof typeId === 'number' && Number.isFinite(typeId) ? Math.floor(typeId) : undefined;
  return tid && tid > 0 ? `${el}${tid}` : el;
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
    .sort((a, b) => {
      const za = getAtomicNumber(a.element);
      const zb = getAtomicNumber(b.element);
      if (za !== zb) return za - zb;
      return a.element.localeCompare(b.element);
    });
  return out;
}

export function syncColorMapRowsFromAtoms(
  existing: AtomTypeColorMapItem[] | undefined,
  atoms: Atom[],
  preferTypeId: boolean,
): AtomTypeColorMapItem[] {
  // Ensure the editable rows match the atoms present in the layer.
  // This is called on initial load and when LAMMPS type→element map changes.
  const old = Array.isArray(existing) ? existing : [];
  const wanted = collectWantedColorKeysFromAtoms(atoms, preferTypeId);

  const out: AtomTypeColorMapItem[] = [];
  for (const w of wanted) {
    const el = normalizeElementSymbol(w.element) || 'E';

    let prev: AtomTypeColorMapItem | undefined;
    if (preferTypeId && w.typeId != null) {
      prev = old.find(r => (r as any).typeId === w.typeId);
    }
    else {
      prev = old.find(r => (normalizeElementSymbol(r.element) || 'E') === el);
    }

    const prevEl = prev ? (normalizeElementSymbol(prev.element) || 'E') : null;
    const elementChanged = prev != null && prevEl !== el;

    // Reuse any existing custom color for the same element, regardless of typeId.
    const elementCustom = old.find(
      r => (normalizeElementSymbol(r.element) || 'E') === el && r.isCustom,
    );

    let isCustom = false;
    let nextColor = getElementColorHex(el);

    if (!prev || elementChanged) {
      if (elementCustom?.color) {
        isCustom = true;
        nextColor = elementCustom.color;
      }
    }
    else if (prev?.isCustom) {
      isCustom = true;
      nextColor = prev.color ?? getElementColorHex(el);
    }
    else {
      nextColor = prev?.color ?? getElementColorHex(el);
    }

    out.push({
      element: el,
      typeId: w.typeId,
      color: nextColor,
      isCustom,
    });
  }
  return out;
}

export function buildColorMapRecord(
  rows: AtomTypeColorMapItem[] | undefined,
): Record<string, string> {
  // Convert user-facing rows into a dictionary used by the renderer.
  const out: Record<string, string> = {};
  for (const r of rows ?? []) {
    const key = getAtomTypeColorKey(r.element, r.typeId);
    const c = String(r.color ?? '').trim();
    if (!c) continue;
    out[key] = c;
  }
  return out;
}
