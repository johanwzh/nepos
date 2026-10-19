// The ShapeEngine (Lasse's spec: engine API): the page's handle on the routing worker. Each request has an id; a
// new request for the same link cancels the one in flight (its promise resolves as ERROR "cancelled"), so a burst of
// edits never queues up stale work. The worker is made from worker.js unless one is given (tests).
import { SOURCES } from './profiles.js';
import { linkKey } from './engine.js';

/** @typedef {{ postMessage: (msg: any) => void, onmessage: ((ev: { data: any }) => void) | null, terminate: () => void }} WorkerLike */

/**
 * @param {{ styleSource: { tiles: string[], maxzoom: number, buildId: string }, worker?: WorkerLike,
 *           budget?: number, concurrency?: number }} opts
 */
export function createShapeEngine({ styleSource, worker, budget = SOURCES.default.budget, concurrency = SOURCES.default.concurrency }) {
  const w = /** @type {WorkerLike} */ (worker ?? new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }));
  let nextId = 1;
  let used = 0;
  /** @type {Map<number, { key: string, resolve: (r: any) => void, request: any }>} */
  const pending = new Map();
  /** @type {Map<string, number>} link key → the id of its latest request */
  const latest = new Map();

  const cancelled = (/** @type {any} */ req) => ({ key: linkKey(req.from, req.to, req.profile), status: 'ERROR', from: req.from, to: req.to, profile: req.profile,
    coordinates: [[req.from.lon, req.from.lat], [req.to.lon, req.to.lat]], distanceM: 0, arriveBearing: null, warnings: ['cancelled'], source: styleSource.buildId, engine: 0 });

  w.onmessage = (ev) => {
    const msg = ev.data;
    if (msg?.type !== 'result') return;
    if (typeof msg.tilesUsed === 'number') used = msg.tilesUsed;
    const p = pending.get(msg.id);
    if (!p) return; // cancelled meanwhile
    pending.delete(msg.id);
    if (latest.get(p.key) === msg.id) latest.delete(p.key);
    p.resolve(msg.result ?? { ...cancelled(p.request), warnings: [msg.error ?? 'error'] });
  };
  w.postMessage({ type: 'init', tiles: styleSource.tiles, buildId: styleSource.buildId, budget, concurrency });

  return {
    /**
     * @param {{ quayId: string, lon: number, lat: number }} from @param {{ quayId: string, lon: number, lat: number }} to
     * @param {import('./profiles.js').Profile | null} profile @param {{ arriveBearing?: number | null }} [opts]
     * @returns {Promise<import('./engine.js').LinkResult>}
     */
    shapeLink(from, to, profile, opts = {}) {
      const key = linkKey(from, to, profile);
      const before = latest.get(key);
      if (before !== undefined) {
        const p = pending.get(before);
        if (p) { pending.delete(before); p.resolve(cancelled(p.request)); }
      }
      const id = nextId++;
      latest.set(key, id);
      const request = { from, to, profile };
      return new Promise((resolve) => {
        pending.set(id, { key, resolve, request });
        w.postMessage({ type: 'shape', id, from, to, profile, opts });
      });
    },
    tilesUsed: () => used,
    dispose() {
      for (const [, p] of pending) p.resolve(cancelled(p.request));
      pending.clear();
      latest.clear();
      w.terminate();
    },
  };
}

/** @typedef {ReturnType<typeof createShapeEngine>} ShapeEngine */
