import type { Atom, StructureModel } from '../types';
import { parseMol } from './mol';

export function parseSdf(text: string): StructureModel {
  // Split by SDF record terminator "$$$$".
  // 使用 SDF 记录分隔符 "$$$$" 拆分。
  const blocks = text
    .split(/\$\$\$\$/g)
    .map(b => b.trim())
    .filter(b => b.length > 0);

  if (blocks.length === 0) {
    throw new Error('SDF 格式解析失败：内容为空');
  }

  const models: StructureModel[] = [];
  const comments: string[] = [];
  for (const block of blocks) {
    try {
      // Each block is a MOL record; reuse MOL parser.
      // 每个块就是一个 MOL 记录，复用 MOL 解析器。
      const m = parseMol(block);
      models.push(m);
      comments.push(m.comment ?? '');
    }
    catch {
      // ignore invalid block
    }
  }

  if (models.length === 0) {
    throw new Error('SDF 格式解析失败：未找到有效分子');
  }

  const atoms0 = models[0]!.atoms;
  const sameCount = models.every(m => m.atoms.length === atoms0.length);

  // If atom counts match, treat as multi-frame trajectory.
  // 原子数一致时，作为多帧轨迹处理。
  const frames: Atom[][] = sameCount
    ? models.map(m => m.atoms)
    : [atoms0];

  return {
    atoms: atoms0,
    frames,
    comment: comments[0] || undefined,
    frameMeta: comments.map(c => ({ comment: c || undefined })),
  };
}
