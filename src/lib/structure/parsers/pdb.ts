// lib/structure/parsers/pdb.ts
import type { StructureModel } from '../types';
import { makeAtom } from './common';
import { t } from '../../../i18n/index';

/**
 * 解析 PDB（ATOM/HETATM 坐标）。
 *
 * Returns:
 *   StructureModel: 至少包含 atoms
 */
/**
 * Parse PDB format (single-frame).
 * 解析 PDB 格式（单帧）。
 */
export function parsePdb(text: string): StructureModel {
  const atoms = [];
  const lines = text.split(/\r?\n/);
  const titleParts: string[] = [];
  const headerParts: string[] = [];
  for (const line of lines) {
    const rec = line.slice(0, 6).trim();
    if (rec === 'TITLE') {
      const chunk = stripPdbMetaChunk(line);
      if (chunk) titleParts.push(chunk);
      continue;
    }
    if (rec === 'HEADER') {
      const chunk = stripPdbMetaChunk(line);
      if (chunk) headerParts.push(chunk);
      continue;
    }
    if (rec !== 'ATOM' && rec !== 'HETATM') continue;
    if (line.length < 54) continue;

    const x = safeParseFloat(line.slice(30, 38));
    const y = safeParseFloat(line.slice(38, 46));
    const z = safeParseFloat(line.slice(46, 54));

    const atomName = line.slice(12, 16).trim();
    const resName = line.slice(17, 20).trim();
    const chainId = line.slice(21, 22).trim();
    const resSeqRaw = line.slice(22, 26).trim();
    const resSeq = resSeqRaw ? Number.parseInt(resSeqRaw, 10) : undefined;

    const element
      = sanitizeElement(line.slice(76, 78))
        || guessElementFromAtomName(atomName)
        || 'X';

    atoms.push({
      ...makeAtom(element, x, y, z),
      name: atomName || undefined,
      resName: resName || undefined,
      resSeq: Number.isFinite(resSeq) ? resSeq : undefined,
      chainId: chainId || undefined,
    });
  }

  if (atoms.length === 0) {
    throw new Error(t('errors.pdb.noAtomRecords'));
  }

  const title = normalizeMetaText(titleParts.join(' '));
  const header = normalizeMetaText(headerParts.join(' '));
  const comment = buildPdbComment({ title, header });

  centerAtomsInPlace(atoms);

  return {
    atoms,
    comment: comment || undefined,
    frameMeta: comment ? [{ comment }] : undefined,
  };
}

function safeParseFloat(s: string): number {
  const v = Number.parseFloat(s.trim());
  return Number.isFinite(v) ? v : 0;
}

function sanitizeElement(s: string): string {
  const t = s.trim();
  if (!t) return '';
  const m = t.match(/^[A-Za-z]{1,2}/);
  if (!m) return '';
  const core = m[0];
  return core.length === 1
    ? core.toUpperCase()
    : core[0]!.toUpperCase() + core.slice(1).toLowerCase();
}

function guessElementFromAtomName(atomName: string): string {
  const t = atomName.trim();
  if (!t) return '';
  const m = t.match(/^[A-Za-z]{1,2}/);
  return m ? sanitizeElement(m[0]) : '';
}

function stripPdbMetaChunk(line: string): string {
  if (!line) return '';
  const chunk = line.slice(10).trim();
  return chunk.replace(/^\d+\s*/, '');
}

function normalizeMetaText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function buildPdbComment(meta: {
  title: string;
  header: string;
}): string {
  if (meta.header && meta.title) return `${meta.header} · ${meta.title}`;
  return meta.header || meta.title || '';
}

function centerAtomsInPlace(
  atoms: { position: [number, number, number] }[],
): void {
  let cx = 0;
  let cy = 0;
  let cz = 0;

  for (const a of atoms) {
    cx += a.position[0];
    cy += a.position[1];
    cz += a.position[2];
  }
  cx /= atoms.length;
  cy /= atoms.length;
  cz /= atoms.length;

  for (const a of atoms) {
    a.position[0] -= cx;
    a.position[1] -= cy;
    a.position[2] -= cz;
  }
}
