// The router behind the worker: holds the joined graph of the tiles loaded so far and routes chains on it. With a
// vehicle (backlog 92, design 2026-11-03 §5) it routes twice, with the limits and without them, so a leg that went
// round names what blocked the shorter road and carries the route it would have taken.
import { decodeTile } from './tile-format.js';
import { addTiles as joinTiles, buildGraph } from './graph.js';
import { routeChain } from './search.js';
import { legFlags } from './flags.js';
import { tilesForChain } from './tile-select.js';
import { rulesFor } from './rules.js';
import { placeRoute } from './place.js';
import { pointAt } from './edge-geometry.js';
import { KINDS, isOver } from '../core/vehicle-limits.js';

/** @typedef {import('./search.js').ChainPoint} ChainPoint */
/** @typedef {import('../core/vehicle-limits.js').Sizes} Sizes */
/** @typedef {import('../core/vehicle-limits.js').LimitAt} LimitAt */
/**
 * A leg that went round (a vehicle with sizes): around, the limits that closed the route without limits; free, that
 * route. no-route-vehicle: there is a route only without the limits.
 * @typedef {import('./search.js').Leg & { around?: LimitAt[], free?: [number, number][] }} RoutedLeg
 * @typedef {({ ok: true, legs: RoutedLeg[], snaps: import('./search.js').Snap[], ms: number, settled: number, flags?: ('detour' | 'far-snap')[][] })
 *   | { ok: false, error: 'no-road' | 'no-route', point?: number, leg?: number, blockedSnap?: { point: number, edge: number } }
 *   | { ok: false, error: 'no-route-vehicle', leg: number, around: LimitAt[], free: [number, number][], point?: number, blockedSnap?: { point: number, edge: number } }} RouteResult
 */
/** @typedef {{ vehicle?: Sizes, uturnLength?: number }} RouteOpts */

const LIMIT_ARRAYS = /** @type {const} */ ({ height: ['maxheight', 100], width: ['maxwidth', 100], length: ['maxlength', 10], weight: ['maxweight', 10] });

/** The limits of edge e this vehicle is over, at the edge's middle. @param {import('./graph.js').Graph} G @param {number} e @param {Sizes} v @returns {LimitAt[]} */
function overOn(G, e, v) {
  /** @type {LimitAt[]} */
  const out = [];
  for (const kind of KINDS) {
    const [arr, res] = LIMIT_ARRAYS[kind];
    if (!isOver(kind, G[arr][e], v[kind])) continue;
    const [lon, lat] = pointAt(G, e, G.len[e] / 2);
    out.push({ kind, value: Math.round(G[arr][e] * res) / res, way: G.way[e], road: G.road(e), at: [lon, lat] });
  }
  return out;
}

/** What blocks a vehicle along these edges, once per way and kind. @param {import('./graph.js').Graph} G @param {number[]} edges @param {Sizes} v */
function blockers(G, edges, v) {
  /** @type {Map<string, LimitAt>} */
  const out = new Map();
  for (const e of edges) for (const l of overOn(G, e, v)) if (!out.has(`${l.way}|${l.kind}`)) out.set(`${l.way}|${l.kind}`, l);
  return [...out.values()];
}

const sameCoords = (/** @type {[number, number][]} */ a, /** @type {[number, number][]} */ b) => a.length === b.length && a.every((c, i) => c[0] === b[i][0] && c[1] === b[i][1]);

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
    /** @param {ChainPoint[]} chain @param {RouteOpts} [opts] @returns {RouteResult} */
    route(chain, opts = {}) {
      const v = opts.vehicle && Object.keys(opts.vehicle).length ? opts.vehicle : null;
      const r = /** @type {any} */ (routeChain(G, chain, opts));
      if (!r.ok) {
        if (!v) return r;
        // Is there a route without the limits? Then this vehicle is what stops it
        const free = routeChain(G, chain, { ...opts, vehicle: undefined });
        if (!free.ok) return r;
        const leg = r.leg ?? 0, l = free.legs[Math.min(leg, free.legs.length - 1)];
        const around = r.blockedSnap ? overOn(G, r.blockedSnap.edge, v) : blockers(G, l.edges, v);
        return { ...r, error: 'no-route-vehicle', leg, around, free: l.coords };
      }
      if (v) {
        // The same chain without limits, on the chain's own saved snaps: a new stop may snap elsewhere without limits (a
        // stop where a low road meets an open one). A leg that differs without a blocker on it counts as the same.
        const free = routeChain(G, chain, { ...opts, vehicle: undefined });
        if (free.ok) r.legs.forEach((/** @type {RoutedLeg} */ leg, /** @type {number} */ k) => {
          const f = free.legs[k];
          if (!f || sameCoords(leg.coords, f.coords)) return;
          const around = blockers(G, f.edges, v);
          if (around.length) { leg.around = around; leg.free = f.coords; }      // differing without a blocker: a tie
        });
      }
      const stops = chain.map((p, i) => i).filter((i) => i === 0 || i === chain.length - 1 || !chain[i].via);
      const flags = r.legs.map((leg, k) => {
        const f = legFlags(leg, chain[stops[k]], chain[stops[k + 1]], r.snaps[stops[k + 1]], farSnap);
        // the first stop's snap has no leg ending at it: flag it on the first leg
        if (k === 0 && r.snaps[0].off > farSnap && !f.includes('far-snap')) f.push('far-snap');
        return f;
      });
      return { ...r, flags };
    },
    /** The lowest limits along a saved route, without routing it (§8). @param {[number, number][]} coords */
    place: (coords) => placeRoute(G, coords),
  };
}

/**
 * Load the tiles a chain needs and route it; when there is no route, widen the ring of tiles and try again.
 * Works with the in-process router and with the worker client (both may answer with promises).
 * @param {{ has: (key: string) => boolean, addTiles: (e: { key: string, buf: ArrayBuffer }[]) => any, route: (c: ChainPoint[], o?: RouteOpts) => any }} router
 * @param {{ tileLon: number, tileLat: number, tiles: Record<string, any> }} manifest
 * @param {ChainPoint[]} chain
 * @param {(key: string) => Promise<ArrayBuffer>} loadTile unzipped tile bytes
 * @param {number} [maxRing] @param {RouteOpts} [opts] the vehicle and its U-turn length
 * @returns {Promise<RouteResult>}
 */
export async function routeWithTiles(router, manifest, chain, loadTile, maxRing = 3, opts = {}) {
  let result;
  for (let ring = 1; ring <= maxRing; ring++) {
    const missing = tilesForChain(manifest, chain, ring).filter((k) => !router.has(k));
    if (missing.length) await router.addTiles(await Promise.all(missing.map(async (key) => ({ key, buf: await loadTile(key) }))));
    else if (result) continue;
    result = await router.route(chain, opts);
    // a detour may lie beyond the tiles loaded: widen for it too, unless a stop itself is closed to the vehicle
    const retry = result.error === 'no-route' || (result.error === 'no-route-vehicle' && !result.blockedSnap);
    if (result.ok || !retry) return result;
  }
  return result;
}
