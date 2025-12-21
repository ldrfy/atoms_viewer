// src/lib/structure/parse.ts
import type { StructureModel } from "./types";
import { parseXyz } from "./parsers/xyz";
import { parsePdb } from "./parsers/pdb";
import { parseLammpsDump } from "./parsers/lammpsDump";

export type StructureParseOptions = {
  lammpsTypeToElement?: Record<number, string>;
  lammpsSortById?: boolean;
};

export function parseStructure(
  text: string,
  filename?: string,
  opts?: StructureParseOptions
): StructureModel {
  const ext = getExt(filename);
  let model: StructureModel;

  switch (ext) {
    case "xyz":
      model = parseXyz(text);
      break;
    case "pdb":
      model = parsePdb(text);
      break;
    case "dump":
    case "lammpstrj":
    case "traj":
      model = parseLammpsDump(text, {
        typeToElement: opts?.lammpsTypeToElement,
        sortById: opts?.lammpsSortById ?? true,
      });
      break;
    default:
      // 嗅探兜底：用户扩展名不对也能识别
      if (text.includes("ITEM: TIMESTEP")) {
        model = parseLammpsDump(text, {
          typeToElement: opts?.lammpsTypeToElement,
          sortById: opts?.lammpsSortById ?? true,
        });
        break;
      }
      throw new Error(`不支持的格式: ${ext || "unknown"}`);
  }

  if (!model.frames || model.frames.length === 0) {
    model.frames = [model.atoms];
  }

  model.source = {
    filename: filename ?? "unknown",
    format: ext || (text.includes("ITEM: TIMESTEP") ? "lammpsdump" : "unknown"),
  };

  return model;
}

export async function loadStructureFromFile(
  file: File,
  opts?: StructureParseOptions
): Promise<StructureModel> {
  const text = await file.text();
  return parseStructure(text, file.name, opts);
}

function getExt(filename?: string): string {
  const name = (filename ?? "").toLowerCase();
  const p = name.lastIndexOf(".");
  return p >= 0 ? name.slice(p + 1) : "";
}
