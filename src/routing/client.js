// The page's side of the routing worker: requests are matched to replies by id. Tiles go over unzipped.

/** @typedef {import('./search.js').ChainPoint} ChainPoint */

/** @param {() => Worker} [makeWorker] */
export function createRoutingClient(makeWorker = () => new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })) {
  const worker = makeWorker(), pending = new Map(), loaded = new Set();
  let next = 1;
  worker.onmessage = (ev) => {
    const { id, result, error } = ev.data, p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    error ? p.reject(new Error(error)) : p.resolve(result);
  };
  const call = (msg, transfer = []) => new Promise((resolve, reject) => {
    const id = next++;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, ...msg }, transfer);
  });
  return {
    /** @param {{ key: string, buf: ArrayBuffer }[]} entries @returns {Promise<string[]>} */
    async addTiles(entries) {
      const keys = /** @type {string[]} */ (await call({ op: 'addTiles', entries }, entries.map((e) => e.buf)));
      keys.forEach((k) => loaded.add(k));
      return keys;
    },
    /** @param {string} key */
    has: (key) => loaded.has(key),
    /** @param {ChainPoint[]} chain @returns {Promise<import('./router-core.js').RouteResult>} */
    route: (chain) => /** @type {Promise<any>} */ (call({ op: 'route', chain })),
    close() {
      worker.terminate();
      for (const p of pending.values()) p.reject(new Error('routing closed'));
      pending.clear();
    },
  };
}
