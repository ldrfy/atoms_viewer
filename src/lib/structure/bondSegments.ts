// src/lib/structure/bondSegments.ts
import type { Atom } from "./types";
import { getCovalentRadiusAng } from "./chem";
import { computeBonds } from "./bonds";

export type BondSegment2 = {
  colorKey: string;
  p1: Atom["position"];
  p2: Atom["position"];
};

export type BondGroups2 = Map<
  string,
  Array<{ p1: Atom["position"]; p2: Atom["position"] }>
>;

export type BicolorBondGroupsResult = {
  groups: BondGroups2;
  bondCount: number;
  segCount: number;
};

type BuildBicolorBondGroupsOptions = {
  bondFactor?: number;
  atomSizeFactor?: number; // 对应你 ViewerStage 里的 ATOM_SIZE_FACTOR
};

/**
 * 构建“双色键”分段，并按元素分组（纯结构计算，不依赖 THREE）。
 *
 * 规则：
 * - 每条 bond (i,j) 拆成两段：i->mid（颜色=元素i），mid->j（颜色=元素j）
 * - mid 的位置采用与你当前 ViewerStage 一致的半径权重公式
 */
export function buildBicolorBondGroups(
  atoms: Atom[],
  opts: BuildBicolorBondGroupsOptions = {}
): BicolorBondGroupsResult {
  const bondFactor = opts.bondFactor ?? 1.05;
  const atomSizeFactor = opts.atomSizeFactor ?? 0.5;

  const bonds = computeBonds(atoms, bondFactor);
  const groups: BondGroups2 = new Map();

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

    const mid: Atom["position"] = [
      pi[0] * alpha + pj[0] * beta,
      pi[1] * alpha + pj[1] * beta,
      pi[2] * alpha + pj[2] * beta,
    ];

    // i -> mid
    pushGroup(groups, ai.element, pi, mid);
    // mid -> j
    pushGroup(groups, aj.element, mid, pj);

    segCount += 2;
  }

  return { groups, bondCount: bonds.length, segCount };
}

function pushGroup(
  groups: BondGroups2,
  element: string,
  p1: Atom["position"],
  p2: Atom["position"]
): void {
  const arr = groups.get(element);
  if (arr) {
    arr.push({ p1, p2 });
  } else {
    groups.set(element, [{ p1, p2 }]);
  }
}
