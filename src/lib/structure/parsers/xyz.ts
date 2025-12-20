import type { Atom, StructureModel } from "../types";

function normalizeLines(text: string): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

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
    const line = lines[i];
    if (!line) {
      // 理论上不会发生，但用于满足 TS 严格检查
      throw new Error(`第 ${i + 1} 行缺失。`);
    }

    const parts = line.split(/\s+/);
    const element = parts[0];
    const xStr = parts[1];
    const yStr = parts[2];
    const zStr = parts[3];

    if (!element || !xStr || !yStr || !zStr) {
      throw new Error(`第 ${i + 1} 行格式错误：${line}`);
    }

    const x = Number(xStr);
    const y = Number(yStr);
    const z = Number(zStr);

    if (![x, y, z].every((v) => Number.isFinite(v))) {
      throw new Error(`第 ${i + 1} 行坐标不可解析：${line}`);
    }

    atoms.push({ element, position: [x, y, z] });
  }

  return { atoms, comment };
}
