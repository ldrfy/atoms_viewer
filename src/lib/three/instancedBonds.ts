import * as THREE from 'three';
import type { Atom } from '../structure/types';
import { getCovalentRadiusAng, getElementColorHex } from '../structure/chem';
import { computeBonds } from '../structure/bonds';

/**
 * 键合渲染构建结果（InstancedMesh 列表 + 段数）。
 *
 * Bond rendering build result (InstancedMesh list + segment count).
 */
export type BondBuildResult = {
  meshes: THREE.InstancedMesh[];
  segCount: number;
};

type BondSeg = {
  p1: Atom['position'];
  p2: Atom['position'];
  colorKey: string;
  el: string;
};

/**
 * 构建双色键合（按元素分组上色），返回 InstancedMesh 列表。
 *
 * Build bicolor bonds (colored by element groups) and return InstancedMesh list.
 *
 * @param params - 构建参数 / Build parameters
 * @param params.atoms - 原子列表 / Atom list
 * @param params.bondFactor - 键长阈值系数 / Bond cutoff factor
 * @param params.atomSizeFactor - 原子半径缩放系数（参与键阈值） / Atom size factor (used in cutoff)
 * @param params.bondRadius - 圆柱半径 / Cylinder radius
 * @returns 构建结果 / Build result
 */
export function buildBondMeshesBicolor(params: {
  atoms: Atom[];
  bondFactor: number;
  atomSizeFactor: number;
  bondRadius: number;
  /** Optional grouping key. Defaults to element. */
  getColorKey?: (atom: Atom) => string;
  /** Optional color map keyed by getColorKey result. */
  colorMap?: Record<string, string>;
}): BondBuildResult {
  const { atoms, bondFactor, atomSizeFactor, bondRadius, getColorKey, colorMap } = params;

  // Build segments and group by *element* to keep draw calls bounded, while still
  // supporting typeId-based colors via per-instance instanceColor.
  const groups = new Map<string, BondSeg[]>();

  const bonds = computeBonds(atoms, bondFactor);
  let segCount = 0;

  for (let k = 0; k < bonds.length; k += 1) {
    const b = bonds[k]!;
    const ai = atoms[b.i]!;
    const aj = atoms[b.j]!;

    const d = b.length;
    if (d < 1.0e-9) continue;

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

    const keyI = (getColorKey ? getColorKey(ai) : ai.element) || ai.element;
    const keyJ = (getColorKey ? getColorKey(aj) : aj.element) || aj.element;

    pushSeg(groups, ai.element, { p1: pi, p2: mid, colorKey: keyI, el: ai.element });
    pushSeg(groups, aj.element, { p1: mid, p2: pj, colorKey: keyJ, el: aj.element });
    segCount += 2;
  }

  if (segCount === 0) return { meshes: [], segCount: 0 };

  // 共用一个几何体，提升性能
  // Share geometry across meshes for performance
  const geometry = new THREE.CylinderGeometry(
    bondRadius,
    bondRadius,
    1.0,
    12,
    1,
    false,
  );

  const up = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const mat = new THREE.Matrix4();
  const center = new THREE.Vector3();
  const p1 = new THREE.Vector3();
  const p2 = new THREE.Vector3();

  const meshes: THREE.InstancedMesh[] = [];

  const tmpColor = new THREE.Color();

  for (const [el, segs] of groups.entries()) {
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#ffffff'),
      metalness: 0.0,
      roughness: 0.85,
      vertexColors: true,
    });

    const mesh = new THREE.InstancedMesh(geometry, material, segs.length);
    (mesh.userData as any).element = el;

    for (let i = 0; i < segs.length; i += 1) {
      const seg = segs[i]!;
      p1.set(seg.p1[0], seg.p1[1], seg.p1[2]);
      p2.set(seg.p2[0], seg.p2[1], seg.p2[2]);

      // 圆柱中心点
      // Cylinder center
      center.addVectors(p1, p2).multiplyScalar(0.5);

      // 圆柱方向与长度（Y 轴朝向 -> seg 方向）
      // Direction and length (align cylinder Y axis to segment direction)
      dir.subVectors(p2, p1);
      const len = dir.length();
      if (len < 1.0e-7) {
        mat.identity();
        mesh.setMatrixAt(i, mat);
        continue;
      }

      dir.multiplyScalar(1 / len);
      quat.setFromUnitVectors(up, dir);

      // 圆柱默认高度为 1，缩放到 len
      // Default height=1, scale Y to segment length
      scale.set(1, len, 1);

      mat.compose(center, quat, scale);
      mesh.setMatrixAt(i, mat);

      const cHex = (colorMap && colorMap[seg.colorKey])
        ? colorMap[seg.colorKey]!
        : getElementColorHex(el);
      tmpColor.set(cHex);
      mesh.setColorAt(i, tmpColor);
    }

    mesh.instanceMatrix.needsUpdate = true;
    const ic = mesh.instanceColor;
    if (ic) ic.needsUpdate = true;
    meshes.push(mesh);
  }

  return { meshes, segCount };
}

function pushSeg(groups: Map<string, BondSeg[]>, el: string, seg: BondSeg): void {
  const arr = groups.get(el);
  if (arr) arr.push(seg);
  else groups.set(el, [seg]);
}
