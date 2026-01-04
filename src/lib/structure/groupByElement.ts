import type { Atom } from './types';

/** 按元素将原子索引分组（纯结构逻辑，不依赖 THREE）。 */
export function groupAtomIndicesByElement(
  atoms: Atom[],
): Map<string, number[]> {
  const elementToIndices = new Map<string, number[]>();

  for (let i = 0; i < atoms.length; i += 1) {
    const a = atoms[i];
    if (!a) continue;

    const el = a.element;
    const arr = elementToIndices.get(el);
    if (arr) arr.push(i);
    else elementToIndices.set(el, [i]);
  }

  return elementToIndices;
}
