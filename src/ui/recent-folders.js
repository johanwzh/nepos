// Recently opened project folders, for "Åpne nylig" and "Reopen" (navigation spec §6). Folder
// handles are the only thing Nepos keeps in the browser's IndexedDB; every access may fail (private
// windows, tests) and then the list is simply empty.
const DB_NAME = 'nepos2';
const STORE = 'kv';
const KEY = 'recentFolders';
const OLD_KEY = 'lastFolder';
const MAX = 8;

/**
 * @param {IDBTransactionMode} mode
 * @param {(store: IDBObjectStore) => IDBRequest} action
 */
function run(mode, action) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const request = action(req.result.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    };
  });
}

/** @returns {Promise<{ name: string, handle: any }[]>} newest first */
export async function loadRecentFolders() {
  try {
    const list = /** @type {any[] | null} */ (await run('readonly', (s) => s.get(KEY)));
    if (Array.isArray(list) && list.length) return list;
    const old = await run('readonly', (s) => s.get(OLD_KEY)); // the single folder older builds kept
    return old ? [{ name: /** @type {any} */ (old).name, handle: old }] : [];
  } catch {
    return [];
  }
}

/** @param {any} handle */
export async function rememberFolder(handle) {
  try {
    const list = (await loadRecentFolders()).filter((f) => f.name !== handle.name);
    await run('readwrite', (s) => s.put([{ name: handle.name, handle }, ...list].slice(0, MAX), KEY));
  } catch {
    // Not remembering the folder only costs a click next time.
  }
}
