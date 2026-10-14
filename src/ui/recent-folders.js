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

/** @typedef {{ get(key: string): Promise<any>, put(key: string, value: any): Promise<void> }} RecentStore */

/** @type {RecentStore} */
let store = {
  get: (key) => run('readonly', (s) => s.get(key)),
  put: async (key, value) => { await run('readwrite', (s) => s.put(value, key)); },
};

/** Replace where the list is kept (tests; jsdom has no IndexedDB). @param {RecentStore} s */
export function setRecentStore(s) {
  store = s;
}

/** @returns {Promise<{ name: string, handle: any }[]>} newest first */
export async function loadRecentFolders() {
  try {
    const list = /** @type {any[] | null} */ (await store.get(KEY));
    if (Array.isArray(list)) return list;
    const old = await store.get(OLD_KEY); // the single folder older builds kept
    return old ? [{ name: /** @type {any} */ (old).name, handle: old }] : [];
  } catch {
    return [];
  }
}

/** @param {{ name: string, handle: any }[]} list */
async function save(list) {
  try {
    await store.put(KEY, list.slice(0, MAX));
    await store.put(OLD_KEY, null); // the old single entry must not come back
  } catch {
    // Not remembering the folder only costs a click next time.
  }
}

/** @param {any} handle */
export async function rememberFolder(handle) {
  const list = (await loadRecentFolders()).filter((f) => f.name !== handle.name);
  await save([{ name: handle.name, handle }, ...list]);
}

/** Take one folder off the list (it was moved, deleted, or access is refused). @param {any} handle */
export async function forgetFolder(handle) {
  await save((await loadRecentFolders()).filter((f) => f.handle !== handle && f.name !== handle.name));
}

export async function clearRecentFolders() {
  await save([]);
}
