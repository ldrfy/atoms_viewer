import type { LayerSourceData, SessionSnapshot } from './sessionTypes';

const SESSION_KEY = 'atomsViewer.session.v1';
const CACHE_SIZE_KEY = 'atomsViewer.session.cacheSize.v1';
const DB_NAME = 'atoms-viewer';
const DB_VERSION = 1;
const STORE_NAME = 'model-sources';

type StoredSessionMeta = {
  snapshot: SessionSnapshot;
  cachedMd5s: string[];
};

type StoredCacheSizeMeta = {
  total: number;
  items: Record<string, number>;
  updatedAt: number;
};

let dbPromise: Promise<IDBDatabase> | null = null;

function readCacheSizeMeta(): StoredCacheSizeMeta {
  // 读取缓存大小元信息，避免频繁遍历 IDB。
  // Read cache size meta to avoid frequent IDB scans.
  try {
    const raw = localStorage.getItem(CACHE_SIZE_KEY);
    if (!raw) return { total: 0, items: {}, updatedAt: 0 };
    const parsed = JSON.parse(raw) as StoredCacheSizeMeta;
    if (!parsed || typeof parsed !== 'object') return { total: 0, items: {}, updatedAt: 0 };
    const items = parsed.items && typeof parsed.items === 'object' ? parsed.items : {};
    const total = Number.isFinite(parsed.total) ? parsed.total : 0;
    const updatedAt = Number.isFinite(parsed.updatedAt) ? parsed.updatedAt : 0;
    return { total, items, updatedAt };
  }
  catch {
    return { total: 0, items: {}, updatedAt: 0 };
  }
}

function writeCacheSizeMeta(meta: StoredCacheSizeMeta): void {
  // 写入缓存大小元信息，用于快速展示占用。
  // Write cache size meta for fast storage usage display.
  try {
    localStorage.setItem(CACHE_SIZE_KEY, JSON.stringify(meta));
  }
  catch {
    // ignore
  }
}

function computeCacheSizeTotal(items: Record<string, number>): number {
  // 按 md5 累计压缩后的大小。
  // Sum compressed sizes by md5.
  let total = 0;
  for (const size of Object.values(items)) {
    if (Number.isFinite(size) && size > 0) total += size;
  }
  return total;
}

function updateCacheSizeItems(updates: Record<string, number>): void {
  // 合并并更新每个模型的缓存大小。
  // Merge and update cached size for each model.
  const meta = readCacheSizeMeta();
  const nextItems = { ...meta.items };
  for (const [md5, size] of Object.entries(updates)) {
    if (!md5) continue;
    if (!Number.isFinite(size) || size <= 0) {
      delete nextItems[md5];
      continue;
    }
    nextItems[md5] = size;
  }
  writeCacheSizeMeta({
    items: nextItems,
    total: computeCacheSizeTotal(nextItems),
    updatedAt: Date.now(),
  });
}

function keepCacheSizeItems(keep: Set<string>): void {
  // 只保留当前会话涉及的缓存大小记录。
  // Keep cache size records only for current session.
  const meta = readCacheSizeMeta();
  const nextItems: Record<string, number> = {};
  for (const [md5, size] of Object.entries(meta.items)) {
    if (!keep.has(md5)) continue;
    if (!Number.isFinite(size) || size <= 0) continue;
    nextItems[md5] = size;
  }
  writeCacheSizeMeta({
    items: nextItems,
    total: computeCacheSizeTotal(nextItems),
    updatedAt: Date.now(),
  });
}

function clearCacheSizeMeta(): void {
  // 清空缓存大小元信息。
  // Clear cache size meta.
  try {
    localStorage.removeItem(CACHE_SIZE_KEY);
  }
  catch {
    // ignore
  }
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'md5' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).catch<IDBDatabase>((err) => {
    console.warn('IndexedDB unavailable, session persistence disabled', err);
    throw err;
  });
  return dbPromise as Promise<IDBDatabase>;
}

