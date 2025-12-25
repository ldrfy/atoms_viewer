// lib/structure/parsers/pdb.ts
import type { StructureModel } from "../types";
import { makeAtom } from "./common";
import { t } from "../../../i18n/index";

/**
 * 解析 PDB（ATOM/HETATM 坐标）。
 *
 * Returns:
 *   StructureModel: 至少包含 atoms
 */
export function parsePdb(text: string): StructureModel {
  const atoms = [];
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    const rec = line.slice(0, 6).trim();
    if (rec !== "ATOM" && rec !== "HETATM") continue;
    if (line.length < 54) continue;

    const x = safeParseFloat(line.slice(30, 38));
    const y = safeParseFloat(line.slice(38, 46));
    const z = safeParseFloat(line.slice(46, 54));

    const element =
      sanitizeElement(line.slice(76, 78)) ||
      guessElementFromAtomName(line.slice(12, 16)) ||
      "X";

    atoms.push(makeAtom(element, x, y, z));
  }

  if (atoms.length === 0) {
    throw new Error(t("errors.pdb.noAtomRecords"));
  }

  centerAtomsInPlace(atoms);

  return { atoms };
}

function safeParseFloat(s: string): number {
  const v = Number.parseFloat(s.trim());
  return Number.isFinite(v) ? v : 0;
}

function sanitizeElement(s: string): string {
  const t = s.trim();
  if (!t) return "";
  const m = t.match(/^[A-Za-z]{1,2}/);
  if (!m) return "";
  const core = m[0];
  return core.length === 1
    ? core.toUpperCase()
    : core[0]!.toUpperCase() + core.slice(1).toLowerCase();
}

function guessElementFromAtomName(atomName: string): string {
  const t = atomName.trim();
  if (!t) return "";
  const m = t.match(/^[A-Za-z]{1,2}/);
  return m ? sanitizeElement(m[0]) : "";
}

function centerAtomsInPlace(
  atoms: { position: [number, number, number] }[]
): void {
  let cx = 0;
  let cy = 0;
  let cz = 0;

  for (const a of atoms) {
    cx += a.position[0];
    cy += a.position[1];
    cz += a.position[2];
  }
  cx /= atoms.length;
  cy /= atoms.length;
  cz /= atoms.length;

  for (const a of atoms) {
    a.position[0] -= cx;
    a.position[1] -= cy;
    a.position[2] -= cz;
  }
}
