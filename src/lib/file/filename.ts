// src/lib/file/filename.ts

/**
 * Utilities for generating safe, informative filenames for downloads.
 *
 * Convention used across the app:
 *   <modelStem>_<YYYYMMDD_HHMMSS><ext>
 */

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Formats a timestamp using local time, safe for filenames.
 * Example: 20260106_132045
 */
export function formatTimestampForFilename(d: Date = new Date()): string {
  const y = d.getFullYear();
  const mo = pad2(d.getMonth() + 1);
  const da = pad2(d.getDate());
  const hh = pad2(d.getHours());
  const mm = pad2(d.getMinutes());
  const ss = pad2(d.getSeconds());
  return `${y}${mo}${da}_${hh}${mm}${ss}`;
}

export function stripFileExtension(name: string): string {
  const n = (name ?? '').trim();
  const base = n.split(/[\\/]/).pop() ?? '';
  const idx = base.lastIndexOf('.');
  if (idx <= 0) return base;
  return base.slice(0, idx);
}

export function sanitizeFileStem(stem: string): string {
  // Windows-reserved/invalid characters + control chars.
  const invalid = new RegExp(String.raw`[\\/:*?"<>|\x00-\x1F]`, 'g');
  const collapsed = (stem ?? '')
    .replace(invalid, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .trim();

  const safe = collapsed.length > 0 ? collapsed : 'model';
  // Keep filenames reasonable (some platforms have path length limits).
  return safe.slice(0, 80);
}

export function buildExportFilename(params: {
  modelFileName?: string;
  ext: string; // ".png" or "png" etc
  date?: Date;
}): string {
  const { modelFileName, ext, date } = params;
  const ts = formatTimestampForFilename(date ?? new Date());

  const stem0 = stripFileExtension(modelFileName ?? '');
  const stem = sanitizeFileStem(stem0);

  const e = (ext ?? '').trim();
  const dotExt = e.startsWith('.') ? e : `.${e}`;
  return `${stem}_${ts}${dotExt}`;
}
