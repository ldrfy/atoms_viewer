import type { Atom } from './types';
import { normalizeElementSymbol } from './chem';
import { APP_WEB_URL, APP_DISPLAY_NAME } from '../appMeta';

export type StructureExportFormat = 'xyz' | 'pdb' | 'mol';

export function exportStructureText(params: {
  atoms: Atom[];
  format: StructureExportFormat;
  comment?: string;
}): string {
  const { atoms, format, comment } = params;
  if (format === 'xyz') return exportToXyz(atoms, comment);
  if (format === 'pdb') return exportToPdb(atoms);
  if (format === 'mol') return exportToMol(atoms);
  throw new Error(`Unsupported export format: ${format}`);
}

function exportToXyz(atoms: Atom[], comment?: string): string {
  const lines: string[] = [];
  lines.push(String(atoms.length));
  lines.push(comment ?? APP_WEB_URL);
  for (const a of atoms) {
    const el = normalizeElementSymbol(a.element) || 'X';
    lines.push(
      `${el} ${fmt(a.position[0])} ${fmt(a.position[1])} ${fmt(a.position[2])}`,
    );
  }
  return `${lines.join('\n')}\n`;
}

function exportToPdb(atoms: Atom[]): string {
  const lines: string[] = [];
  for (let i = 0; i < atoms.length; i += 1) {
    const a = atoms[i]!;
    const el = normalizeElementSymbol(a.element) || 'X';
    const name = el.padEnd(2, ' ');
    const x = padFloat(a.position[0], 8, 3);
    const y = padFloat(a.position[1], 8, 3);
    const z = padFloat(a.position[2], 8, 3);
    const idx = String(i + 1).padStart(5, ' ');
    lines.push(`HETATM${idx} ${name} MOL     1    ${x}${y}${z}  1.00  0.00           ${el.padStart(2, ' ')}`);
  }
  lines.push('END');
  return `${lines.join('\n')}\n`;
}

function exportToMol(atoms: Atom[]): string {
  const lines: string[] = [];
  lines.push(APP_DISPLAY_NAME);
  lines.push(`  ${APP_WEB_URL}`);
  lines.push('');
  const count = String(atoms.length).padStart(3, ' ');
  lines.push(`${count}  0  0  0  0  0  0  0  0  0  0  0  0 V2000`);
  for (const a of atoms) {
    const el = normalizeElementSymbol(a.element) || 'X';
    const x = padFloat(a.position[0], 10, 4);
    const y = padFloat(a.position[1], 10, 4);
    const z = padFloat(a.position[2], 10, 4);
    lines.push(`${x}${y}${z} ${el.padEnd(3, ' ')} 0  0  0  0  0  0  0  0  0  0  0  0`);
  }
  lines.push('M  END');
  return `${lines.join('\n')}\n`;
}

function fmt(v: number): string {
  return Number.isFinite(v) ? v.toFixed(6) : '0';
}

function padFloat(v: number, width: number, prec: number): string {
  const s = Number.isFinite(v) ? v.toFixed(prec) : '0'.padStart(prec + 2, '0');
  return s.padStart(width, ' ');
}
