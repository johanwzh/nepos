// The router behind the worker: holds the joined graph of the tiles loaded so far and routes chains on it.
import { decodeTile } from './tile-format.js';
import { addTiles as joinTiles, buildGraph } from './graph.js';
import { routeChain } from './search.js';
import { legFlags } from './flags.js';
import { tilesForChain } from './tile-select.js';
import { rulesFor } from './rules.js';

/** @typedef {import('./search.js').ChainPoint} ChainPoint */
/** @typedef {import('./search.js').ChainResult & { flags?: ('detour' | 'far-snap')[][] }} RouteResult */

/** @param {import('./profiles.js').Profile} [profile] the network's rules (routing for all modes) */
export function createRouter(profile = 'bus') {
  let G = buildGraph([], profile);
  const farSnap = rulesFor(profile).farSnap;
  return {
    /** Unzipped tiles. @param {{ key: string, buf: ArrayBuffer }[]} entries @returns {string[]} the keys now loaded */
    addTiles(entries) {
      G = joinTiles(G, entries.filter((t) => !G.keys.has(t.key)).map(({ key, buf }) => ({ key, tile: decodeTile(buf) })));
      return [...G.keys];
    },
    /** @param {string} key */
    has: (key) => G.keys.has(key),
    /** @param {ChainPoint[]} chain @param {{ vehicle?: import('../core/vehicle-limits.js').Sizes, uturnLength?: number }} [opts] @returns {RouteResult} */
    route(chain, opts = {}) {
      const r = routeChain(G, chain, opts);
      if (!r.ok) return r;
      const stops = chain.map((p, i) => i).filter((i) => i === 0 || i === chain.length - 1 || !chain[i].via);
      const flags = r.legs.map((leg, k) => {
        const f = legFlags(leg, chain[stops[k]], chain[stops[k + 1]], r.snaps[stops[k + 1]], farSnap);
        // the first stop's snap has no leg ending at it: flag it on the first leg
        if (k === 0 && r.snaps[0].off > farSnap && !f.includes('far-snap')) f.push('far-snap');
        return f;
      });
      return { ...r, flags };
    },
  };
}

/**
 * Load the tiles a chain needs and route it; when there is no route, widen the ring of tiles and try again.
 * Works with the in-process router and with the worker client (both may answer with promises).
 * @param {{ has: (key: string) => boolean, addTiles: (e: { key: string, buf: ArrayBuffer }[]) => any, route: (c: ChainPoint[]) => any }} router
 * @param {{ tileLon: number, tileLat: number, tiles: Record<string, any> }} manifest
 * @param {ChainPoint[]} chain
 * @param {(key: string) => Promise<ArrayBuffer>} loadTile unzipped tile bytes
 * @param {number} [maxRing]
 * @returns {Promise<RouteResult>}
 */
export async function routeWithTiles(router, manifest, chain, loadTile, maxRing = 3) {
  let result;
  for (let ring = 1; ring <= maxRing; ring++) {
    const missing = tilesForChain(manifest, chain, ring).filter((k) => !router.has(k));
    if (missing.length) await router.addTiles(await Promise.all(missing.map(async (key) => ({ key, buf: await loadTile(key) }))));
    else if (result) continue;
    result = await router.route(chain);
    if (result.ok || result.error !== 'no-route') return result;
  }
  return result;
}
