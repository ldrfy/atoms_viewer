import * as THREE from 'three';
import type { Atom } from '../structure/types';
import { getElementColorHex } from '../structure/chem';
import { buildBicolorBondGroups } from '../structure/bondSegments';

/**
 * 键合渲染构建结果（InstancedMesh 列表 + 段数）。
 *
 * Bond rendering build result (InstancedMesh list + segment count).
 */
export type BondBuildResult = {
  meshes: THREE.InstancedMesh[];
  segCount: number;
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
}): BondBuildResult {
  const { atoms, bondFactor, atomSizeFactor, bondRadius } = params;

  // 纯数据：由 bondSegments.ts 生成分组后的线段数据
  // Pure data: segments grouped by element, produced by bondSegments.ts
  const { groups, segCount } = buildBicolorBondGroups(atoms, {
    bondFactor,
    atomSizeFactor,
  });

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

  for (const [el, segs] of groups.entries()) {
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(getElementColorHex(el)),
      metalness: 0.0,
      roughness: 0.85,
    });

    const mesh = new THREE.InstancedMesh(geometry, material, segs.length);

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
    }

    mesh.instanceMatrix.needsUpdate = true;
    meshes.push(mesh);
  }

  return { meshes, segCount };
}
