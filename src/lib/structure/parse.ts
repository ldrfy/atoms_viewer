import type { StructureModel } from "./types";
import { parseXyz } from "./parsers/xyz";
import { parsePdb } from "./parsers/pdb";

export function parseStructure(
  text: string,
  filename?: string
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
    default:
      // 你现在先只支持 xyz/pdb，其他就 throw
      throw new Error(`不支持的格式: ${ext || "unknown"}`);
  }

  if (!model.frames || model.frames.length === 0) {
    model.frames = [model.atoms];
  }

  model.source = {
    filename: filename ?? "unknown",
    format: ext || "unknown",
  };

  return model;
}

function getExt(filename?: string): string {
  const name = (filename ?? "").toLowerCase();
  const p = name.lastIndexOf(".");
  return p >= 0 ? name.slice(p + 1) : "";
}

export async function loadStructureFromFile(
  file: File
): Promise<StructureModel> {
  const text = await file.text();
  return parseStructure(text, file.name);
}
