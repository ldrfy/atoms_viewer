import * as THREE from 'three';

function disposeMaterial(mat: THREE.Material | THREE.Material[]): void {
  if (Array.isArray(mat)) {
    for (const m of mat) m.dispose();
  }
  else {
    mat.dispose();
  }
}

/** 释放 InstancedMesh 的 geometry/material。 */
export function disposeInstancedMesh(mesh: THREE.InstancedMesh): void {
  mesh.geometry.dispose();
  disposeMaterial(mesh.material);
}

/** 从 group 中移除并释放一组 InstancedMesh。 */
export function removeAndDisposeInstancedMeshes(
  group: THREE.Group | null,
  meshes: THREE.InstancedMesh[],
): void {
  if (!group) return;

  for (const m of meshes) {
    group.remove(m);
    disposeInstancedMesh(m);
  }
}
