import type { Atom } from "../../lib/structure/types";
import { normalizeElementSymbol } from "../../lib/structure/chem";

export type LammpsTypeMapRow = { typeId: number; element: string };

export function buildLammpsTypeToElementMap(
  rows: LammpsTypeMapRow[] = []
): Record<number, string> {
  const out: Record<number, string> = {};
  for (const row of rows) {
    const typeId = Math.max(1, Math.floor(row.typeId));
    const el = normalizeElementSymbol(row.element) || "E";
    out[typeId] = el; // 重复 typeId 时后者覆盖
  }
  return out;
}

export function normalizeTypeMapRows(
  rows: LammpsTypeMapRow[]
): LammpsTypeMapRow[] {
  const seen = new Set<number>();
  const out: LammpsTypeMapRow[] = [];
  for (const r of rows) {
    const id = Math.max(1, Math.floor(r.typeId));
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ typeId: id, element: r.element });
  }
  out.sort((a, b) => a.typeId - b.typeId);
  return out;
}

export function mergeTypeMap(
  existing: LammpsTypeMapRow[],
  detected: number[],
  defaults?: Record<number, string>
): LammpsTypeMapRow[] {
  const base = normalizeTypeMapRows(existing);

  // 用 Map 便于升级/插入
  const map = new Map<number, LammpsTypeMapRow>();
  for (const r of base) {
    const tid = Math.max(1, Math.floor(r.typeId));
    map.set(tid, { typeId: tid, element: r.element });
  }

  const def = defaults ?? {};

  for (const tid0 of detected) {
    const tid = Math.max(1, Math.floor(tid0));
    if (!Number.isFinite(tid) || tid <= 0) continue;

    const row = map.get(tid);
    const d = normalizeElementSymbol(def[tid] ?? "");

    if (!row) {
      // 新增：优先 defaults，否则 E
      map.set(tid, { typeId: tid, element: d && d !== "E" ? d : "E" });
      continue;
    }

    // 升级：仅当现有是空或 E 时，才用 defaults 覆盖
    const cur0 = (row.element ?? "").toString().trim();
    const cur = normalizeElementSymbol(cur0) || (cur0 ? cur0 : "");
    const isPlaceholder = !cur || cur === "E";

    if (isPlaceholder && d && d !== "E") {
      row.element = d;
    }
  }

  const out = Array.from(map.values());
  out.sort((a, b) => a.typeId - b.typeId);
  return out;
}

export function typeMapEquals(
  a: LammpsTypeMapRow[],
  b: LammpsTypeMapRow[]
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i]!.typeId !== b[i]!.typeId) return false;
    if ((a[i]!.element ?? "") !== (b[i]!.element ?? "")) return false;
  }
  return true;
}

export function remapElementByTypeId(
  frames: Atom[][],
  rows: LammpsTypeMapRow[] = []
): Atom[][] {
  const map = buildLammpsTypeToElementMap(rows);

  return frames.map((fr) =>
    fr.map((a) => {
      const mapped = a.typeId ? map[a.typeId] : undefined;
      return {
        ...a,
        element: normalizeElementSymbol(mapped ?? a.element ?? "E") || "E",
      };
    })
  );
}

export function collectTypeIdsAndElementDefaultsFromAtoms(atoms: Atom[]): {
  typeIds: number[];
  defaults: Record<number, string>;
} {
  const set = new Set<number>();
  const defaults: Record<number, string> = {};

  for (const a of atoms) {
    const tid = a.typeId;
    if (typeof tid === "number" && Number.isFinite(tid) && tid > 0) {
      set.add(tid);

      const el0 = (a.element ?? "").toString().trim();
      const el = normalizeElementSymbol(el0);
      // 只接受非占位符的默认值
      if (el && el !== "E" && defaults[tid] == null) {
        defaults[tid] = el;
      }
    }
  }

  const typeIds = Array.from(set).sort((x, y) => x - y);
  return { typeIds, defaults };
}
