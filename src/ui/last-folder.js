// Remembers the last opened folder so Nepos can offer "Reopen". This handle is the only thing
// Nepos keeps in the browser (spec §5); settings live in the project's private/ folder.
const DB_NAME = 'nepos2';
const STORE = 'kv';
const KEY = 'lastFolder';

/**
 * @param {IDBTransactionMode} mode
 * @param {(store: IDBObjectStore) => IDBRequest} action
 */
function run(mode, action) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const request = action(open.result.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    };
  });
}

/** @returns {Promise<any>} the remembered directory handle, or null */
export async function loadLastFolder() {
  try {
    return await run('readonly', (store) => store.get(KEY));
  } catch {
    return null;
  }
}

/** @param {any} handle */
export async function saveLastFolder(handle) {
  try {
    await run('readwrite', (store) => store.put(handle, KEY));
  } catch {
    // Not remembering the folder only costs a click next time.
  }
}
