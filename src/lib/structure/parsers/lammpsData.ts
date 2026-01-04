// src/lib/structure/parsers/lammpsData.ts
import type { Atom, StructureModel } from '../types';
import { normalizeElementSymbol } from '../chem';
import { t } from '../../../i18n/index';

/**
 * Options for parsing LAMMPS data files.
 * https://docs.lammps.org/read_data.html
 * LAMMPS data 文件解析选项。
 */
export type ParseLammpsDataOptions = {
  /**
   * typeId -> element mapping (fallback to "E" when missing).
   *
   * typeId -> element 映射（缺失则回退为 "E"）。
   *
   * Note / 注意：
   * - If Atom Type Labels exist in the file, they will be used as defaults.
   *   如果文件中存在 Atom Type Labels 段落，会作为默认映射使用。
   * - This mapping overrides file labels ONLY when it provides a meaningful element
   *   (i.e., not empty and not "E").
   *   仅当用户映射提供了“有意义”的元素符号（非空且不为 "E"）时，才覆盖文件中的标签。
   */
  lammpsTypeToElement?: Record<number, string>;

  /**
   * Sort atoms by id for stable rendering.
   *
   * 是否按 atom id 排序，用于保证渲染/动画更新的稳定性。
   */
  sortById?: boolean;
};

type AtomsStyle
  = | 'angle'
    | 'atomic'
    | 'body'
    | 'bond'
    | 'bpm/sphere'
    | 'charge'
    | 'dielectric'
    | 'dipole'
    | 'dpd'
    | 'edpd'
    | 'electron'
    | 'ellipsoid'
    | 'full'
    | 'line'
    | 'mdpd'
    | 'molecular'
    | 'peri'
    | 'rheo'
    | 'rheo/thermal'
    | 'smd'
    | 'sph'
    | 'sphere'
    | 'spin'
    | 'tdpd'
    | 'template'
    | 'tri'
    | 'hybrid'
    | 'unknown';

/**
 * Layout describes where "type" and xyz live in the CORE token list.
 * CORE means: line tokens with trailing image flags stripped (if present).
 *
 * Layout 用于描述在“核心 tokens（core tokens）”中，atom-type 与 xyz 的列位置。
 * core tokens 指：对每一行进行拆分后，如果末尾存在 image flags（ix iy iz），则先剥离它们。
 *
 * We do not attempt to parse every field. We only need:
 * - atom-ID (parts[0])
 * - atom-type (typeIdx)
 * - x y z (xyzStartIdx .. xyzStartIdx+2)
 *
 * 本解析器不尝试解析所有字段，只关心：
 * - atom-ID（parts[0]）
 * - atom-type（typeIdx 指定的列）
 * - x y z（从 xyzStartIdx 起连续三列）
 */
type AtomsLayout = {
  style: AtomsStyle;
  typeIdx: number; // atom-type index in core tokens / atom-type 在 core tokens 中的下标
  xyzStartIdx: number; // x index in core tokens / x 在 core tokens 中的下标（后续两列为 y,z）
  minCoreLen: number; // minimal core token length for safety / 安全起见的最小 core tokens 长度
};

/**
 * Atom Type Labels section:
 *
 * Atom Type Labels
 * 1 Si
 * 2 O
 *
 * Atom Type Labels 段落解析：返回 { 1: "Si", 2: "O" } 形式的映射。
 */
function parseAtomTypeLabels(lines: string[]): Record<number, string> {
  const map: Record<number, string> = {};

  let i = 0;
  while (i < lines.length) {
    const line = (lines[i] ?? '').trim();
    // Find section header / 查找段落头
    if (line.startsWith('Atom Type Labels')) break;
    i += 1;
  }
  if (i >= lines.length) return map;

  // Skip blank lines after header / 跳过段落头后的空行
  i += 1;
  while (i < lines.length && (lines[i] ?? '').trim() === '') i += 1;

  while (i < lines.length) {
    const raw = lines[i] ?? '';
    const line0 = raw.trim();

    // Blank line ends section / 空行表示段落结束
    if (!line0) break;

    // Next section starts (heuristic) / 下一个段落开始（启发式判断）
    if (/^[A-Za-z]/.test(line0) && !/^\d/.test(line0)) break;

    // Strip inline comments / 去掉行内注释
    const line = line0.split('#')[0]!.trim();
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

    // Remaining part is label / 剩余部分作为标签
    const label = parts.slice(1).join(' ').trim();
    if (label) map[typeId] = label;

    i += 1;
  }

  return map;
}