async function saveSourcesToDb(sources: LayerSourceData[]): Promise<string[]> {
  if (!sources || sources.length === 0) return [];
  try {
    const prepared: Array<{
      md5: string;
      payload: Record<string, unknown>;
    }> = [];
    for (const src of sources) {
      if (!src.md5 || !src.buffer) continue;
      const origSize = Number.isFinite(src.size) ? Number(src.size) : src.buffer.byteLength;
      let storedBuffer: ArrayBuffer = src.buffer;
      let storedSize = storedBuffer.byteLength;
      let compressed = false;
      // 压缩后需可稳定解压，避免恢复失败。
      // Only store compressed buffer when it round-trips safely.
      const compressedBuf = await compressArrayBuffer(src.buffer);
      if (compressedBuf && compressedBuf.byteLength < storedSize) {
        const roundtrip = await decompressArrayBuffer(compressedBuf);
        if (roundtrip && roundtrip.byteLength === src.buffer.byteLength) {
          storedBuffer = compressedBuf;
          storedSize = compressedBuf.byteLength;
          compressed = true;
        }
      }
      prepared.push({
        md5: src.md5,
        payload: {
          md5: src.md5,
          buffer: storedBuffer,
          fileName: src.fileName,
          size: origSize,
          storedSize,
          compressed,
          mime: src.mime,
          type: src.type,
          url: src.url,
          layerId: src.layerId,
          cached: src.cached ?? true,
          savedAt: Date.now(),
        },
      });
    }

    if (prepared.length === 0) return [];

    const db = await openDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const md5s: string[] = [];
    const sizeUpdates: Record<string, number> = {};
    for (const item of prepared) {
      md5s.push(item.md5);
      const storedSize = Number(item.payload.storedSize);
      if (Number.isFinite(storedSize) && storedSize > 0) {
        sizeUpdates[item.md5] = storedSize;
      }
      await new Promise<void>((resolve, reject) => {
        const req = store.put(item.payload);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    updateCacheSizeItems(sizeUpdates);
    return md5s;
  }
  catch (err) {
    console.warn('Failed to persist model sources', err);
    return [];
  }
}

async function loadSourcesFromDb(md5s: string[]): Promise<LayerSourceData[]> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const res: LayerSourceData[] = [];
    const targetMd5s = md5s && md5s.length > 0 ? md5s : null;
    if (targetMd5s) {
      await Promise.all(
        targetMd5s.map(async (md5) => {
          await new Promise<void>((resolve) => {
            const req = store.get(md5);
            req.onsuccess = async () => {
              const val = req.result as any;
              if (val && val.buffer) {
                let buffer = val.buffer as ArrayBuffer;
                if (val.compressed) {
                  if (typeof DecompressionStream === 'undefined') {
                    try {
                      store.delete(md5);
                    }
                    catch {
                      // ignore
                    }
                    updateCacheSizeItems({ [md5]: 0 });
                    resolve();
                    return;
                  }
                  const decompressed = await decompressArrayBuffer(buffer);
                  if (!decompressed) {
                    try {
                      store.delete(md5);
                    }
                    catch {
                      // ignore
                    }
                    updateCacheSizeItems({ [md5]: 0 });
                    resolve();
                    return;
                  }
                  buffer = decompressed;
                }
                res.push({
                  md5: val.md5,
                  buffer,
                  fileName: val.fileName,
                  size: Number.isFinite(val.size) ? val.size : buffer.byteLength,
                  storedSize: Number.isFinite(val.storedSize) ? val.storedSize : undefined,
                  mime: val.mime,
                  type: val.type,
                  url: val.url,
                  layerId: val.layerId,
                  cached: val.cached,
                });
              }
              resolve();
            };
            req.onerror = () => resolve();
          });
        }),
      );
    }
    else {
      await new Promise<void>((resolve) => {
        const req = store.openCursor();
        req.onsuccess = async () => {
          const cursor = req.result;
          if (!cursor) {
            resolve();
            return;
          }
          const val = cursor.value as any;
          if (val && val.buffer) {
            let buffer = val.buffer as ArrayBuffer;
            if (val.compressed) {
              if (typeof DecompressionStream === 'undefined') {
                try {
                  store.delete(val.md5);
                }
                catch {
                  // ignore
                }
                updateCacheSizeItems({ [val.md5]: 0 });
                cursor.continue();
                return;
              }
              const decompressed = await decompressArrayBuffer(buffer);
              if (!decompressed) {
                try {
                  store.delete(val.md5);
                }
                catch {
                  // ignore
                }
                updateCacheSizeItems({ [val.md5]: 0 });
                cursor.continue();
                return;
              }
              buffer = decompressed;
            }
            res.push({
              md5: val.md5,
              buffer,
              fileName: val.fileName,
              size: Number.isFinite(val.size) ? val.size : buffer.byteLength,
              storedSize: Number.isFinite(val.storedSize) ? val.storedSize : undefined,
              mime: val.mime,
              type: val.type,
              url: val.url,
              layerId: val.layerId,
              cached: val.cached,
            });
          }
          cursor.continue();
        };
        req.onerror = () => resolve();
      });
    }
    return res;
  }
  catch (err) {
    console.warn('Failed to load model sources', err);
    return [];
  }
}

async function clearSourceDb(): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => resolve();
      tx.onerror = () => resolve();
    });
  }
  catch {
    // ignore
  }
  clearCacheSizeMeta();
}

async function pruneSourceDb(keepMd5s: string[]): Promise<void> {
  try {
    const keep = new Set((keepMd5s ?? []).filter(Boolean));
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    await new Promise<void>((resolve) => {
      const req = store.openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) {
          resolve();
          return;
        }
        const val = cursor.value as any;
        const md5 = String(val?.md5 ?? '');
        if (!keep.has(md5)) {
          try {
            cursor.delete();
          }
          catch {
            // ignore
          }
        }
        cursor.continue();
      };
      req.onerror = () => resolve();
    });
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => resolve();
      tx.onerror = () => resolve();
    });
    keepCacheSizeItems(keep);
  }
  catch {
    // ignore
  }
}

