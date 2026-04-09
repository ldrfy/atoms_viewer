import type { Atom } from '../structure/types';

export type CylinderDefaultParams = {
  center: { x: number; y: number; z: number };
  axis: { x: number; y: number; z: number };
  radius: number;
  height: number;
  sizeX: number;
  sizeY: number;
  sizeZ: number;
};

/**
 * 从原子坐标计算圆柱默认参数。
 * - center: 包围盒中心
 * - axis: 固定 z 轴
 * - radius: (x_max-x_min + y_max-y_min) / 4
 * - height: z_max-z_min
 *
 * Compute default cylinder params from atom coordinates.
 * - center: bounding-box center
 * - axis: fixed z-axis
 * - radius: (x_max-x_min + y_max-y_min) / 4
 * - height: z_max-z_min
 */
export function computeCylinderDefaultsFromAtoms(atoms: Atom[] | null | undefined): CylinderDefaultParams {
  if (!atoms || atoms.length === 0) {
    return {
      center: { x: 0, y: 0, z: 0 },
      axis: { x: 0, y: 0, z: 1 },
      radius: 0.16,
      height: 10,
      sizeX: 10,
      sizeY: 10,
      sizeZ: 10,
    };
  }

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (const atom of atoms) {
    const x = atom.position[0];
    const y = atom.position[1];
    const z = atom.position[2];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  const widthX = Math.max(0, maxX - minX);
  const widthY = Math.max(0, maxY - minY);
  const widthZ = Math.max(0, maxZ - minZ);
  const radius = (widthX + widthY) / 4;

  return {
    center: {
      x: Number.isFinite(minX) && Number.isFinite(maxX) ? (minX + maxX) / 2 : 0,
      y: Number.isFinite(minY) && Number.isFinite(maxY) ? (minY + maxY) / 2 : 0,
      z: Number.isFinite(minZ) && Number.isFinite(maxZ) ? (minZ + maxZ) / 2 : 0,
    },
    axis: { x: 0, y: 0, z: 1 },
    radius: Number.isFinite(radius) && radius > 0 ? radius : 0.16,
    height: Number.isFinite(widthZ) && widthZ > 0 ? widthZ : 10,
    sizeX: Number.isFinite(widthX) && widthX > 0 ? widthX : 10,
    sizeY: Number.isFinite(widthY) && widthY > 0 ? widthY : 10,
    sizeZ: Number.isFinite(widthZ) && widthZ > 0 ? widthZ : 10,
  };
}
