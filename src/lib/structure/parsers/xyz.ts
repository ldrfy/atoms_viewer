import type { Atom, StructureModel } from "../types";

function normalizeLines(text: string): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * 解析 XYZ 第一帧：
 * 1) 第 1 行：原子数 N
 * 2) 第 2 行：comment
 * 3) 后续 N 行：Element x y z（多余列忽略）
 */
export function parseXyz(text: string): StructureModel {
  const lines = normalizeLines(text);
  if (lines.length < 2) {
    throw new Error("XYZ 内容过短，至少需要两行（N 与 comment）。");
  }

  const atomCount = Number(lines[0]);
  if (!Number.isFinite(atomCount) || atomCount <= 0) {
    throw new Error(`XYZ 第一行原子数无效：${lines[0]}`);
  }

  const comment = lines[1] ?? "";
  const start = 2;
  const end = start + atomCount;

  if (lines.length < end) {
    throw new Error(
      `XYZ 原子行不足：需要 ${atomCount} 行，但实际只有 ${Math.max(
        0,
        lines.length - 2
      )} 行。`
    );
  }

  const atoms: Atom[] = [];
  for (let i = start; i < end; i += 1) {
    const parts = lines[i].split(/\s+/);
    if (parts.length < 4) {
      throw new Error(`第 ${i + 1} 行格式错误：${lines[i]}`);
    }

    const element = parts[0];
    const x = Number(parts[1]);
    const y = Number(parts[2]);
    const z = Number(parts[3]);

    if (![x, y, z].every((v) => Number.isFinite(v))) {
      throw new Error(`第 ${i + 1} 行坐标不可解析：${lines[i]}`);
    }

    atoms.push({ element, position: [x, y, z] });
  }

  return { atoms, comment };
}
