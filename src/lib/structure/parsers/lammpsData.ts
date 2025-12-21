import type { Atom, StructureModel } from "../types";
import { t } from "../../../i18n/tr";

/**
 * LAMMPS data 文件解析选项。
 *
 * Options for parsing LAMMPS data files.
 */
export type ParseLammpsDataOptions = {
  /**
   * typeId -> element 映射（缺失则用 "E"）。
   *
   * typeId -> element mapping (fallback to "E" when missing).
   *
   * Note: If Atom Type Labels exist in the file, they will be used as defaults.
   *       This mapping will override file labels when keys overlap.
   */
  lammpsTypeToElement?: Record<number, string>;

  /**
   * 是否按 id 排序（用于保证动画/更新稳定）。
   *
   * Sort atoms by id for stable rendering.
   */
  sortById?: boolean;
};

/**
 * 解析 LAMMPS "Atom Type Labels" section:
 *
 * Atom Type Labels
 * 1 Si
 * 2 O
 *
 * Returns { 1: "Si", 2: "O" }.
 */
function parseAtomTypeLabels(lines: string[]): Record<number, string> {
  const map: Record<number, string> = {};

  let i = 0;
  while (i < lines.length) {
    const line = (lines[i] ?? "").trim();
    // allow: "Atom Type Labels" / "Atom Type Labels # ..."
    if (line.startsWith("Atom Type Labels")) break;
    i += 1;
  }
  if (i >= lines.length) return map;

  // skip blank lines after header
  i += 1;
  while (i < lines.length && (lines[i] ?? "").trim() === "") i += 1;

  while (i < lines.length) {
    const raw = lines[i] ?? "";
    const line0 = raw.trim();

    // blank line ends section
    if (!line0) break;

    // next section starts (rough heuristic)
    if (/^[A-Za-z]/.test(line0) && !/^\d/.test(line0)) break;

    // strip inline comments
    const line = line0.split("#")[0]!.trim();
    if (!line) {
      i += 1;
      continue;
    }

    const parts = line.split(/\s+/);
    if (parts.length < 2) {
      i += 1;
      continue;
    }

    const typeId = parseInt(parts[0]!, 10);
    if (!Number.isFinite(typeId) || typeId <= 0) {
      i += 1;
      continue;
    }

    const label = parts.slice(1).join(" ").trim();
    if (label) map[typeId] = label;

    i += 1;
  }

  return map;
}

/**
 * 从 Atoms 行 tokens 推断 typeId。
 *
 * Infer typeId from an Atoms-line token array.
 *
 * Common styles:
 * - atomic:    id type x y z              -> len=5, type=1
 * - molecular: id mol  type x y z         -> len=6, type=2 (token[2])
 * - charge:    id type q   x y z          -> len=6, type=1 (token[1]), token[2] is float(q)
 * - full:      id mol type q x y z        -> len=7, type=2 (token[2])
 */
function inferTypeId(parts: string[]): number {
  let idx = 1;

  if (parts.length >= 7) {
    idx = 2;
  } else if (parts.length === 6) {
    const third = Number(parts[2]);
    if (Number.isFinite(third) && !Number.isInteger(third)) {
      idx = 1; // id type q x y z
    } else {
      idx = 2; // id mol type x y z
    }
  } else {
    idx = 1; // len=5 atomic: id type x y z
  }

  const typeId = parseInt(parts[idx] ?? "1", 10);
  return Number.isFinite(typeId) && typeId > 0 ? typeId : 1;
}

/**
 * 解析 LAMMPS read_data 的 data 文件结构（Atoms section）。
 *
 * Parse LAMMPS read_data "data" file (Atoms section).
 *
 * Notes:
 * - Only parse the Atoms section; ignore Bonds/Angles/Velocities/etc.
 * - Support common atom_style: atomic / molecular / charge / full (heuristic by column count)
 * - If "Atom Type Labels" section exists, it will be used to map typeId -> element automatically.
 */
export function parseLammpsData(
  text: string,
  fileName: string,
  options: ParseLammpsDataOptions = {}
): StructureModel {
  const lines = text.split(/\r?\n/);

  const atoms: Atom[] = [];

  // 1) Parse "Atom Type Labels" if present
  const fileTypeLabels = parseAtomTypeLabels(lines);
  console.log(fileTypeLabels);

  // 2) Merge mapping:
  // - Start with file labels
  // - User mapping overrides ONLY when it provides a meaningful element (not "", not "E")
  const typeToEl: Record<number, string> = { ...fileTypeLabels };

  const userMap = options.lammpsTypeToElement ?? {};
  for (const [k, v] of Object.entries(userMap)) {
    const typeId = Number(k);
    if (!Number.isFinite(typeId) || typeId <= 0) continue;

    const el = String(v ?? "").trim();
    if (!el || el === "E") continue; // do NOT override file labels with placeholder

    typeToEl[typeId] = el;
  }

  // 3) Find "Atoms" section
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i] ?? "";
    const line = raw.trim();
    // allow: Atoms / Atoms # full / Atoms # atomic ...
    if (line.startsWith("Atoms")) break;
    i += 1;
  }

  if (i >= lines.length) {
    throw new Error(t("errors.lammpsData.missingAtomsSection", { fileName }));
  }

  // skip blank lines after section header
  i += 1;
  while (i < lines.length && (lines[i] ?? "").trim() === "") i += 1;

  // 4) Read Atoms lines until blank line or next section
  while (i < lines.length) {
    const raw = lines[i] ?? "";
    const line0 = raw.trim();

    // blank line ends Atoms section
    if (!line0) break;

    // next section starts (rough heuristic)
    if (/^[A-Za-z]/.test(line0) && !/^\d/.test(line0)) break;

    // strip inline comments (FIX: do not use split("#", 1))
    const line = line0.split("#")[0]!.trim();
    if (!line) {
      i += 1;
      continue;
    }

    const parts = line.split(/\s+/);
    if (parts.length < 5) {
      i += 1;
      continue;
    }

    const id = parseInt(parts[0]!, 10);
    if (!Number.isFinite(id)) {
      i += 1;
      continue;
    }

    // xyz are always last 3 columns (common in Atoms section)
    const x = Number(parts[parts.length - 3]);
    const y = Number(parts[parts.length - 2]);
    const z = Number(parts[parts.length - 1]);
    if (![x, y, z].every(Number.isFinite)) {
      i += 1;
      continue;
    }

    const typeId = inferTypeId(parts);
    const element = (typeToEl[typeId] ?? "E").toString();

    atoms.push({
      id,
      typeId,
      element,
      position: [x, y, z],
    });

    i += 1;
  }

  if (options.sortById) {
    atoms.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
  }

  const model: StructureModel = {
    atoms,
    frames: [atoms],
    source: {
      filename: fileName,
      format: "lammpsdata",
    },
  };

  return model;
}

/**
 * 判断文件格式是否属于 LAMMPS data
 *
 * Check whether a format string indicates LAMMPS data-like data.
 */
export function isLammpsDataFormat(fmt: string): boolean {
  return ["data", "lammpsdata"].includes(fmt);
}
