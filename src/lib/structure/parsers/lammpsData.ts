import type { Atom, StructureModel } from "../types";

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
 * 解析 LAMMPS read_data 的 data 文件结构（Atoms section）。
 *
 * Parse LAMMPS read_data "data" file (Atoms section).
 *
 * 说明 / Notes:
 * - 只解析 Atoms 段，忽略 Bonds/Angles/Velocities 等其它段。
 * - 支持常见 atom_style: atomic / molecular / charge / full（通过列数启发式推断 type 的位置）
 */
export function parseLammpsData(
  text: string,
  fileName: string,
  options: ParseLammpsDataOptions = {}
): StructureModel {
  const lines = text.split(/\r?\n/);

  const atoms: Atom[] = [];
  const typeToEl = options.lammpsTypeToElement ?? {};

  // 找到 "Atoms" section 的起始位置
  // Find the start of the "Atoms" section
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i] ?? "";
    const line = raw.trim();
    // 允许：Atoms / Atoms # full / Atoms # atomic ...
    if (line.startsWith("Atoms")) break;
    i += 1;
  }

  if (i >= lines.length) {
    throw new Error(`LAMMPS data: missing "Atoms" section in ${fileName}`);
  }

  // 跳过 header 行后的空行
  // Skip blank lines after section header
  i += 1;
  while (i < lines.length && (lines[i] ?? "").trim() === "") i += 1;

  // 读 Atoms 数据直到遇到空行或下一个 section
  // Read atom lines until blank line or next section
  while (i < lines.length) {
    const raw = lines[i] ?? "";
    const line0 = raw.trim();

    // 空行：Atoms section 结束
    // Blank line ends Atoms section
    if (!line0) break;

    // 下一个 section（Velocities/Bonds/...），也结束
    // Next section starts, stop parsing Atoms
    // 这里用“无空格的大写开头”做粗略判断（足够实用）
    if (/^[A-Za-z]/.test(line0) && !/^\d/.test(line0)) break;

    // 去掉行内注释
    // Strip inline comments
    const line = line0.split("#", 1)[0]!.trim();
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

    // 坐标总是取最后三列
    // xyz are always the last 3 columns (common in Atoms section)
    const x = Number(parts[parts.length - 3]);
    const y = Number(parts[parts.length - 2]);
    const z = Number(parts[parts.length - 1]);
    if (![x, y, z].every(Number.isFinite)) {
      i += 1;
      continue;
    }

    // 启发式推断 typeId 的列位置
    // Heuristic to locate typeId column by token count and numeric patterns
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
      format: "data", // 关键：让上层把它当作 LAMMPS 输入
    },
  };

  return model;
}

/**
 * 从 Atoms 行 tokens 推断 typeId。
 *
 * Infer typeId from an Atoms-line token array.
 *
 * 常见格式 / Common styles:
 * - atomic:    id type x y z              -> len=5, type=1
 * - molecular: id mol  type x y z         -> len=6, type=2 (token[2])
 * - charge:    id type q   x y z          -> len=6, type=1 (token[1]), token[2] is float(q)
 * - full:      id mol type q x y z        -> len=7, type=2 (token[2])
 */
function inferTypeId(parts: string[]): number {
  // 默认取第二列
  // Default: second column
  let idx = 1;

  if (parts.length >= 7) {
    // full 等：id mol type ...
    idx = 2;
  } else if (parts.length === 6) {
    // molecular or charge
    const third = Number(parts[2]);
    // charge: token[2] 是 q（通常非整数）
    // charge: token[2] is q (usually non-integer)
    if (Number.isFinite(third) && !Number.isInteger(third)) {
      idx = 1; // id type q x y z
    } else {
      idx = 2; // id mol type x y z
    }
  } else {
    // len=5 atomic: id type x y z
    idx = 1;
  }

  const typeId = parseInt(parts[idx] ?? "1", 10);
  return Number.isFinite(typeId) && typeId > 0 ? typeId : 1;
}

/**
 * 判断文件格式是否属于 LAMMPS data
 *
 * Check whether a format string indicates LAMMPS data-like data.
 */
export function isLammpsDataFormat(fmt: string): boolean {
  return ["data", "lmp"].includes(fmt);
}
