import type { StructureModel } from "./types";
import { parseXyz } from "./parsers/xyz";

function getExtLower(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx >= 0 ? filename.slice(idx + 1).toLowerCase() : "";
}

export function parseStructure(text: string, filename: string): StructureModel {
  const ext = getExtLower(filename);

  if (ext === "xyz") {
    const model = parseXyz(text);
    model.source = { filename, format: "xyz" };
    return model;
  }

  throw new Error(`不支持的文件类型：${filename}`);
}

export async function loadStructureFromFile(
  file: File
): Promise<StructureModel> {
  const text = await file.text();
  return parseStructure(text, file.name);
}
