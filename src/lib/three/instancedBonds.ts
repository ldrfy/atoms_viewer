import * as THREE from 'three';
import type { Atom } from '../structure/types';
import { getElementColorHex, normalizeElementSymbol } from '../structure/chem';
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
};

type Group = {
  /** Stable key used by color-map UI (e.g. "C", "C2"). */
  key: string;
  /** Element symbol for fallback colors (e.g. "C"). */
  el: string;
  /** Material color for this group. */
  color: string;
  segs: BondSeg[];
};

/**
 * 构建双色键合：每根键拆成两段（严格 50% / 50%），分别使用两端原子的颜色。
 *
 * Implementation note:
 * - We group segments by *colorKey* and assign the color via material.color.
 * - This avoids relying on InstancedMesh.instanceColor + vertexColors,
 *   which can be brittle depending on material/shader configuration.
 */
export function buildBondMeshesBicolor(params: {
  atoms: Atom[];
  bondFactor: number;
  atomSizeFactor: number; // kept for API compatibility
  bondRadius: number;
  /** Optional color key (matches atom color-map logic). Defaults to element. */
  getColorKey?: (atom: Atom) => string;
  /** Optional color map keyed by getColorKey result. */
  colorMap?: Record<string, string>;
}): BondBuildResult {
  const { atoms, bondFactor, bondRadius, getColorKey, colorMap } = params;

  const groups = new Map<string, Group>();

  const bonds = computeBonds(atoms, bondFactor);
  let segCount = 0;

  const addSeg = (a: Atom, p1: Atom['position'], p2: Atom['position']): void => {
    const key = (getColorKey ? getColorKey(a) : a.element) || a.element || 'E';
    const el = normalizeElementSymbol(a.element) || 'E';
    const col = (colorMap && colorMap[key]) ? colorMap[key]! : getElementColorHex(el);

    const g = groups.get(key);
    if (g) {
      g.segs.push({ p1, p2 });
    }
    else {
      groups.set(key, { key, el, color: col, segs: [{ p1, p2 }] });
    }
    segCount += 1;
  };

  for (let k = 0; k < bonds.length; k += 1) {
    const b = bonds[k]!;
    const ai = atoms[b.i]!;
    const aj = atoms[b.j]!;

    const d = b.length;
    if (d < 1.0e-9) continue;

    const pi = ai.position;
    const pj = aj.position;

    // Strict half/half split at the geometric midpoint.
    const mid: Atom['position'] = [
      (pi[0] + pj[0]) * 0.5,
      (pi[1] + pj[1]) * 0.5,
      (pi[2] + pj[2]) * 0.5,
    ];

    addSeg(ai, pi, mid);
    addSeg(aj, mid, pj);
  }

  if (segCount === 0) return { meshes: [], segCount: 0 };

  // Share geometry across meshes for performance.
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

  for (const g of groups.values()) {
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(g.color),
      metalness: 0.0,
      roughness: 0.85,
      vertexColors: false,
    });

    const mesh = new THREE.InstancedMesh(geometry, material, g.segs.length);
    (mesh.userData as any).element = g.el;
    (mesh.userData as any).colorKey = g.key;

    for (let i = 0; i < g.segs.length; i += 1) {
      const seg = g.segs[i]!;
      p1.set(seg.p1[0], seg.p1[1], seg.p1[2]);
      p2.set(seg.p2[0], seg.p2[1], seg.p2[2]);

      // Cylinder center.
      center.addVectors(p1, p2).multiplyScalar(0.5);

      // Align cylinder Y axis to segment direction.
      dir.subVectors(p2, p1);
      const len = dir.length();
      if (len < 1.0e-7) {
        mat.identity();
        mesh.setMatrixAt(i, mat);
        continue;
      }

      dir.multiplyScalar(1 / len);
      quat.setFromUnitVectors(up, dir);

      // Default height=1, scale Y to segment length.
      scale.set(1, len, 1);
      mat.compose(center, quat, scale);
      mesh.setMatrixAt(i, mat);
    }

    mesh.instanceMatrix.needsUpdate = true;
    meshes.push(mesh);
  }

  return { meshes, segCount };
}
