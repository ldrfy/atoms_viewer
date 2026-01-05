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
  /** Optional grouping key. Defaults to element. */
  getColorKey?: (atom: Atom) => string;
  /** Optional color map keyed by getColorKey result. */
  colorMap?: Record<string, string>;
}): THREE.InstancedMesh[] {
  const {
    atoms,
    atomSizeFactor,
    atomScale,
    sphereSegments = 16,
    getColorKey,
    colorMap,
  } = params;

  type Group = { element: string; indices: number[] };
  const keyToGroup = new Map<string, Group>();

  for (let i = 0; i < atoms.length; i += 1) {
    const a = atoms[i];
    if (!a) continue;

    const key = (getColorKey ? getColorKey(a) : a.element) || a.element;
    const g = keyToGroup.get(key);
    if (g) {
      g.indices.push(i);
    }
    else {
      keyToGroup.set(key, { element: a.element, indices: [i] });
    }
  }

  const meshes: THREE.InstancedMesh[] = [];
  const mat = new THREE.Matrix4();

  for (const [key, group] of keyToGroup.entries()) {
    const el = group.element;
    const indices = group.indices;

    const baseRadius = getSphereBaseRadiusByElement(el, atomSizeFactor);
    const rSphere = baseRadius * atomScale;

    const geometry = new THREE.SphereGeometry(
      rSphere,
      sphereSegments,
      sphereSegments,
    );
    const col = (colorMap && colorMap[key]) ? colorMap[key]! : getElementColorHex(el);
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(col),
      metalness: 0.05,
      roughness: 0.9,
    });

    const mesh = new THREE.InstancedMesh(geometry, material, indices.length);
    mesh.userData.baseRadius = baseRadius;
    mesh.userData.element = el;
    mesh.userData.colorKey = key;
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
