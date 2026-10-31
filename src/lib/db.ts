/* Minimal promise-based IndexedDB layer. Stores: datasets, experiences, kv (settings). */
import type { DatasetMeta, Experience } from '../types';

const DB_NAME = 'terratone';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('datasets')) db.createObjectStore('datasets', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('experiences')) db.createObjectStore('experiences', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(store, mode);
      const req = fn(t.objectStore(store));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB transaction failed'));
    });
  } finally {
    db.close();
  }
}

export const db = {
  async putDataset(d: DatasetMeta): Promise<void> {
    await tx('datasets', 'readwrite', (s) => s.put({ ...d, _savedAt: new Date().toISOString() }));
  },
  async getDataset(id: string): Promise<DatasetMeta | undefined> {
    return tx<DatasetMeta | undefined>('datasets', 'readonly', (s) => s.get(id));
  },
  async listDatasets(): Promise<DatasetMeta[]> {
    const dbh = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const out: DatasetMeta[] = [];
        const req = dbh.transaction('datasets', 'readonly').objectStore('datasets').openCursor();
        req.onsuccess = () => {
          const c = req.result;
          if (c) { out.push(c.value as DatasetMeta); c.continue(); } else resolve(out);
        };
        req.onerror = () => reject(req.error);
      });
    } finally {
      dbh.close();
    }
  },
  async deleteDataset(id: string): Promise<void> {
    await tx('datasets', 'readwrite', (s) => s.delete(id));
  },
  async putExperience(e: Experience): Promise<void> {
    await tx('experiences', 'readwrite', (s) => s.put(e));
  },
  async listExperiences(): Promise<Experience[]> {
    const dbh = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const out: Experience[] = [];
        const req = dbh.transaction('experiences', 'readonly').objectStore('experiences').openCursor();
        req.onsuccess = () => {
          const c = req.result;
          if (c) { out.push(c.value as Experience); c.continue(); } else resolve(out);
        };
        req.onerror = () => reject(req.error);
      });
    } finally {
      dbh.close();
    }
  },
  async deleteExperience(id: string): Promise<void> {
    await tx('experiences', 'readwrite', (s) => s.delete(id));
  },
  async setKv(key: string, value: unknown): Promise<void> {
    await tx('kv', 'readwrite', (s) => s.put({ key, value }));
  },
  async getKv<T>(key: string): Promise<T | undefined> {
    const row = await tx<{ key: string; value: T } | undefined>('kv', 'readonly', (s) => s.get(key));
    return row?.value;
  },
};

export async function storageEstimate(): Promise<{ usedMB: number; quotaMB: number }> {
  try {
    const est = await navigator.storage.estimate();
    return {
      usedMB: +(((est.usage ?? 0) / 1048576).toFixed(2)),
      quotaMB: +(((est.quota ?? 0) / 1048576).toFixed(1)),
    };
  } catch {
    return { usedMB: 0, quotaMB: 0 };
  }
}
