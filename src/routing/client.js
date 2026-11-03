// The page's side of the routing worker: requests are matched to replies by id. Tiles go over unzipped.

/** @typedef {import('./search.js').ChainPoint} ChainPoint */

/** @param {() => Worker} [makeWorker] @param {import('./profiles.js').Profile} [profile] the network the worker routes on */
export function createRoutingClient(makeWorker = () => new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }), profile = 'bus') {
  const worker = makeWorker(), pending = new Map(), loaded = new Set();
  let next = 1, closed = false;
  worker.onmessage = (ev) => {
    const { id, result, error } = ev.data, p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    error ? p.reject(new Error(error)) : p.resolve(result);
  };
  const call = (msg, transfer = []) => new Promise((resolve, reject) => {
    // a dead worker never answers: reject at once (final review I1, 2026-10-31)
    if (closed) { reject(new Error('routing closed')); return; }
    const id = next++;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, profile, ...msg }, transfer);
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
    /** @param {ChainPoint[]} chain @param {import('./router-core.js').RouteOpts} [opts] @returns {Promise<import('./router-core.js').RouteResult>} */
    route: (chain, opts) => /** @type {Promise<any>} */ (call({ op: 'route', chain, opts })),
    /** The lowest limits along a saved route (design 2026-11-03 §8). @param {[number, number][]} coords
     *  @returns {Promise<{ limits: import('../core/vehicle-limits.js').Limits, matched: boolean }>} */
    place: (coords) => /** @type {Promise<any>} */ (call({ op: 'place', coords })),
    close() {
      closed = true;
      worker.terminate();
      for (const p of pending.values()) p.reject(new Error('routing closed'));
      pending.clear();
    },
  };
}
