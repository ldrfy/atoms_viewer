// src/lib/structure/bondSegments.ts
import type { Atom } from './types';
import { getCovalentRadiusAng } from './chem';
import { computeBonds } from './bonds';

export type BondSegment2 = {
  colorKey: string;
  p1: Atom['position'];
  p2: Atom['position'];
};

export type BondGroups2 = Map<
  string,
  Array<{ p1: Atom['position']; p2: Atom['position'] }>
>;

export type BicolorBondGroupsResult = {
  groups: BondGroups2;
  bondCount: number;
  segCount: number;
  /** Map group key -> element (used for default coloring). */
  keyToElement: Record<string, string>;
};

type BuildBicolorBondGroupsOptions = {
  bondFactor?: number;
  atomSizeFactor?: number; // 对应你 ViewerStage 里的 ATOM_SIZE_FACTOR
  /** Optional grouping key. Defaults to element. */
  getColorKey?: (atom: Atom) => string;
};

/**
 * Build bicolor bond segments grouped by element (data-only, no THREE).
 * 构建“双色键”分段并按元素分组（纯结构计算，不依赖 THREE）。
 *
 * Rules / 规则：
 * - Split each bond (i,j) into two segments: i->mid (color=i), mid->j (color=j)
 * - The mid position uses the same radius-weighted formula as ViewerStage
 */
export function buildBicolorBondGroups(
  atoms: Atom[],
  opts: BuildBicolorBondGroupsOptions = {},
): BicolorBondGroupsResult {
  const bondFactor = opts.bondFactor ?? 1.05;
  const atomSizeFactor = opts.atomSizeFactor ?? 0.5;
  const getColorKey = opts.getColorKey;

  const bonds = computeBonds(atoms, bondFactor);
  const groups: BondGroups2 = new Map();
  const keyToElement: Record<string, string> = {};

  let segCount = 0;

  for (let k = 0; k < bonds.length; k += 1) {
    const b = bonds[k]!;
    const ai = atoms[b.i]!;
    const aj = atoms[b.j]!;

    const d = b.length;
    if (d < 1.0e-9) continue;

    // 与 useViewerStage.getSphereRadiusByElement 一致：base 半径（不含 atomScale）
    const ri = atomSizeFactor * getCovalentRadiusAng(ai.element);
    const rj = atomSizeFactor * getCovalentRadiusAng(aj.element);

    const rat = (0.5 * (rj - ri)) / d;
    const alpha = 0.5 + rat;
    const beta = 0.5 - rat;

    const pi = ai.position;
    const pj = aj.position;

    const mid: Atom['position'] = [
      pi[0] * alpha + pj[0] * beta,
      pi[1] * alpha + pj[1] * beta,
      pi[2] * alpha + pj[2] * beta,
    ];

    // i -> mid
    {
      const key = (getColorKey ? getColorKey(ai) : ai.element) || ai.element;
      keyToElement[key] = ai.element;
      pushGroup(groups, key, pi, mid);
    }
    // mid -> j
    {
      const key = (getColorKey ? getColorKey(aj) : aj.element) || aj.element;
      keyToElement[key] = aj.element;
      pushGroup(groups, key, mid, pj);
    }

    segCount += 2;
  }

  return { groups, bondCount: bonds.length, segCount, keyToElement };
}

function pushGroup(
  groups: BondGroups2,
  colorKey: string,
  p1: Atom['position'],
  p2: Atom['position'],
): void {
  const arr = groups.get(colorKey);
  if (arr) {
    arr.push({ p1, p2 });
  }
  else {
    groups.set(colorKey, [{ p1, p2 }]);
  }
}
