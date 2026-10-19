// What the routing worker does with a message, apart from the worker itself (so tests run it in-process):
// 'init' makes the engine core with a fetch of the map's own tile template; 'shape' routes one link and posts the
// result back with the request id and the tiles used so far.
import { createEngineCore } from './engine.js';

/**
 * Fetch one vector tile from a {z}/{x}/{y} template: 404 = no tile (empty), other failures throw.
 * @param {string} template @param {number} z @param {number} x @param {number} y
 */
export async function fetchTemplateTile(template, z, x, y) {
  const res = await fetch(template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y)));
  if (res.status === 404 || res.status === 204) return null;
  if (!res.ok) throw new Error(`tile ${z}/${x}/${y}: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * @param {(msg: any) => void} post
 * @param {{ makeCore?: (init: any) => { shapeLink: Function, tilesUsed: () => number } }} [opts]
 */
export function createWorkerHandler(post, { makeCore } = {}) {
  /** @type {{ shapeLink: Function, tilesUsed: () => number } | null} */
  let core = null;
  const make = makeCore ?? ((/** @type {any} */ init) => createEngineCore({
    fetchTile: (z, x, y) => fetchTemplateTile(init.tiles[0], z, x, y), source: init.buildId,
    budget: init.budget, concurrency: init.concurrency, maxTiles: init.maxTiles,
  }));
  return async (/** @type {any} */ msg) => {
    if (msg.type === 'init') { core = make(msg); return; }
    if (msg.type !== 'shape') return;
    if (!core) core = make(msg.init ?? {});
    try {
      const result = await core.shapeLink(msg.from, msg.to, msg.profile, msg.opts ?? {});
      post({ type: 'result', id: msg.id, result, tilesUsed: core.tilesUsed() });
    } catch (e) {
      post({ type: 'result', id: msg.id, error: String(/** @type {Error} */ (e)?.message ?? e), tilesUsed: core.tilesUsed() });
    }
  };
}
