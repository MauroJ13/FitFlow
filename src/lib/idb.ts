/** Tiny promise wrapper around IndexedDB (no dependency). */
const DB_NAME = 'fitflow';
const DB_VERSION = 1;
let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(stores: readonly string[]): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const s of stores) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  const db = await dbPromise!;
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve((req ? req.result : undefined) as T);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const idbAll = <T>(store: string) => run<T[]>(store, 'readonly', (s) => s.getAll());
export const idbGet = <T>(store: string, key: string) => run<T | undefined>(store, 'readonly', (s) => s.get(key));
export const idbPut = (store: string, value: unknown, key?: string) => run<unknown>(store, 'readwrite', (s) => { s.put(value, key); });
export const idbPutMany = (store: string, values: unknown[]) => run<unknown>(store, 'readwrite', (s) => { values.forEach((v) => s.put(v)); });
export const idbClear = (store: string) => run<unknown>(store, 'readwrite', (s) => { s.clear(); });
