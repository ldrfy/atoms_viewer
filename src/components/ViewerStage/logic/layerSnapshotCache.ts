import type { LayerSnapshot } from '../../../lib/viewer/sessionTypes';

const CACHE_KEY = 'atomsViewer.layerSnapshotCache.v1';
const MAX_STALE = 5;

type LayerSnapshotCacheEntry = {
  snapshot: LayerSnapshot;
  savedAt: number;
};

type LayerSnapshotCache = Record<string, LayerSnapshotCacheEntry>;

// 持久化前清理图层快照：移除 LAMMPS 占位映射 E。
// Cleanup layer snapshot before persistence: remove placeholder LAMMPS mapping "E".
function sanitizeSnapshotForCache(snapshot: LayerSnapshot): LayerSnapshot {
  const next: LayerSnapshot = { ...snapshot };
  const rawMap = snapshot?.lammps?.data ?? {};
  const cleaned: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawMap)) {
    const key = String(k ?? '').trim();
    const val = String(v ?? '').trim().toUpperCase();
    if (!key || !val || val === 'E') continue;
    cleaned[key] = val;
  }
  if (Object.keys(cleaned).length > 0) {
    next.lammps = { data: cleaned };
  }
  else {
    delete (next as any).lammps;
  }
  return next;
}

// 读取缓存的图层快照（按 md5 分组）。
// Load cached layer snapshots (grouped by md5).
export function loadLayerSnapshotCache(): LayerSnapshotCache {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object') return {};
    return obj as LayerSnapshotCache;
  }
  catch {
    return {};
  }
}

// 保存图层快照，并只保留最近 5 条“未加载”的记录。
// Save layer snapshots and keep only last 5 entries for unloaded layers.
export function saveLayerSnapshotCache(params: {
  layerSnapshots: LayerSnapshot[];
  loadedMd5s: Set<string>;
}): void {
  const { layerSnapshots, loadedMd5s } = params;
  const cache = loadLayerSnapshotCache();
  const now = Date.now();

  for (const snap of layerSnapshots ?? []) {
    const md5 = snap.source?.md5;
    if (!md5) continue;
    cache[md5] = { snapshot: sanitizeSnapshotForCache(snap), savedAt: now };
  }

  const staleEntries: Array<{ md5: string; savedAt: number }> = [];
  for (const [md5, entry] of Object.entries(cache)) {
    if (!loadedMd5s.has(md5)) {
      staleEntries.push({ md5, savedAt: entry.savedAt ?? 0 });
    }
  }
  staleEntries.sort((a, b) => b.savedAt - a.savedAt);
  const toRemove = staleEntries.slice(MAX_STALE);
  for (const item of toRemove) {
    delete cache[item.md5];
  }

  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  }
  catch {
    // ignore
  }
}

// 按 md5 读取单条快照。
// Read a single snapshot by md5.
export function getLayerSnapshotFromCache(md5?: string): LayerSnapshot | null {
  if (!md5) return null;
  const cache = loadLayerSnapshotCache();
  return cache[md5]?.snapshot ?? null;
}

// 读取最近一次保存的快照（可排除某个 md5）。
// Read the latest saved snapshot (optionally excluding one md5).
export function getLatestLayerSnapshotFromCache(excludeMd5?: string): LayerSnapshot | null {
  const cache = loadLayerSnapshotCache();
  let latest: LayerSnapshot | null = null;
  let latestAt = -1;
  for (const [md5, entry] of Object.entries(cache)) {
    if (excludeMd5 && md5 === excludeMd5) continue;
    const ts = Number(entry?.savedAt ?? -1);
    if (!Number.isFinite(ts)) continue;
    if (ts > latestAt && entry?.snapshot) {
      latestAt = ts;
      latest = entry.snapshot;
    }
  }
  return latest;
}

// 读取最近一次“包含有效 LAMMPS 映射（非全 E）”的快照。
// Read the latest snapshot that has effective LAMMPS mapping (not all placeholder E).
export function getLatestLayerSnapshotWithResolvedLammps(
  excludeMd5?: string,
): LayerSnapshot | null {
  const cache = loadLayerSnapshotCache();
  let latest: LayerSnapshot | null = null;
  let latestAt = -1;
  for (const [md5, entry] of Object.entries(cache)) {
    if (excludeMd5 && md5 === excludeMd5) continue;
    const ts = Number(entry?.savedAt ?? -1);
    if (!Number.isFinite(ts)) continue;
    const map = entry?.snapshot?.lammps?.data ?? {};
    const hasResolved = Object.values(map).some(v => String(v ?? '').trim().toUpperCase() !== 'E');
    if (!hasResolved) continue;
    if (ts > latestAt && entry?.snapshot) {
      latestAt = ts;
      latest = entry.snapshot;
    }
  }
  return latest;
}
