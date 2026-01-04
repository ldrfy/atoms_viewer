import type { Atom } from './types';
import { getCovalentRadiusAng } from './chem';

export interface Bond {
  i: number;
  j: number;
  length: number;
}
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

  for (let i = 0; i < n; i += 1) {
    const xi = xs[i]!;
    const yi = ys[i]!;
    const zi = zs[i]!;
    const ri = radii[i]!;

    for (let j = i + 1; j < n; j += 1) {
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

  return bonds;
}
