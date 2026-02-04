import type { LayerSnapshot } from '../../../lib/viewer/sessionTypes';

const CACHE_KEY = 'atomsViewer.layerSnapshotCache.v1';
const MAX_STALE = 5;

type LayerSnapshotCacheEntry = {
  snapshot: LayerSnapshot;
  savedAt: number;
};

type LayerSnapshotCache = Record<string, LayerSnapshotCacheEntry>;

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
    cache[md5] = { snapshot: snap, savedAt: now };
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
