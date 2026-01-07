import type { Atom } from './types';
import { getCovalentRadiusAng } from './chem';

export interface Bond {
  i: number;
  j: number;
  length: number;
}
/**
 * Compute bonds by covalent-radius cutoff (with spatial hashing).
 * 基于共价半径阈值计算键（使用空间哈希加速）。
 */
export function computeBonds(atoms: Atom[], bondFactor = 1.05): Bond[] {
  const n = atoms.length;
  if (n <= 1) return [];

  const radii = new Float64Array(n);
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  const zs = new Float64Array(n);

  for (let i = 0; i < n; i += 1) {
    const a = atoms[i];
    if (!a) throw new Error(`atoms[${i}] undefined`);

    radii[i] = getCovalentRadiusAng(a.element);
    xs[i] = a.position[0];
    ys[i] = a.position[1];
    zs[i] = a.position[2];
  }

  const bonds: Bond[] = [];

  // Spatial hashing (uniform grid) to avoid O(n^2) neighbor search.
  // Cell size chosen from the maximum possible cutoff.
  let maxR = 0;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;

  for (let i = 0; i < n; i += 1) {
    const r = radii[i]!;
    if (r > maxR) maxR = r;

    const x = xs[i]!;
    const y = ys[i]!;
    const z = zs[i]!;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
  }

  const maxCutoff = Math.max(1e-6, (2 * maxR) * bondFactor);
  const invCell = 1 / maxCutoff;

  const cellKey = (ix: number, iy: number, iz: number): string => `${ix},${iy},${iz}`;

  const grid = new Map<string, number[]>();
  for (let i = 0; i < n; i += 1) {
    const ix = Math.floor((xs[i]! - minX) * invCell);
    const iy = Math.floor((ys[i]! - minY) * invCell);
    const iz = Math.floor((zs[i]! - minZ) * invCell);

    const k = cellKey(ix, iy, iz);
    const arr = grid.get(k);
    if (arr) arr.push(i);
    else grid.set(k, [i]);
  }

  for (let i = 0; i < n; i += 1) {
    const xi = xs[i]!;
    const yi = ys[i]!;
    const zi = zs[i]!;
    const ri = radii[i]!;

    const ix = Math.floor((xi - minX) * invCell);
    const iy = Math.floor((yi - minY) * invCell);
    const iz = Math.floor((zi - minZ) * invCell);

    // Check neighbors in 3x3x3 cells.
    for (let dxCell = -1; dxCell <= 1; dxCell += 1) {
      for (let dyCell = -1; dyCell <= 1; dyCell += 1) {
        for (let dzCell = -1; dzCell <= 1; dzCell += 1) {
          const arr = grid.get(cellKey(ix + dxCell, iy + dyCell, iz + dzCell));
          if (!arr) continue;

          for (let p = 0; p < arr.length; p += 1) {
            const j = arr[p]!;
            if (j <= i) continue;

            const rcut = (ri + radii[j]!) * bondFactor;

            const dx = Math.abs(xs[j]! - xi);
            if (dx > rcut) continue;

            const dy = Math.abs(ys[j]! - yi);
            if (dy > rcut) continue;

            const dz = Math.abs(zs[j]! - zi);
            if (dz > rcut) continue;

            const d2 = dx * dx + dy * dy + dz * dz;
            const rcut2 = rcut * rcut;
            if (d2 > rcut2) continue;

            const length = Math.sqrt(d2);
            if (length < 1.0e-7) continue;

            bonds.push({ i, j, length });
          }
        }
      }
    }
  }

  return bonds;
}
