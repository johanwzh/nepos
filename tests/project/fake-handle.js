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
  /**
   * @param {string} [name]
   * @param {{ caseInsensitive?: boolean }} [opts] behave like Windows: names match regardless of case
   */
  constructor(name = '', { caseInsensitive = false } = {}) {
    this.kind = 'directory';
    this.name = name;
    this.caseInsensitive = caseInsensitive;
    /** @type {Map<string, any>} key is the name, lower-cased when case-insensitive */
    this.children = new Map();
  }

  /** @param {string} name */
  key(name) {
    return this.caseInsensitive ? name.toLowerCase() : name;
  }

  /**
   * @param {string} name
   * @param {{ create?: boolean }} [opts]
   */
  async getDirectoryHandle(name, { create = false } = {}) {
    const child = this.children.get(this.key(name));
    if (child) {
      if (child.kind !== 'directory') throw mismatch(name);
      return child;
    }
    if (!create) throw notFound(name);
    const dir = new FakeDir(name, { caseInsensitive: this.caseInsensitive });
    this.children.set(this.key(name), dir);
    return dir;
  }

  /**
   * @param {string} name
   * @param {{ create?: boolean }} [opts]
   */
  async getFileHandle(name, { create = false } = {}) {
    const child = this.children.get(this.key(name));
    if (child) {
      if (child.kind !== 'file') throw mismatch(name);
      return child;
    }
    if (!create) throw notFound(name);
    const file = new FakeFile(name);
    this.children.set(this.key(name), file);
    return file;
  }

  /** @param {string} name */
  async removeEntry(name) {
    if (!this.children.delete(this.key(name))) throw notFound(name);
  }

  async *entries() {
    for (const child of this.children.values()) yield [child.name, child];
  }
}
