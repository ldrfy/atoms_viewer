import type { Atom, CellParams } from './types';
import { getCovalentRadiusAng } from './chem';

export interface Bond {
  i: number;
  j: number;
  length: number;
  p1?: Atom['position'];
  p2?: Atom['position'];
  shift?: [number, number, number];
}
/**
 * Compute bonds by covalent-radius cutoff (with spatial hashing).
 * 基于共价半径阈值计算键（使用空间哈希加速）。
 */
export function computeBonds(
  atoms: Atom[],
  bondFactor = 1.05,
  opts?: { cell?: CellParams },
): Bond[] {
  const cell = opts?.cell;
  if (cell && atoms.length > 0 && atoms.every(a => a.fracPosition)) {
    return computeBondsPeriodic(atoms, bondFactor, cell);
  }
  return computeBondsNonPeriodic(atoms, bondFactor);
}

function buildCellBasis(cell: CellParams): {
  ax: number;
  bx: number;
  by: number;
  cx: number;
  cy: number;
  cz: number;
} {
  const deg = Math.PI / 180;
  const alpha = cell.alpha * deg;
  const beta = cell.beta * deg;
  const gamma = cell.gamma * deg;

  const cosA = Math.cos(alpha);
  const cosB = Math.cos(beta);
  const cosG = Math.cos(gamma);
  const sinG = Math.sin(gamma);
  const safeSinG = Math.max(sinG, 1e-6);

  const ax = cell.a;
  const bx = cell.b * cosG;
  const by = cell.b * sinG;
  const cx = cell.c * cosB;
  const cy = cell.c * (cosA - cosB * cosG) / safeSinG;
  const cz = cell.c * Math.sqrt(
    Math.max(0, 1 - cosA * cosA - cosB * cosB - cosG * cosG + 2 * cosA * cosB * cosG),
  ) / safeSinG;

  return { ax, bx, by, cx, cy, cz };
}

function computeBondsPeriodic(atoms: Atom[], bondFactor: number, cell: CellParams): Bond[] {
  const n = atoms.length;
  if (n <= 1) return [];

  const radii = new Float64Array(n);
  const fx = new Float64Array(n);
  const fy = new Float64Array(n);
  const fz = new Float64Array(n);

  let maxR = 0;
  let minFx = Number.POSITIVE_INFINITY;
  let minFy = Number.POSITIVE_INFINITY;
  let minFz = Number.POSITIVE_INFINITY;

  for (let i = 0; i < n; i += 1) {
    const a = atoms[i];
    if (!a) throw new Error(`atoms[${i}] undefined`);

    radii[i] = getCovalentRadiusAng(a.element);
    if (radii[i]! > maxR) maxR = radii[i]!;

    const f = a.fracPosition!;
    const x = ((f[0] % 1) + 1) % 1;
    const y = ((f[1] % 1) + 1) % 1;
    const z = ((f[2] % 1) + 1) % 1;
    fx[i] = x;
    fy[i] = y;
    fz[i] = z;
    if (x < minFx) minFx = x;
    if (y < minFy) minFy = y;
    if (z < minFz) minFz = z;
  }

  const maxCutoff = Math.max(1e-6, (2 * maxR) * bondFactor);
  const minLen = Math.min(cell.a, cell.b, cell.c);
  if (!Number.isFinite(minLen) || minLen <= 1e-6) {
    return computeBondsNonPeriodic(atoms, bondFactor);
  }

  const cellSize = Math.max(1e-6, maxCutoff / minLen);
  const invCell = 1 / cellSize;

  const cellKey = (ix: number, iy: number, iz: number): string => `${ix},${iy},${iz}`;

  const grid = new Map<string, number[]>();
  for (let i = 0; i < n; i += 1) {
    const ix = Math.floor((fx[i]! - minFx) * invCell);
    const iy = Math.floor((fy[i]! - minFy) * invCell);
    const iz = Math.floor((fz[i]! - minFz) * invCell);

    const k = cellKey(ix, iy, iz);
    const arr = grid.get(k);
    if (arr) arr.push(i);
    else grid.set(k, [i]);
  }

  const { ax, bx, by, cx, cy, cz } = buildCellBasis(cell);
  const bonds: Bond[] = [];

  for (let i = 0; i < n; i += 1) {
    const fxi = fx[i]!;
    const fyi = fy[i]!;
    const fzi = fz[i]!;
    const ri = radii[i]!;

    const ix = Math.floor((fxi - minFx) * invCell);
    const iy = Math.floor((fyi - minFy) * invCell);
    const iz = Math.floor((fzi - minFz) * invCell);

    for (let dxCell = -1; dxCell <= 1; dxCell += 1) {
      for (let dyCell = -1; dyCell <= 1; dyCell += 1) {
        for (let dzCell = -1; dzCell <= 1; dzCell += 1) {
          const arr = grid.get(cellKey(ix + dxCell, iy + dyCell, iz + dzCell));
          if (!arr) continue;

          for (let p = 0; p < arr.length; p += 1) {
            const j = arr[p]!;
            if (j <= i) continue;

            const rcut = (ri + radii[j]!) * bondFactor;

            let dx = fx[j]! - fxi;
            let dy = fy[j]! - fyi;
            let dz = fz[j]! - fzi;
            const sx = Math.round(dx);
            const sy = Math.round(dy);
            const sz = Math.round(dz);
            dx -= sx;
            dy -= sy;
            dz -= sz;

            const cxv = dx * ax + dy * bx + dz * cx;
            const cyv = dy * by + dz * cy;
            const czv = dz * cz;

            if (Math.abs(cxv) > rcut) continue;
            if (Math.abs(cyv) > rcut) continue;
            if (Math.abs(czv) > rcut) continue;

            const d2 = cxv * cxv + cyv * cyv + czv * czv;
            const rcut2 = rcut * rcut;
            if (d2 > rcut2) continue;

            const length = Math.sqrt(d2);
            if (length < 1.0e-7) continue;

            const pi = atoms[i]!.position;
            const p2: Atom['position'] = [pi[0] + cxv, pi[1] + cyv, pi[2] + czv];
            bonds.push({
              i,
              j,
              length,
              p1: pi,
              p2,
              shift: [-sx, -sy, -sz],
            });
          }
        }
      }
    }
  }

  return bonds;
}