/**
 * Normalize element symbol; fallback to "E" (unknown element).
 *
 * 规范化元素符号；若无效则回退为 "E"（表示未知元素）。
 */
function safeElementSymbol(s: string): string {
  return normalizeElementSymbol(s) || 'E';
}

/**
 * Parse integer with fallback.
 *
 * 解析整数；失败则返回 fallback。
 */
function safeParseInt(s: string | undefined, fallback: number): number {
  const v = parseInt((s ?? '').trim(), 10);
  return Number.isFinite(v) ? v : fallback;
}

/**
 * Parse atom-type (typeId); fallback to 1 and clamp to positive.
 *
 * 解析 atom-type（typeId）；失败则回退为 1，并保证为正数。
 */
function safeTypeId(s: string | undefined): number {
  const v = safeParseInt(s, 1);
  return v > 0 ? v : 1;
}

/**
 * Heuristic check for image flags (ix iy iz).
 *
 * 判断 3 个数是否像 image flags（ix iy iz）的启发式规则：
 * - 必须是整数
 * - 绝对值通常很小（常见 -1/0/1，这里放宽到 <= 3）
 */
function looksLikeImageFlags(a: number, b: number, c: number): boolean {
  if (![a, b, c].every(Number.isFinite)) return false;
  if (![a, b, c].every(Number.isInteger)) return false;
  return Math.abs(a) <= 3 && Math.abs(b) <= 3 && Math.abs(c) <= 3;
}

/**
 * Split a tokenized Atoms line into:
 * - core tokens (used for layout indexing)
 * - whether trailing image flags exist
 *
 * 将 Atoms 行 tokens 拆分为：
 * - core：用于布局索引的核心 tokens（若末尾有 ix iy iz，则剥离）
 * - hasImageFlags：是否检测到末尾 image flags
 */
function splitCoreParts(parts: string[]): {
  core: string[];
  hasImageFlags: boolean;
} {
  // image flags appear as trailing 3 ints: ix iy iz
  // image flags 通常出现在行尾：ix iy iz（3 个整数）
  if (parts.length >= 8) {
    const a = Number(parts[parts.length - 3]);
    const b = Number(parts[parts.length - 2]);
    const c = Number(parts[parts.length - 1]);
    if (looksLikeImageFlags(a, b, c)) {
      return { core: parts.slice(0, -3), hasImageFlags: true };
    }
  }
  return { core: parts, hasImageFlags: false };
}

/**
 * Parse style from Atoms header:
 * - "Atoms"
 * - "Atoms # full"
 * - "Atoms # sphere"
 * - "Atoms # hybrid"
 *
 * We only trust the token right after '#'.
 *
 * 从 Atoms 段落头解析 atom_style（例如 "Atoms # full"）。
 * 注意：仅读取 '#' 后紧跟的那个 token 作为 style 名称；若无或不认识则返回 unknown。
 */
