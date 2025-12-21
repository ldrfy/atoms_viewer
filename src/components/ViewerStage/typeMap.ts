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

export function collectTypeIdsFromAtoms(atoms: Atom[]): number[] {
  const set = new Set<number>();
  for (const a of atoms) {
    const tid = a.typeId;
    if (typeof tid === "number" && Number.isFinite(tid) && tid > 0)
      set.add(tid);
  }
  return Array.from(set).sort((a, b) => a - b);
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
  detected: number[]
): LammpsTypeMapRow[] {
  const base = normalizeTypeMapRows(existing);
  const seen = new Set<number>(base.map((r) => r.typeId));

  const appended: LammpsTypeMapRow[] = [...base];
  for (const tid of detected) {
    if (seen.has(tid)) continue;
    seen.add(tid);
    appended.push({ typeId: tid, element: "E" });
  }
  appended.sort((a, b) => a.typeId - b.typeId);
  return appended;
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