export function unwrapAtomsPeriodic(atoms: Atom[], cell: CellParams, bondFactor: number): Atom[] {
  const n = atoms.length;
  if (n <= 1) return atoms;

  const bonds = computeBondsPeriodic(atoms, bondFactor, cell);
  if (bonds.length === 0) return atoms;

  const adj: { j: number; shift: [number, number, number] }[][] = Array.from({ length: n }, () => []);
  for (const b of bonds) {
    const shift = b.shift ?? [0, 0, 0];
    adj[b.i]!.push({ j: b.j, shift });
    adj[b.j]!.push({ j: b.i, shift: [-shift[0], -shift[1], -shift[2]] });
  }

  const shifts: ([number, number, number] | null)[] = Array.from({ length: n }, () => null);
  const queue: number[] = [];

  for (let start = 0; start < n; start += 1) {
    if (shifts[start]) continue;
    shifts[start] = [0, 0, 0];
    queue.push(start);

    while (queue.length > 0) {
      const i = queue.shift()!;
      const base = shifts[i]!;
      for (const edge of adj[i]!) {
        if (shifts[edge.j]) continue;
        shifts[edge.j] = [
          base[0] + edge.shift[0],
          base[1] + edge.shift[1],
          base[2] + edge.shift[2],
        ];
        queue.push(edge.j);
      }
    }
  }

  const { ax, bx, by, cx, cy, cz } = buildCellBasis(cell);
  const out: Atom[] = new Array(n);
  for (let i = 0; i < n; i += 1) {
    const a = atoms[i]!;
    const t = shifts[i] ?? [0, 0, 0];
    const dx = t[0] * ax + t[1] * bx + t[2] * cx;
    const dy = t[1] * by + t[2] * cy;
    const dz = t[2] * cz;
    out[i] = {
      ...a,
      position: [a.position[0] + dx, a.position[1] + dy, a.position[2] + dz],
    };
  }

  return out;
}

function computeBondsNonPeriodic(atoms: Atom[], bondFactor = 1.05): Bond[] {
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
