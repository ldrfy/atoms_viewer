// lib/structure/parsers/common.ts
import type { Atom, Vec3 } from '../types';

/**
 * 创建 Atom，统一输出字段结构，避免不同解析器字段不一致导致渲染期报错。
 *
 * Args:
 *   element: 元素符号（如 "C","O","Fe"）
 *   x: x 坐标
 *   y: y 坐标
 *   z: z 坐标
 *
 * Returns:
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
