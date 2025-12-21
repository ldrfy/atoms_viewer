// src/lib/structure/parsers/lammpsDump.ts
import type { Atom, StructureModel } from "../types";

/**
 * LAMMPS dump 解析选项 / Parse options for LAMMPS dump
 */
export type ParseLammpsDumpOptions = {
  /**
   * type -> element 映射表（用于把数字 type 转成元素符号）
   * Map LAMMPS numeric "type" to element symbol, e.g. {1:"Si",2:"O"}
   */
  typeToElement?: Record<number, string>;

  /**
   * 是否按 id 排序每一帧（建议 true，可保证动画帧之间原子顺序稳定）
   * Sort atoms by "id" within each frame (recommended for stable animation).
   */
  sortById?: boolean;
};

/**
 * 解析 LAMMPS dump（支持多帧）
 *
 * Parse LAMMPS dump trajectory (multi-frame).
 *
 * 支持的格式 / Supported:
 * - ITEM: TIMESTEP
 * - ITEM: NUMBER OF ATOMS
 * - ITEM: BOX BOUNDS ...（只支持正交盒 orthogonal box）
 * - ITEM: ATOMS ...（要求包含 type，坐标支持 x y z 或 xs ys zs）
 *
 * 不支持 / Not supported (will throw):
 * - triclinic 盒（BOX BOUNDS 中含 xy xz yz）
 * - 其它更复杂的列名组合（后续可以再扩展）
 */
export function parseLammpsDump(
  text: string,
  opts?: ParseLammpsDumpOptions
): StructureModel {
  const lines = text.split(/\r?\n/);
  const frames: Atom[][] = [];
  const sortById = opts?.sortById ?? true;

  let i = 0;
  while (i < lines.length) {
    // 找到一帧的开头 / Find frame header
    if (!startsWith(lines[i], "ITEM: TIMESTEP")) {
      i += 1;
      continue;
    }

    // -------------------------
    // TIMESTEP
    // -------------------------
    i += 1; // move to timestep value
    i += 1; // skip timestep value (unused currently)

    // -------------------------
    // NUMBER OF ATOMS
    // -------------------------
    expectStartsWith(lines[i], "ITEM: NUMBER OF ATOMS");
    i += 1;
    const nAtoms = parseIntStrict(lines[i]);
    i += 1;

    // -------------------------
    // BOX BOUNDS
    // -------------------------
    // 盒子/box 的作用：
    // - 当坐标列是 x y z 时：盒子只用于读取，但不影响坐标（坐标已经是绝对坐标）
    // - 当坐标列是 xs ys zs 时：它们是 [0,1] 的缩放坐标，需要用盒子范围映射回真实坐标
    //
    // Box usage:
    // - if columns are x y z: box is not needed for coordinates (already absolute)
    // - if columns are xs ys zs: they are scaled to [0,1], need bounds to convert to Cartesian
    const boxLine = lines[i] ?? "";
    expectStartsWith(boxLine, "ITEM: BOX BOUNDS");

    // triclinic（倾斜盒）会在 header 中出现 xy/xz/yz
    // triclinic box contains tilt factors (xy xz yz). Not supported here for simplicity.
    const isTriclinic = /\bxy\b|\bxz\b|\byz\b/i.test(boxLine);
    i += 1;

    if (isTriclinic) {
      throw new Error(
        "LAMMPS dump：暂不支持 triclinic BOX（含 xy/xz/yz）。请用正交盒，或导出 x y z（非 xs/ys/zs）。"
      );
    }

    // 正交盒就是三行：xlo xhi / ylo yhi / zlo zhi
    // Orthogonal box bounds are 3 lines: [lo, hi] for each axis.
    const [xlo, xhi] = parseTwoFloats(lines[i]);
    i += 1;
    const [ylo, yhi] = parseTwoFloats(lines[i]);
    i += 1;
    const [zlo, zhi] = parseTwoFloats(lines[i]);
    i += 1;

    // -------------------------
    // ATOMS header + columns
    // -------------------------
    const header = lines[i] ?? "";
    if (!startsWith(header, "ITEM: ATOMS")) {
      throw new Error("LAMMPS dump 解析失败：缺少 ITEM: ATOMS 段。");
    }

    const cols = header.replace("ITEM: ATOMS", "").trim().split(/\s+/);
    i += 1;

    // 常见列名 / Common columns
    const idxId = cols.indexOf("id");
    const idxType = cols.indexOf("type");

    // 绝对坐标（推荐）/ absolute coordinates
    const idxX = firstIndexOf(cols, ["x", "xu"]);
    const idxY = firstIndexOf(cols, ["y", "yu"]);
    const idxZ = firstIndexOf(cols, ["z", "zu"]);

    // 缩放坐标 / scaled coordinates (0..1)
    const idxXs = cols.indexOf("xs");
    const idxYs = cols.indexOf("ys");
    const idxZs = cols.indexOf("zs");

    const hasAbs = idxX >= 0 && idxY >= 0 && idxZ >= 0;
    const hasScaled = idxXs >= 0 && idxYs >= 0 && idxZs >= 0;

    if (idxType < 0) {
      // 你要做 type->element 映射，type 列是必须的
      // "type" is required if we want type->element mapping.
      throw new Error(
        `LAMMPS dump：ATOMS 列缺少 "type"。columns=${cols.join(" ")}`
      );
    }

    if (!hasAbs && !hasScaled) {
      throw new Error(
        `LAMMPS dump：找不到坐标列（x y z 或 xs ys zs）。columns=${cols.join(
          " "
        )}`
      );
    }

    // -------------------------
    // Read atoms lines
    // -------------------------
    type Row = { id?: number; atom: Atom };
    const rows: Row[] = new Array(nAtoms);

    for (let k = 0; k < nAtoms; k += 1) {
      const parts = (lines[i + k] ?? "").trim().split(/\s+/);

      // id 可选，但强烈建议 dump 输出 id，用于排序与动画稳定
      // id is optional but recommended for stable animation (sorting).
      const id = idxId >= 0 ? parseIntSafe(parts[idxId]) : undefined;

      // type 是必须的（用于映射元素）
      // type is required (for element mapping).
      const typeId = parseIntSafe(parts[idxType]);

      const element = resolveElement(typeId, opts?.typeToElement);

      const [x, y, z] = hasAbs
        ? [
            parseFloatSafe(parts[idxX]),
            parseFloatSafe(parts[idxY]),
            parseFloatSafe(parts[idxZ]),
          ]
        : scaledToCartesian(
            parts,
            idxXs,
            idxYs,
            idxZs,
            xlo,
            xhi,
            ylo,
            yhi,
            zlo,
            zhi
          );

      // 保留 id/typeId，便于后续做实时映射更新、动画排序等
      // Keep id/typeId for future live remapping and stable animation.
      rows[k] = { id, atom: { element, position: [x, y, z], id, typeId } };
    }
    i += nAtoms;

    // -------------------------
    // Build the frame
    // -------------------------
    const frame: Atom[] =
      sortById && idxId >= 0
        ? rows
            .slice()
            .sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
            .map((r) => r.atom)
        : rows.map((r) => r.atom);

    frames.push(frame);
  }

  const atoms0 = frames[0];
  if (!atoms0) {
    throw new Error("LAMMPS dump 解析失败：未读取到任何帧（ITEM: TIMESTEP）。");
  }

  return { atoms: atoms0, frames, comment: "LAMMPS dump" };
}