export async function estimateSessionCacheBytes(): Promise<number> {
  // 直接读取缓存元信息，避免遍历 IDB。
  // Read cache meta directly to avoid IDB scans.
  return readCacheSizeMeta().total;
}

export function readSessionCacheSizeMap(): Record<string, number> {
  // 返回 md5 -> 压缩后大小的映射。
  // Return md5 -> compressed size mapping.
  const meta = readCacheSizeMeta();
  return { ...meta.items };
}

export function readStoredSessionMeta(): StoredSessionMeta | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSessionMeta;
    if (!parsed || typeof parsed !== 'object') return null;
    if ('version' in parsed) return null;
    if (!parsed.snapshot || !parsed.snapshot.layers) return null;
    return parsed;
  }
  catch {
    return null;
  }
}

export async function saveSessionToStorage(
  snapshot: SessionSnapshot,
  sources: LayerSourceData[],
): Promise<void> {
  const candidates = (sources ?? []).filter(s => s.md5 && s.buffer) as LayerSourceData[];
  // 仅保存尚未缓存的模型，避免频繁压缩与写入。
  // Only store models not cached yet to avoid repeated compression/writes.
  const cachedSizeMap = readCacheSizeMeta().items ?? {};
  const pending = candidates.filter((s) => {
    const md5 = s.md5 ?? '';
    if (!md5) return false;
    const existed = Number.isFinite(cachedSizeMap[md5]) && cachedSizeMap[md5]! > 0;
    return !existed;
  });
  let cachedMd5s = await saveSourcesToDb(pending);
  if (cachedMd5s.length < candidates.length) {
    const existing = candidates
      .map(s => s.md5!)
      .filter(md5 => md5 && Number.isFinite(cachedSizeMap[md5]) && cachedSizeMap[md5]! > 0);
    cachedMd5s = Array.from(new Set([...cachedMd5s, ...existing]));
  }
  if (cachedMd5s.length === 0 && candidates.length > 0) {
    cachedMd5s = candidates.map(s => s.md5!).filter(Boolean);
  }
  const savedAt = snapshot.app?.savedAt ?? new Date().toISOString();
  const payload: StoredSessionMeta = {
    snapshot,
    cachedMd5s,
  };
  try {
    payload.snapshot = {
      ...snapshot,
      app: {
        savedAt,
        ...(snapshot.app ?? {}),
      },
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
    // 只保留当前会话涉及的模型缓存。
    // Keep only model caches referenced by the current session.
    await pruneSourceDb(cachedMd5s);
    // 通知 UI 刷新存储占用（模型缓存已更新）。
    // Notify UI to refresh storage usage (model cache updated).
    window.dispatchEvent(new CustomEvent('atoms-viewer:session-saved'));
  }
  catch (err) {
    console.warn('Failed to persist session snapshot', err);
  }
}

export async function loadSessionFromStorage(): Promise<{
  snapshot: SessionSnapshot;
  sources: LayerSourceData[];
  cachedMd5s: string[];
} | null> {
  const meta = readStoredSessionMeta();
  if (!meta) return null;
  const sources = await loadSourcesFromDb(meta.cachedMd5s ?? []);

  if (sources.length === 0) {
    const layers = meta.snapshot?.layers as any;
    const data = layers && typeof layers === 'object' ? layers.data : null;
    const hasUrl = data && typeof data === 'object'
      ? Object.values(data as Record<string, any>).some((l: any) => l?.source?.url)
      : false;
    if (!hasUrl) return null;
  }
  return {
    snapshot: meta.snapshot,
    sources,
    cachedMd5s: meta.cachedMd5s ?? [],
  };
}

export async function clearSessionStorage(): Promise<void> {
  try {
    localStorage.removeItem(SESSION_KEY);
  }
  catch {}
  await clearSourceDb();
  // 通知 UI 刷新存储占用（会话已清理）。
  // Notify UI to refresh storage usage (session cleared).
  window.dispatchEvent(new CustomEvent('atoms-viewer:session-saved'));
}

async function compressArrayBuffer(buf: ArrayBuffer): Promise<ArrayBuffer | null> {
  try {
    if (typeof CompressionStream === 'undefined') return null;
    if (typeof DecompressionStream === 'undefined') return null;
    const stream = new Blob([buf]).stream().pipeThrough(new CompressionStream('gzip'));
    return await new Response(stream).arrayBuffer();
  }
  catch {
    return null;
  }
}

async function decompressArrayBuffer(buf: ArrayBuffer): Promise<ArrayBuffer | null> {
  try {
    if (typeof DecompressionStream === 'undefined') return null;
    const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
    return await new Response(stream).arrayBuffer();
  }
  catch {
    return null;
  }
}
