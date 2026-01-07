import * as THREE from 'three';
import type { Atom } from '../structure/types';
import { getCovalentRadiusAng, getElementColorHex } from '../structure/chem';

/**
 * Base sphere radius from covalent radius (no global atomScale).
 * 基于共价半径的基础球半径（不含全局 atomScale）。
 */
export function getSphereBaseRadiusByElement(
  el: string,
  atomSizeFactor: number,
): number {
  return atomSizeFactor * getCovalentRadiusAng(el);
}

/**
 * Build instanced atom meshes grouped by element (or custom key).
 * 构建按元素/自定义 key 分组的实例化原子网格。
 */
export function buildAtomMeshesByElement(params: {
  atoms: Atom[];
  atomSizeFactor: number;
  atomScale: number;
  sphereSegments?: number;
  /** Optional grouping key. Defaults to element (or getColorKey if provided). */
  getGroupKey?: (atom: Atom) => string;
  /** Optional color key (used for either group coloring or per-instance colors). */
  getColorKey?: (atom: Atom) => string;
  /** Optional color map keyed by getColorKey result. */
  colorMap?: Record<string, string>;
  /** If true, set per-instance colors (reduces draw calls for many typeIds). */
  useInstanceColor?: boolean;
}): THREE.InstancedMesh[] {
  const {
    atoms,
    atomSizeFactor,
    atomScale,
    sphereSegments = 16,
    getGroupKey,
    getColorKey,
    colorMap,
    useInstanceColor = false,
  } = params;

  type Group = { element: string; indices: number[] };
  const keyToGroup = new Map<string, Group>();

  for (let i = 0; i < atoms.length; i += 1) {
    const a = atoms[i];
    if (!a) continue;

    const key = (getGroupKey
      ? getGroupKey(a)
      : (getColorKey ? getColorKey(a) : a.element)) || a.element;
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
  const tmpColor = new THREE.Color();

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
      color: new THREE.Color(useInstanceColor ? '#ffffff' : col),
      metalness: 0.05,
      roughness: 0.9,
      vertexColors: useInstanceColor,
    });

    const mesh = new THREE.InstancedMesh(geometry, material, indices.length);
    mesh.userData.baseRadius = baseRadius;
    mesh.userData.element = el;
    mesh.userData.colorKey = key;
    mesh.userData.atomIndices = indices;

    // When using per-instance colors, persist the per-instance "colorKey" list
    // so runtime updates (e.g., color-map edits) can refresh instanceColor.
    const instanceColorKeys: string[] | null = useInstanceColor
      ? new Array(indices.length)
      : null;
    if (instanceColorKeys) mesh.userData.instanceColorKeys = instanceColorKeys;

    for (let k = 0; k < indices.length; k += 1) {
      const a = atoms[indices[k]!]!;
      const [x, y, z] = a.position;
      mat.makeTranslation(x, y, z);
      mesh.setMatrixAt(k, mat);

      if (useInstanceColor) {
        const cKey = (getColorKey ? getColorKey(a) : a.element) || a.element;
        if (instanceColorKeys) instanceColorKeys[k] = cKey;
        const cHex = (colorMap && colorMap[cKey]) ? colorMap[cKey]! : getElementColorHex(a.element);
        tmpColor.set(cHex);
        mesh.setColorAt(k, tmpColor);
      }
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (useInstanceColor) {
      const ic = mesh.instanceColor;
      if (ic) ic.needsUpdate = true;
    }
    meshes.push(mesh);
  }

  return meshes;
}

/**
 * Apply new atomScale to existing meshes (rebuild geometry).
 * 将新的 atomScale 应用到现有网格（重建几何体）。
 */
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