/* -----------------------------
 * Helpers / 工具函数
 * ----------------------------- */

function startsWith(line: string | undefined, prefix: string): boolean {
  return (line ?? "").startsWith(prefix);
}

function expectStartsWith(line: string | undefined, prefix: string): void {
  if (!startsWith(line, prefix)) {
    throw new Error(
      `LAMMPS dump 解析失败：期望 "${prefix}"，实际为 "${line ?? ""}"`
    );
  }
}

function parseIntStrict(s: string | undefined): number {
  const v = Number.parseInt((s ?? "").trim(), 10);
  if (!Number.isFinite(v)) throw new Error(`无法解析整数：${s ?? ""}`);
  return v;
}

function parseIntSafe(s: string | undefined): number {
  const v = Number.parseInt((s ?? "").trim(), 10);
  return Number.isFinite(v) ? v : 0;
}

function parseFloatSafe(s: string | undefined): number {
  const v = Number.parseFloat((s ?? "").trim());
  return Number.isFinite(v) ? v : 0;
}

function parseTwoFloats(s: string | undefined): [number, number] {
  const parts = (s ?? "").trim().split(/\s+/);
  if (parts.length < 2) throw new Error(`无法解析 BOX BOUNDS 行：${s ?? ""}`);
  return [parseFloatSafe(parts[0]), parseFloatSafe(parts[1])];
}

/**
 * 从多个候选列名里取第一个出现的索引
 * Return the first existing column index among candidates.
 */
function firstIndexOf(cols: string[], candidates: string[]): number {
  for (const c of candidates) {
    const idx = cols.indexOf(c);
    if (idx >= 0) return idx;
  }
  return -1;
}

/**
 * 根据 typeId 获取元素符号
 * Resolve element symbol from typeId using provided mapping.
 */
function resolveElement(typeId: number, map?: Record<number, string>): string {
  const el = map?.[typeId];
  return el ? el : "E"; // 与你的 chem.ts 占位一致（Unknown）
}

/**
 * 把缩放坐标 xs/ys/zs（0..1）转换为真实坐标
 * Convert scaled coordinates xs/ys/zs (0..1) to Cartesian using box bounds.
 */
function scaledToCartesian(
  parts: string[],
  ix: number,
  iy: number,
  iz: number,
  xlo: number,
  xhi: number,
  ylo: number,
  yhi: number,
  zlo: number,
  zhi: number
): [number, number, number] {
  const xs = parseFloatSafe(parts[ix]);
  const ys = parseFloatSafe(parts[iy]);
  const zs = parseFloatSafe(parts[iz]);

  return [
    xlo + xs * (xhi - xlo),
    ylo + ys * (yhi - ylo),
    zlo + zs * (zhi - zlo),
  ];
}

/**
 * 判断文件格式是否属于 LAMMPS dump
 *
 * Check whether a format string indicates LAMMPS dump-like data.
 */
export function isLammpsDumpFormat(fmt: string): boolean {
  return ["dump", "lammpstrj", "traj", "lammpsdump"].includes(fmt);
}
