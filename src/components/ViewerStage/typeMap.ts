import type { Atom } from '../../lib/structure/types';
import { normalizeElementSymbol } from '../../lib/structure/chem';
import type { LammpsTypeMapRecord } from '../../lib/viewer/settings';

export function buildLammpsTypeToElementMap(
  map: LammpsTypeMapRecord = {},
): Record<number, string> {
  const out: Record<number, string> = {};
  for (const [key, val] of Object.entries(map ?? {})) {
    const typeId = Math.max(1, Math.floor(Number.parseFloat(String(key))));
    if (!Number.isFinite(typeId)) continue;
    const el = normalizeElementSymbol(String(val ?? '')) || 'E';
    out[typeId] = el; // 重复 typeId 时后者覆盖
  }
  return out;
}

function normalizeTypeMapRecord(
  map: LammpsTypeMapRecord = {},
): LammpsTypeMapRecord {
  const entries: Array<{ tid: number; el: string }> = [];
  for (const [key, val] of Object.entries(map ?? {})) {
    const tid = Math.max(1, Math.floor(Number.parseFloat(String(key))));
    if (!Number.isFinite(tid)) continue;
    const el = normalizeElementSymbol(String(val ?? '')) || 'E';
    entries.push({ tid, el });
  }
  entries.sort((a, b) => a.tid - b.tid);
  const out: LammpsTypeMapRecord = {};
  for (const item of entries) {
    out[String(item.tid)] = item.el;
  }
  return out;
}

export function mergeTypeMap(
  existing: LammpsTypeMapRecord,
  detected: number[],
  defaults?: Record<number, string>,
): LammpsTypeMapRecord {
  const base = normalizeTypeMapRecord(existing);
  const detectedSet = new Set(
    (detected ?? [])
      .map(t => Math.max(1, Math.floor(t)))
      .filter(t => Number.isFinite(t) && t > 0),
  );

  const next: LammpsTypeMapRecord = {};
  for (const [key, val] of Object.entries(base)) {
    const tid = Math.max(1, Math.floor(Number.parseFloat(String(key))));
    if (!Number.isFinite(tid)) continue;
    if (detectedSet.size > 0 && !detectedSet.has(tid)) continue;
    next[String(tid)] = val;
  }

  const def = defaults ?? {};

  for (const tid0 of detected ?? []) {
    const tid = Math.max(1, Math.floor(tid0));
    if (!Number.isFinite(tid) || tid <= 0) continue;

    const cur0 = String(next[String(tid)] ?? '').trim();
    const cur = normalizeElementSymbol(cur0) || (cur0 ? cur0 : '');
    const isPlaceholder = !cur || cur === 'E';

    const d = normalizeElementSymbol(def[tid] ?? '') || '';

    if (!cur0) {
      next[String(tid)] = d && d !== 'E' ? d : 'E';
      continue;
    }

    if (isPlaceholder && d && d !== 'E') {
      next[String(tid)] = d;
    }
  }

  return normalizeTypeMapRecord(next);
}

export function typeMapEquals(
  a: LammpsTypeMapRecord,
  b: LammpsTypeMapRecord,
): boolean {
  const na = normalizeTypeMapRecord(a);
  const nb = normalizeTypeMapRecord(b);
  const aKeys = Object.keys(na);
  const bKeys = Object.keys(nb);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (na[key] !== nb[key]) return false;
  }
  return true;
}

export function remapElementByTypeId(
  frames: Atom[][],
  map: LammpsTypeMapRecord = {},
): Atom[][] {
  const mapById = buildLammpsTypeToElementMap(map);

  return frames.map(fr =>
    fr.map((a) => {
      const mapped = a.typeId ? mapById[a.typeId] : undefined;
      return {
        ...a,
        element: normalizeElementSymbol(mapped ?? a.element ?? 'E') || 'E',
      };
    }),
  );
}

/**
 * Remap a single frame's atoms by LAMMPS typeId -> element.
 *
 * This is used by the runtime to update colors/labels without re-parsing.
 */
export function remapAtomsByTypeId(
  atoms: Atom[],
  map: LammpsTypeMapRecord = {},
): Atom[] {
  const mapById = buildLammpsTypeToElementMap(map);

  return atoms.map((a) => {
    const mapped = a.typeId ? mapById[a.typeId] : undefined;
    return {
      ...a,
      element: normalizeElementSymbol(mapped ?? a.element ?? 'E') || 'E',
    };
  });
}

export function collectTypeIdsAndElementDefaultsFromAtoms(atoms: Atom[]): {
  typeIds: number[];
  defaults: Record<number, string>;
} {
  const set = new Set<number>();
  const defaults: Record<number, string> = {};

  for (const a of atoms) {
    const tid = a.typeId;
    if (typeof tid === 'number' && Number.isFinite(tid) && tid > 0) {
      set.add(tid);

      const el0 = (a.element ?? '').toString().trim();
      const el = normalizeElementSymbol(el0);
      // 只接受非占位符的默认值
      if (el && el !== 'E' && defaults[tid] == null) {
        defaults[tid] = el;
      }
    }
  }

  const typeIds = Array.from(set).sort((x, y) => x - y);
  return { typeIds, defaults };
}
