import * as THREE from 'three';
import type { Atom } from '../structure/types';
import { getCovalentRadiusAng, getElementColorHex } from '../structure/chem';

export function getSphereBaseRadiusByElement(
  el: string,
  atomSizeFactor: number,
): number {
  return atomSizeFactor * getCovalentRadiusAng(el);
}

export function buildAtomMeshesByElement(params: {
  atoms: Atom[];
  atomSizeFactor: number;
  atomScale: number;
  sphereSegments?: number;
}): THREE.InstancedMesh[] {
  const { atoms, atomSizeFactor, atomScale, sphereSegments = 16 } = params;

  const elementToIndices = new Map<string, number[]>();
  for (let i = 0; i < atoms.length; i += 1) {
    const a = atoms[i];
    if (!a) continue;
    const arr = elementToIndices.get(a.element);
    if (arr) arr.push(i);
    else elementToIndices.set(a.element, [i]);
  }

  const meshes: THREE.InstancedMesh[] = [];
  const mat = new THREE.Matrix4();

  for (const [el, indices] of elementToIndices.entries()) {
    const baseRadius = getSphereBaseRadiusByElement(el, atomSizeFactor);
    const rSphere = baseRadius * atomScale;

    const geometry = new THREE.SphereGeometry(
      rSphere,
      sphereSegments,
      sphereSegments,
    );
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(getElementColorHex(el)),
      metalness: 0.05,
      roughness: 0.9,
    });

    const mesh = new THREE.InstancedMesh(geometry, material, indices.length);
    mesh.userData.baseRadius = baseRadius;
    mesh.userData.element = el;
    mesh.userData.atomIndices = indices;

    for (let k = 0; k < indices.length; k += 1) {
      const a = atoms[indices[k]!]!;
      const [x, y, z] = a.position;
      mat.makeTranslation(x, y, z);
      mesh.setMatrixAt(k, mat);
    }

    mesh.instanceMatrix.needsUpdate = true;
    meshes.push(mesh);
  }

  return meshes;
}

export function applyAtomScaleToMeshes(
  meshes: THREE.InstancedMesh[],
  atomScale: number,
  sphereSegments = 16,
): void {
  for (const m of meshes) {
    const baseRadius = m.userData.baseRadius as number | undefined;
    if (!baseRadius || baseRadius <= 0) continue;

    const r = baseRadius * atomScale;
    m.geometry.dispose();
    m.geometry = new THREE.SphereGeometry(r, sphereSegments, sphereSegments);
  }
}
