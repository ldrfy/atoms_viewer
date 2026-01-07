// lib/structure/parsers/common.ts
import type { Atom, Vec3 } from '../types';

/**
 * Create a normalized Atom shape used across parsers.
 * 创建统一结构的 Atom，避免解析器输出不一致。
 *
 * Args / 参数：
 *   element: 元素符号（如 "C","O","Fe"）
 *   x: x 坐标
 *   y: y 坐标
 *   z: z 坐标
 *
 * Returns / 返回：
 *   Atom: { element, position: [x,y,z] }
 */
export function makeAtom(
  element: string,
  x: number,
  y: number,
  z: number,
): Atom {
  const position: Vec3 = [x, y, z];
  return { element, position };
}
