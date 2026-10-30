// The routing web worker: one router, messages { id, op: 'addTiles' | 'route', entries | chain } -> { id, result | error }.
import { createRouter } from './router-core.js';

const router = createRouter();
const scope = /** @type {any} */ (self);

scope.onmessage = (/** @type {MessageEvent} */ ev) => {
  const { id, op, entries, chain } = ev.data;
  try {
    const result = op === 'addTiles' ? router.addTiles(entries) : op === 'route' ? router.route(chain) : null;
    if (result === null) throw new Error(`unknown op ${op}`);
    scope.postMessage({ id, result });
  } catch (err) {
    scope.postMessage({ id, error: String(err?.message ?? err) });
  }
};
