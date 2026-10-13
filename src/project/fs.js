// Access to the project folder. The app uses a File System Access directory handle; tests use
// an in-memory folder. Both present the same small interface, with '/'-separated paths
// relative to the project folder ('' is the folder itself).

/**
 * @typedef {{
 *   readBytes(path: string): Promise<Uint8Array | null>,
 *   writeBytes(path: string, bytes: Uint8Array): Promise<void>,
 *   list(dirPath: string): Promise<{ name: string, kind: 'file' | 'directory' }[]>,
 *   mkdir(dirPath: string): Promise<void>,
 * }} ProjectFs
 */

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder('utf-8');

/** @param {string} path */
const parts = (path) => path.split('/').filter(Boolean);

/**
 * @param {{ name: string }} a
 * @param {{ name: string }} b
 */
const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

/**
 * @param {ProjectFs} fs
 * @param {string} path
 * @returns {Promise<string | null>}
 */
export async function readText(fs, path) {
  const bytes = await fs.readBytes(path);
  return bytes === null ? null : utf8Decoder.decode(bytes);
}

/**
 * @param {ProjectFs} fs
 * @param {string} path
 * @param {string} text
 */
export async function writeText(fs, path, text) {
  await fs.writeBytes(path, utf8Encoder.encode(text));
}

/**
 * @param {ProjectFs} fs
 * @param {string} path
 * @param {any} value
 */
export async function writeJson(fs, path, value) {
  await writeText(fs, path, JSON.stringify(value, null, 2) + '\n');
}

/**
 * In-memory project folder, for tests.
 * @param {Record<string, string | Uint8Array>} [files] initial files by path
 */
export function createMemoryFs(files = {}) {
  /** @type {Map<string, Uint8Array>} */
  const store = new Map();
  /** @type {Set<string>} */
  const dirs = new Set(['']);
  /** @param {string} dirPath */
  const addDir = (dirPath) => {
    const p = parts(dirPath);
    for (let i = 0; i <= p.length; i++) dirs.add(p.slice(0, i).join('/'));
  };
  /** @param {string} filePath */
  const addParentDirs = (filePath) => addDir(parts(filePath).slice(0, -1).join('/'));

  for (const [path, content] of Object.entries(files)) {
    store.set(path, typeof content === 'string' ? utf8Encoder.encode(content) : new Uint8Array(content));
    addParentDirs(path);
  }

  return {
    /** @param {string} path */
    async readBytes(path) {
      const bytes = store.get(parts(path).join('/'));
      return bytes ? new Uint8Array(bytes) : null;
    },
    /**
     * @param {string} path
     * @param {Uint8Array} bytes
     */
    async writeBytes(path, bytes) {
      const key = parts(path).join('/');
      store.set(key, new Uint8Array(bytes));
      addParentDirs(key);
    },
    /** @param {string} dirPath */
    async mkdir(dirPath) {
      addDir(dirPath);
    },
    /** @param {string} dirPath */
    async list(dirPath) {
      const dir = parts(dirPath).join('/');
      if (!dirs.has(dir)) return [];
      const prefix = dir ? `${dir}/` : '';
      /** @type {{ name: string, kind: 'file' | 'directory' }[]} */
      const out = [];
      for (const key of store.keys()) {
        if (key.startsWith(prefix) && !key.slice(prefix.length).includes('/')) out.push({ name: key.slice(prefix.length), kind: 'file' });
      }
      for (const d of dirs) {
        if (d && d.startsWith(prefix) && !d.slice(prefix.length).includes('/')) out.push({ name: d.slice(prefix.length), kind: 'directory' });
      }
      return out.sort(byName);
    },
    /** Every file path, sorted — for test assertions. */
    paths() {
      return [...store.keys()].sort();
    },
  };
}

/** @param {any} e */
const isMissing = (e) => e?.name === 'NotFoundError' || e?.name === 'TypeMismatchError';

/**
 * Project folder backed by a File System Access directory handle.
 * @param {any} root FileSystemDirectoryHandle chosen by the user
 * @returns {ProjectFs}
 */
export function createHandleFs(root) {
  /**
   * @param {string[]} segments
   * @param {boolean} create
   */
  async function dirHandle(segments, create) {
    let handle = root;
    for (const s of segments) handle = await handle.getDirectoryHandle(s, { create });
    return handle;
  }

  return {
    async readBytes(path) {
      const p = parts(path);
      const name = p.pop();
      try {
        const dir = await dirHandle(p, false);
        const file = await (await dir.getFileHandle(name)).getFile();
        return new Uint8Array(await file.arrayBuffer());
      } catch (e) {
        if (isMissing(e)) return null;
        throw e;
      }
    },
    async writeBytes(path, bytes) {
      const p = parts(path);
      const name = p.pop();
      const dir = await dirHandle(p, true);
      const writable = await (await dir.getFileHandle(name, { create: true })).createWritable();
      await writable.write(bytes);
      await writable.close();
    },
    async mkdir(dirPath) {
      await dirHandle(parts(dirPath), true);
    },
    async list(dirPath) {
      let dir;
      try {
        dir = await dirHandle(parts(dirPath), false);
      } catch (e) {
        if (isMissing(e)) return [];
        throw e;
      }
      /** @type {{ name: string, kind: 'file' | 'directory' }[]} */
      const out = [];
      for await (const [name, handle] of dir.entries()) out.push({ name, kind: handle.kind });
      return out.sort(byName);
    },
  };
}
