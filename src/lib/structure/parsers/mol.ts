import type { StructureModel } from '../types';
import { makeAtom } from './common';

export function parseMol(text: string): StructureModel {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  if (lines.length < 4) {
    throw new Error('MOL 格式解析失败：内容过短');
  }
  const name = (lines[0] ?? '').trim();
  const program = (lines[1] ?? '').trim();
  const commentLine = (lines[2] ?? '').trim();
  const commentParts = [name, commentLine || program].filter(v => v);
  const comment = commentParts.join(' · ');

  const countsLine = lines[3] ?? '';
  let atomCount = parseInt(countsLine.slice(0, 3).trim(), 10);
  if (!Number.isFinite(atomCount) || atomCount <= 0) {
    // MOL counts line fallback: split by whitespace.
    // MOL 计数行兜底：按空白拆分解析。
    const parts = countsLine.trim().split(/\s+/);
    atomCount = Number.parseInt(parts[0] ?? '0', 10);
  }
  if (!Number.isFinite(atomCount) || atomCount <= 0) {
    throw new Error('MOL 格式解析失败：原子数量无效');
  }

  const atoms = new Array(atomCount);
  for (let i = 0; i < atomCount; i += 1) {
    const line = lines[4 + i] ?? '';
    // V2000 fixed columns: x/y/z and element.
    // V2000 固定列：x/y/z 与元素符号。
    let x = Number.parseFloat(line.slice(0, 10).trim());
    let y = Number.parseFloat(line.slice(10, 20).trim());
    let z = Number.parseFloat(line.slice(20, 30).trim());
    let element = line.slice(31, 34).trim();

    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z) || !element) {
      // Whitespace fallback for non-standard MOL lines.
      // 非标准 MOL 行的空白分隔兜底解析。
      const parts = line.trim().split(/\s+/);
      x = Number.parseFloat(parts[0] ?? '0');
      y = Number.parseFloat(parts[1] ?? '0');
      z = Number.parseFloat(parts[2] ?? '0');
      element = (parts[3] ?? 'X').trim();
    }

    atoms[i] = makeAtom(element || 'X', Number.isFinite(x) ? x : 0, Number.isFinite(y) ? y : 0, Number.isFinite(z) ? z : 0);
  }

  return {
    atoms,
    frames: [atoms],
    comment: comment || undefined,
    frameMeta: comment ? [{ comment }] : undefined,
  };
}
