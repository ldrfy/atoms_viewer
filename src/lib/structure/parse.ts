// src/lib/structure/parse.ts
import type { StructureModel } from "./types";
import { parseXyz } from "./parsers/xyz";
import { parsePdb } from "./parsers/pdb";
import { parseLammpsDump } from "./parsers/lammpsDump";
import { parseLammpsData } from "./parsers/lammpsData";

export type StructureParseOptions = {
  /**
   * LAMMPS typeId -> element 映射。
   *
   * LAMMPS typeId -> element mapping.
   */
  lammpsTypeToElement?: Record<number, string>;

  /**
   * 是否按 id 排序（用于稳定帧/稳定显示）。
   *
   * Sort atoms by id for stable rendering.
   */
  lammpsSortById?: boolean;
};

/**
 * 解析结构文本（XYZ / PDB / LAMMPS dump / LAMMPS data）。
 *
 * Parse structure text (XYZ / PDB / LAMMPS dump / LAMMPS data).
 */
export function parseStructure(
  text: string,
  filename?: string,
  opts?: StructureParseOptions
): StructureModel {
  const ext = getExt(filename);
  const { format, extNormalized } = detectFormat(text, ext);

  let model: StructureModel;

  switch (format) {
    case "xyz":
      model = parseXyz(text);
      break;

    case "pdb":
      model = parsePdb(text);
      break;

    case "dump":
    case "lammpstrj":
    case "traj":
    case "lammpsdump":
      model = parseLammpsDump(text, {
        typeToElement: opts?.lammpsTypeToElement,
        sortById: opts?.lammpsSortById ?? true,
      });
      break;

    case "data":
    case "lammpsdata":
      // 注意：read_data 的 data 文件通常是单帧
      // NOTE: LAMMPS data (read_data) is typically single-frame
      model = parseLammpsData(text, filename ?? "unknown", {
        lammpsTypeToElement: opts?.lammpsTypeToElement,
        sortById: opts?.lammpsSortById ?? true,
      });
      break;

    default:
      throw new Error(`不支持的格式: ${extNormalized || "unknown"}`);
  }

  // 兜底：保证 frames 至少有一帧
  // Fallback: ensure there is at least one frame
  if (!model.frames || model.frames.length === 0) {
    model.frames = [model.atoms];
  }

  // 统一写入 source 信息：format 使用“归一化格式”，不要直接用扩展名
  // Set source info: use normalized format instead of raw extension
  model.source = {
    filename: filename ?? "unknown",
    format,
  };

  return model;
}

/**
 * 从 File 读取并解析。
 *
 * Read from File and parse.
 */
export async function loadStructureFromFile(
  file: File,
  opts?: StructureParseOptions
): Promise<StructureModel> {
  const text = await file.text();
  return parseStructure(text, file.name, opts);
}

/**
 * 提取文件扩展名（不含点），小写。
 *
 * Extract file extension (without dot), lowercased.
 */
function getExt(filename?: string): string {
  const name = (filename ?? "").toLowerCase();
  const p = name.lastIndexOf(".");
  return p >= 0 ? name.slice(p + 1) : "";
}

/**
 * 根据扩展名 + 内容嗅探，返回归一化格式。
 *
 * Detect format by extension + content sniffing, returning normalized format.
 *
 * Returns:
 * - format: "xyz" | "pdb" | "dump" | "lammpstrj" | "traj" | "lammpsdump" | "data" | "unknown"
 * - extNormalized: 用于报错展示的扩展名（unknown 时用）
 */
function detectFormat(
  text: string,
  ext: string
): { format: string; extNormalized: string } {
  const extNormalized = ext || "";

  // 1) 扩展名优先 / Extension first
  switch (extNormalized) {
    case "xyz":
      return { format: "xyz", extNormalized };
    case "pdb":
      return { format: "pdb", extNormalized };

    case "dump":
    case "lammpstrj":
    case "traj":
      return { format: extNormalized, extNormalized };

    // read_data 常见扩展名 / Common read_data extensions
    case "data":
    case "lammpsdata":
      return { format: "lammpsdata", extNormalized };

    default:
      break;
  }

  // 2) 嗅探兜底 / Sniffing fallback

  // LAMMPS dump 特征：ITEM: TIMESTEP
  // LAMMPS dump signature: ITEM: TIMESTEP
  if (text.includes("ITEM: TIMESTEP")) {
    return { format: "lammpsdump", extNormalized };
  }

  // LAMMPS data 特征：存在 Atoms 段（且不是 dump）
  // LAMMPS data signature: has an "Atoms" section (and not a dump)
  if (isLikelyLammpsData(text)) {
    return { format: "lammpsdata", extNormalized };
  }

  return { format: "unknown", extNormalized };
}

/**
 * 粗略判断文本是否像 LAMMPS data（read_data）。
 *
 * Heuristically detect whether text looks like a LAMMPS data (read_data) file.
 *
 * 规则 / Rules:
 * - 排除 dump：没有 ITEM: TIMESTEP
 * - 存在独立行的 "Atoms"（允许 "Atoms # full" 等）
 */
function isLikelyLammpsData(text: string): boolean {
  if (text.includes("ITEM: TIMESTEP")) return false;

  // 用行级正则提高准确性
  // Line-level regex for better precision
  const re = /^\s*Atoms(\s*#.*)?\s*$/m;
  return re.test(text);
}

export type ParseMode = "auto" | "xyz" | "pdb" | "lammpsdump" | "lammpsdata";

export type ParseInfo = {
  fileName: string;
  format: string;
  atomCount: number;
  frameCount: number;
  success: boolean;
  errorMsg: string;
  errorSeq: number;
};

function stripExt(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(0, i) : name;
}
export function toForcedFilename(
  originalName: string,
  mode: ParseMode
): string {
  if (mode === "auto") return originalName;

  const base = stripExt(originalName);
  // 通过“伪造扩展名”强制 parseStructure 走对应 parser
  // Force parser by a fake extension
  const ext = (() => {
    if (mode === "lammpsdump") return "dump";
    if (mode === "lammpsdata") return "data";
    return mode; // xyz/pdb
  })();

  return `${base}.__force__.${ext}`;
}
