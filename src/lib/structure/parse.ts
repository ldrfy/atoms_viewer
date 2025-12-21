// lib/structure/parse.ts
import type { StructureModel } from "./types";
import { parseXyz } from "./parsers/xyz";
import { parsePdb } from "./parsers/pdb";

function getExt(filename?: string): string {
  const name = (filename ?? "").toLowerCase();
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1) : "";
}

function parseBySniff(text: string): StructureModel {
  // 1) PDB：出现 ATOM/HETATM
  if (/\n(?:ATOM  |HETATM)/.test("\n" + text)) return parsePdb(text);

  // 3) XYZ：第一行是整数原子数（很常见）
  const firstLine = (text.split(/\r?\n/, 1)[0] ?? "").trim();
  if (/^\d+$/.test(firstLine)) return parseXyz(text);

  throw new Error("error");
}

export function parseStructure(
  text: string,
  filename?: string
): StructureModel {
  const ext = getExt(filename);

  switch (ext) {
    case "xyz":
      return parseXyz(text);
    case "pdb":
      return parsePdb(text);
    default:
      return parseBySniff(text);
  }
}

export async function loadStructureFromFile(
  file: File
): Promise<StructureModel> {
  const text = await file.text();
  return parseStructure(text, file.name);
}
