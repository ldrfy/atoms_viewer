// lib/structure/parsers/xyz.ts
import type { Atom, StructureModel } from '../types';
import { makeAtom } from './common';
import { t } from '../../../i18n/index';

/**
 * Parse XYZ format (supports multi-frame).
 * 解析 XYZ 格式（支持多帧）。
 */
export function parseXyz(text: string): StructureModel {
  const lines = text.split(/\r?\n/);
  let i = 0;

  const frames: Atom[][] = [];
  const comments: string[] = [];

  while (true) {
    while (i < lines.length && (lines[i] ?? '').trim() === '') i += 1;
    if (i >= lines.length) break;

    const nAtoms = Number.parseInt((lines[i] ?? '').trim(), 10);
    if (!Number.isFinite(nAtoms) || nAtoms <= 0) break;
    i += 1;

    const comment = (lines[i] ?? '').trim();
    comments.push(comment);
    i += 1;

    const atoms: Atom[] = new Array(nAtoms);
    for (let k = 0; k < nAtoms; k += 1) {
      const parts = (lines[i + k] ?? '').trim().split(/\s+/);

      const element = (parts[0] ?? 'X').trim() || 'X';
      const x = parseFloatSafe(parts[1]);
      const y = parseFloatSafe(parts[2]);
      const z = parseFloatSafe(parts[3]);

      atoms[k] = makeAtom(element, x, y, z);
    }
    i += nAtoms;

    frames.push(atoms);
  }

  const atoms0 = frames[0];

  if (!atoms0) {
    throw new Error(t('errors.xyz.noFrames'));
  }

  const n0 = atoms0.length;

  for (let fi = 1; fi < frames.length; fi += 1) {
    if (frames[fi]!.length !== n0) {
      throw new Error(t('errors.xyz.inconsistentAtomCountPerFrame'));
    }
  }

  return {
    atoms: atoms0,
    frames,
    comment: comments[0] || undefined,
  };
}

function parseFloatSafe(s: string | undefined): number {
  const v = Number.parseFloat((s ?? '').trim());
  return Number.isFinite(v) ? v : 0;
}
