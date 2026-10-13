// Minimal stand-in for the browser's FileSystemDirectoryHandle — just enough for createHandleFs.

/** @param {string} name */
const notFound = (name) => new DOMException(`${name} not found`, 'NotFoundError');
/** @param {string} name */
const mismatch = (name) => new DOMException(`${name} is the wrong kind`, 'TypeMismatchError');

export class FakeFile {
  /** @param {string} name */
  constructor(name) {
    this.kind = 'file';
    this.name = name;
    this.data = new Uint8Array();
  }

  async getFile() {
    const data = this.data;
    return { size: data.length, arrayBuffer: async () => data.slice().buffer };
  }

  async createWritable() {
    let pending = new Uint8Array();
    return {
      write: async (/** @type {Uint8Array} */ bytes) => { pending = new Uint8Array(bytes); },
      close: async () => { this.data = pending; },
    };
  }
}

export class FakeDir {
  /** @param {string} [name] */
  constructor(name = '') {
    this.kind = 'directory';
    this.name = name;
    /** @type {Map<string, any>} */
    this.children = new Map();
  }

  /**
   * @param {string} name
   * @param {{ create?: boolean }} [opts]
   */
  async getDirectoryHandle(name, { create = false } = {}) {
    const child = this.children.get(name);
    if (child) {
      if (child.kind !== 'directory') throw mismatch(name);
      return child;
    }
    if (!create) throw notFound(name);
    const dir = new FakeDir(name);
    this.children.set(name, dir);
    return dir;
  }

  /**
   * @param {string} name
   * @param {{ create?: boolean }} [opts]
   */
  async getFileHandle(name, { create = false } = {}) {
    const child = this.children.get(name);
    if (child) {
      if (child.kind !== 'file') throw mismatch(name);
      return child;
    }
    if (!create) throw notFound(name);
    const file = new FakeFile(name);
    this.children.set(name, file);
    return file;
  }

  async *entries() {
    for (const entry of this.children) yield entry;
  }
}
