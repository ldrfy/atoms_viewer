import * as THREE from "three";
import type { Atom } from "../../lib/structure/types";
import type { Ref } from "vue";

export function computeMeanCenterInto(
  atoms: Atom[],
  out: THREE.Vector3
): THREE.Vector3 {
  let cx = 0;
  let cy = 0;
  let cz = 0;

  for (const a of atoms) {
    cx += a.position[0];
    cy += a.position[1];
    cz += a.position[2];
  }
  const n = Math.max(1, atoms.length);
  return out.set(cx / n, cy / n, cz / n);
}

export function applyFrameAtomsToMeshes(params: {
  frameAtoms: Atom[];
  atomMeshes: THREE.InstancedMesh[];
  baseCenter: THREE.Vector3;
  centerTmp: THREE.Vector3;
  matTmp: THREE.Matrix4;
}): void {
  const { frameAtoms, atomMeshes, baseCenter, centerTmp, matTmp } = params;

  const c = computeMeanCenterInto(frameAtoms, centerTmp);
  const dx = c.x - baseCenter.x;
  const dy = c.y - baseCenter.y;
  const dz = c.z - baseCenter.z;

  for (const mesh of atomMeshes) {
    const indices = mesh.userData.atomIndices as number[] | undefined;
    if (!indices) continue;

    for (let k = 0; k < indices.length; k += 1) {
      const ai = indices[k]!;
      const a = frameAtoms[ai];
      if (!a) continue;

      const x = a.position[0] - dx;
      const y = a.position[1] - dy;
      const z = a.position[2] - dz;

      matTmp.makeTranslation(x, y, z);
      mesh.setMatrixAt(k, matTmp);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
}

/**
 * 同步动画状态（帧数、当前帧、是否有动画）。
 *
 * Sync animation state (frame index/count and whether animation exists).
 */
export function applyAnimationInfo(
  info: { frameCount: number; hasAnimation: boolean },
  frameIndex: Ref<number>,
  frameCount: Ref<number>,
  hasAnimation: Ref<boolean>
): void {
  frameIndex.value = 0;
  frameCount.value = info.frameCount;
  hasAnimation.value = info.hasAnimation;
}