function parseAtomsStyleFromHeader(headerLine: string): AtomsStyle {
  const m = headerLine.trim().match(/^Atoms\s*#\s*([A-Za-z0-9_/.-]+)/);
  if (!m) return 'unknown';
  const s = (m[1] ?? '').trim().toLowerCase();

  // normalize a few possible separators (LAMMPS uses '/' in many names)
  // 这里暂不做额外规范化，直接使用 LAMMPS 常见的 '/' 风格名称
  const norm = s;

  const known: Set<string> = new Set([
    'angle',
    'atomic',
    'body',
    'bond',
    'bpm/sphere',
    'charge',
    'dielectric',
    'dipole',
    'dpd',
    'edpd',
    'electron',
    'ellipsoid',
    'full',
    'line',
    'mdpd',
    'molecular',
    'peri',
    'rheo',
    'rheo/thermal',
    'smd',
    'sph',
    'sphere',
    'spin',
    'tdpd',
    'template',
    'tri',
    'hybrid',
  ]);

  return known.has(norm) ? (norm as AtomsStyle) : 'unknown';
}

/**
 * Layout table derived from LAMMPS atom_style documentation.
 * Indices refer to CORE tokens (without ix/iy/iz).
 *
 * 由 LAMMPS atom_style 文档推导得到的布局表。
 * 说明：
 * - 表中下标均基于 core tokens（已剥离末尾 ix iy iz）
 * - 本解析器只关心 typeIdx 与 xyzStartIdx
 * - 其它字段（如 q, density, radius 等）不在此解析范围内
 *
 * Per doc list (examples) / 文档示例：
 * - angle/bond/molecular: id mol type x y z
 * - atomic: id type x y z
 * - charge: id type q x y z
 * - full: id mol type q x y z
 * - Many others insert extra fields before xyz.
 *   其他 style 往往在 xyz 前插入额外字段，因此 xyzStartIdx 不同。
 */
const STYLE_LAYOUT: Record<string, AtomsLayout> = {
  'angle': { style: 'angle', typeIdx: 2, xyzStartIdx: 3, minCoreLen: 6 }, // id mol type x y z
  'bond': { style: 'bond', typeIdx: 2, xyzStartIdx: 3, minCoreLen: 6 }, // id mol type x y z
  'molecular': { style: 'molecular', typeIdx: 2, xyzStartIdx: 3, minCoreLen: 6 }, // id mol type x y z

  'atomic': { style: 'atomic', typeIdx: 1, xyzStartIdx: 2, minCoreLen: 5 }, // id type x y z
  'charge': { style: 'charge', typeIdx: 1, xyzStartIdx: 3, minCoreLen: 6 }, // id type q x y z
  'full': { style: 'full', typeIdx: 2, xyzStartIdx: 4, minCoreLen: 7 }, // id mol type q x y z

  'body': { style: 'body', typeIdx: 1, xyzStartIdx: 4, minCoreLen: 7 }, // id type bodyflag mass x y z

  'bpm/sphere': {
    style: 'bpm/sphere',
    typeIdx: 2,
    xyzStartIdx: 5,
    minCoreLen: 8,
  }, // id mol type diameter density x y z
  'sphere': { style: 'sphere', typeIdx: 1, xyzStartIdx: 4, minCoreLen: 7 }, // id type diameter density x y z
  'peri': { style: 'peri', typeIdx: 1, xyzStartIdx: 4, minCoreLen: 7 }, // id type volume density x y z
  'ellipsoid': { style: 'ellipsoid', typeIdx: 1, xyzStartIdx: 4, minCoreLen: 7 }, // id type ellipsoidflag density x y z
  'line': { style: 'line', typeIdx: 2, xyzStartIdx: 5, minCoreLen: 8 }, // id mol type lineflag density x y z
  'tri': { style: 'tri', typeIdx: 2, xyzStartIdx: 5, minCoreLen: 8 }, // id mol type triangleflag density x y z

  'dipole': { style: 'dipole', typeIdx: 1, xyzStartIdx: 3, minCoreLen: 9 }, // id type q x y z mux muy muz
  'dielectric': {
    style: 'dielectric',
    typeIdx: 1,
    xyzStartIdx: 3,
    minCoreLen: 16,
  }, // id type q x y z mux muy muz area ed em epsilon curvature

  'dpd': { style: 'dpd', typeIdx: 1, xyzStartIdx: 3, minCoreLen: 6 }, // id type theta x y z
  'mdpd': { style: 'mdpd', typeIdx: 1, xyzStartIdx: 3, minCoreLen: 6 }, // id type rho x y z
  'edpd': { style: 'edpd', typeIdx: 1, xyzStartIdx: 3, minCoreLen: 7 }, // id type edpd_temp edpd_cv x y z
  'electron': { style: 'electron', typeIdx: 1, xyzStartIdx: 5, minCoreLen: 8 }, // id type q espin eradius x y z

  'rheo': { style: 'rheo', typeIdx: 1, xyzStartIdx: 4, minCoreLen: 7 }, // id type status rho x y z
  'rheo/thermal': {
    style: 'rheo/thermal',
    typeIdx: 1,
    xyzStartIdx: 5,
    minCoreLen: 8,
  }, // id type status rho energy x y z

  'sph': { style: 'sph', typeIdx: 1, xyzStartIdx: 4, minCoreLen: 8 }, // id type rho esph cv x y z
  'spin': { style: 'spin', typeIdx: 1, xyzStartIdx: 2, minCoreLen: 9 }, // id type x y z spx spy spz sp  (xyz at 2)
  'tdpd': { style: 'tdpd', typeIdx: 1, xyzStartIdx: 2, minCoreLen: 6 }, // id type x y z cc1 ...
  'template': { style: 'template', typeIdx: 1, xyzStartIdx: 5, minCoreLen: 8 }, // id type molecule-ID template-index template-atom x y z
  'smd': { style: 'smd', typeIdx: 1, xyzStartIdx: 11, minCoreLen: 14 }, // id type molecule volume mass kradius cradius x0 y0 z0 x y z

  'hybrid': { style: 'hybrid', typeIdx: 1, xyzStartIdx: 2, minCoreLen: 5 }, // id type x y z sub-style...
};

/**
 * Fallback inference if header has no style hint.
 * Only covers the most common ones.
 *
 * 当 Atoms 段落头没有提供可识别的 style 时，使用启发式推断布局：
 * - core.length >= 7：默认按 full 处理（常见且字段较全）
 * - core.length == 6：根据第 3 个 token 是否为“非整数浮点数”区分 charge / molecular
 * - 其他：按 atomic 处理
 *
 * 注意：该推断仅对常见的 atomic/molecular/charge/full 相对可靠，
 *      对更复杂的 style（例如 body/sphere/dielectric 等）应尽量依赖 header 的 style。
 */
function inferLayoutFromCore(core: string[]): AtomsLayout {
  // try to distinguish full/charge/molecular/atomic using minimal heuristics
  if (core.length >= 7) {
    // could be full or others; without header we assume "full" as safest among common
    // 可能是 full 或其他更复杂 style；在无 header 的情况下，先按最常见的 full 解析
    return STYLE_LAYOUT.full!;
  }
  if (core.length === 6) {
    const third = Number(core[2]);
    // charge: id type q x y z -> core[2] is q (often non-integer)
    // charge: 第 3 个 token 是 q，通常是非整数浮点数
    if (Number.isFinite(third) && !Number.isInteger(third))
      return STYLE_LAYOUT.charge!;
    // molecular: id mol type x y z
    // molecular: id mol type x y z
    return STYLE_LAYOUT.molecular!;
  }
  return STYLE_LAYOUT.atomic!;
}

export function parseLammpsData(
  text: string,
  fileName: string,
  options: ParseLammpsDataOptions = {},
): StructureModel {
  const lines = text.split(/\r?\n/);
  const atoms: Atom[] = [];

  // 1) Parse Atom Type Labels
  // 解析 Atom Type Labels（如果存在），用于 typeId -> element 的默认映射
  const fileTypeLabels = parseAtomTypeLabels(lines);

  // 2) Merge mapping: file labels first; user map overrides only when meaningful
  // 合并映射：先用文件标签，再用用户映射；仅当用户映射是“有效元素符号”时才覆盖
  const typeToEl: Record<number, string> = { ...fileTypeLabels };
  const userMap = options.lammpsTypeToElement ?? {};
  for (const [k, v] of Object.entries(userMap)) {
    const typeId = Number(k);
    if (!Number.isFinite(typeId) || typeId <= 0) continue;

    const el = safeElementSymbol(String(v ?? ''));
    if (!el || el === 'E') continue; // do not override with placeholder / 不用占位符覆盖真实标签
    typeToEl[typeId] = el;
  }

  // 3) Find Atoms section header
  // 查找 Atoms 段落头（支持 "Atoms" / "Atoms # full" 等）
  let i = 0;
  let atomsHeaderLine = '';
  while (i < lines.length) {
    const line = (lines[i] ?? '').trim();
    if (line.startsWith('Atoms')) {
      atomsHeaderLine = line;
      break;
    }
    i += 1;
  }
  if (i >= lines.length) {
    throw new Error(t('errors.lammpsData.missingAtomsSection', { fileName }));
  }

  // 解析段落头中的 style，并据此选择布局（若 unknown 则后续启发式推断）
  const style = parseAtomsStyleFromHeader(atomsHeaderLine);
  const headerLayout = STYLE_LAYOUT[style] ?? null;

  // skip blank lines after header / 跳过段落头后的空行
  i += 1;
  while (i < lines.length && (lines[i] ?? '').trim() === '') i += 1;

  // 4) Parse Atoms lines
  // 解析 Atoms 段落的每一行，直到遇到空行或下一个段落
  while (i < lines.length) {
    const raw = lines[i] ?? '';
    const line0 = raw.trim();

    // blank line ends section / 空行表示 Atoms 段落结束
    if (!line0) break;

    // next section starts (heuristic) / 下一个段落开始（启发式判断）
    if (/^[A-Za-z]/.test(line0) && !/^\d/.test(line0)) break;

    // strip inline comments / 去掉行内注释（# 后内容）
    const line = line0.split('#')[0]!.trim();
    if (!line) {
      i += 1;
      continue;
    }

    const parts = line.split(/\s+/);
    if (parts.length < 5) {
      i += 1;
      continue;
    }

    // atom-ID is always first / atom-ID 总是第 1 列
    const id = safeParseInt(parts[0], NaN);
    if (!Number.isFinite(id)) {
      i += 1;
      continue;
    }

    // split into core tokens (remove ix iy iz if present)
    // 获取 core tokens：若行尾有 ix iy iz，则剥离，避免影响布局索引
    const { core } = splitCoreParts(parts);
    if (core.length < 5) {
      i += 1;
      continue;
    }

    // choose layout: header style first, else infer
    // 布局优先级：优先使用 header 中解析到的 style；否则使用启发式推断
    const layout = headerLayout ?? inferLayoutFromCore(core);

    // safety: must have at least xyz / 必须至少能读到 xyz 三列
    if (core.length < layout.xyzStartIdx + 3) {
      i += 1;
      continue;
    }

    // typeId / atom-type
    const typeId = safeTypeId(core[layout.typeIdx]);

    // xyz
    const x = Number(core[layout.xyzStartIdx]);
    const y = Number(core[layout.xyzStartIdx + 1]);
    const z = Number(core[layout.xyzStartIdx + 2]);
    if (![x, y, z].every(Number.isFinite)) {
      i += 1;
      continue;
    }

    // map typeId -> element; fallback to "E"
    // 将 typeId 映射为元素符号；若无映射则回退为 "E"
    const element = safeElementSymbol(String(typeToEl[typeId] ?? 'E'));

    atoms.push({
      id,
      typeId,
      element,
      position: [x, y, z],
    });

    i += 1;
  }

  // optional stable sort / 可选：按 id 排序以保证稳定性
  if (options.sortById) {
    atoms.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
  }

  const model: StructureModel = {
    atoms,
    frames: [atoms],
    source: { filename: fileName, format: 'lammpsdata' },
  };

  return model;
}

/**
 * Check whether a format string indicates LAMMPS data-like data.
 *
 * 判断 format 字符串是否表示 LAMMPS data 格式。
 */
export function isLammpsDataFormat(fmt: string): boolean {
  return ['data', 'lammpsdata'].includes(fmt);
}
