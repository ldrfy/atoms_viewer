import type { LayerSourceData, SessionSnapshot } from './sessionTypes';

const SESSION_KEY = 'atomsViewer.session.v1';
const DB_NAME = 'atoms-viewer';
const DB_VERSION = 1;
const STORE_NAME = 'model-sources';

type StoredSessionMeta = {
  version: number;
  savedAt: string;
  snapshot: SessionSnapshot;
  cachedMd5s: string[];
};

let dbPromise: Promise<IDBDatabase> | null = null;

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
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const md5s: string[] = [];
    await Promise.all(
      sources.map(async (src) => {
        if (!src.md5 || !src.buffer) return;
        md5s.push(src.md5);
        const payload = {
          md5: src.md5,
          buffer: src.buffer,
          fileName: src.fileName,
          size: src.size,
          mime: src.mime,
          type: src.type,
          url: src.url,
          layerId: src.layerId,
          cached: src.cached ?? true,
          savedAt: Date.now(),
        };
        await new Promise<void>((resolve, reject) => {
          const req = store.put(payload);
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        });
      }),
    );
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    return md5s;
  }
  catch (err) {
    console.warn('Failed to persist model sources', err);
    return [];
  }
}

async function loadSourcesFromDb(md5s: string[]): Promise<LayerSourceData[]> {
  if (!md5s || md5s.length === 0) return [];
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const res: LayerSourceData[] = [];
    await Promise.all(
      md5s.map(async (md5) => {
        await new Promise<void>((resolve) => {
          const req = store.get(md5);
          req.onsuccess = () => {
            const val = req.result as any;
            if (val && val.buffer) {
              res.push({
                md5: val.md5,
                buffer: val.buffer as ArrayBuffer,
                fileName: val.fileName,
                size: val.size,
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
}

export function readStoredSessionMeta(): StoredSessionMeta | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSessionMeta;
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.version !== 1) return null;
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
  const cachedMd5s = await saveSourcesToDb(
    (sources ?? []).filter(s => s.md5 && s.buffer) as LayerSourceData[],
  );
  const payload: StoredSessionMeta = {
    version: 1,
    savedAt: snapshot.savedAt ?? new Date().toISOString(),
    snapshot,
    cachedMd5s,
  };
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
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
}
