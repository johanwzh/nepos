// The routing web worker: one router, messages { id, op: 'addTiles' | 'route' | 'place', profile, entries | chain + opts | coords }
// -> { id, result | error }.
// The router is made on the first message, for its profile (routing for all modes: one network per worker).
import { createRouter } from './router-core.js';

/** @type {ReturnType<typeof createRouter> | null} */
let router = null;
const scope = /** @type {any} */ (self);

scope.onmessage = (/** @type {MessageEvent} */ ev) => {
  const { id, op, entries, chain, opts, coords, profile } = ev.data;
  try {
    router ??= createRouter(profile);
    const result = op === 'addTiles' ? router.addTiles(entries) : op === 'route' ? router.route(chain, opts) : op === 'place' ? router.place(coords) : null;
    if (result === null) throw new Error(`unknown op ${op}`);
    scope.postMessage({ id, result });
  } catch (err) {
    scope.postMessage({ id, error: String(err?.message ?? err) });
  }
};
