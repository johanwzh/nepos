// A routing session on one table set (spec §5–§7): routes every pattern (chain) of stops through the router, one leg
// per stop pair, and turns the results into the line's saved links. One snap per Quay within a line: a Quay's saved
// snap is fixed for every chain; a Quay without one gets the snap of the first chain routed through it. A chain that
// fails is routed again pair by pair, so one bad leg does not lose the others. Nothing is written here: result() is the
// file content Apply writes.
import { routeWithTiles } from './router-core.js';
import { encodePolyline, haversineM } from './geometry.js';
import { MOVED_M } from '../core/link-state.js';

/** @typedef {import('../core/link-pairs.js').QuayRef} QuayRef */
/** @typedef {import('../core/link-state.js').SavedLink} SavedLink */
/** @typedef {import('../project/links-store.js').LineLinks} LineLinks */
/** @typedef {import('./snap.js').SnapRef} SnapRef */
/** @typedef {import('./search.js').ChainPoint} ChainPoint */
/**
 * @typedef {{ key: string, from: QuayRef, to: QuayRef, state: 'routed' | 'no-route' | 'no-road' | 'pending',
 *   link?: SavedLink, flags: string[], via: [number, number][], error?: string }} PairState
 *   error: why a leg could not be tried (routing-offline, routing-bad-tile: its map tiles did not load)
 */

const PRECISION = 6;
const pos = (/** @type {{ lon: number, lat: number }} */ p) => /** @type {[number, number]} */ ([p.lon, p.lat]);

/** The same route as the saved link (then the saved one is kept as it is, routedAt and all). @param {SavedLink} a @param {SavedLink | undefined} b */
const sameLink = (a, b) => !!b && b.status === 'OK' && a.polyline === b.polyline && a.distanceM === b.distanceM
  && JSON.stringify(a.via ?? []) === JSON.stringify(b.via ?? []) && JSON.stringify(a.from) === JSON.stringify(b.from) && JSON.stringify(a.to) === JSON.stringify(b.to);

/**
 * @param {{ code: string, chains: { stops: QuayRef[], keys: string[] }[], lineLinks: LineLinks, quayInfo: Map<string, any>,
 *   router: { has: (key: string) => boolean, addTiles: (e: { key: string, buf: ArrayBuffer }[]) => any, route: (c: ChainPoint[]) => any, close?: () => void },
 *   tiles: import('./tile-source.js').TileSource, now?: () => Date }} opts
 */
export function createRoutingSession({ code, chains, lineLinks, router, tiles, now = () => new Date() }) {
  /** @type {Map<string, PairState>} */
  const pairs = new Map();
  for (const c of chains) c.keys.forEach((key, i) => {
    if (!pairs.has(key)) pairs.set(key, { key, from: c.stops[i], to: c.stops[i + 1], state: 'pending', flags: [], via: lineLinks.links[key]?.via ?? [] });
  });
  /** @type {Record<string, SnapRef>} */
  const snaps = { ...lineLinks.snaps };
  // A Quay NSR has moved since its links were routed snaps again (spec §5: re-routing on purpose may choose again)
  for (const c of chains) for (const q of c.stops) {
    const moved = Object.entries(lineLinks.links).some(([key, l]) => {
      const [a, b] = key.split('|');
      return (a === q.quayId && haversineM(l.from, pos(q)) > MOVED_M) || (b === q.quayId && haversineM(l.to, pos(q)) > MOVED_M);
    });
    if (moved) delete snaps[q.quayId];
  }
  /** @type {import('./tile-source.js').Manifest | null} */
  let manifest = null;
  let newer = false, closed = false;
  const loaded = new Set();
  const loadTile = (/** @type {string} */ key) => { loaded.add(key); return tiles.loadTile(key); };

  /** The chain's points: each stop (fixed to its Quay's snap), the pair's waypoints between. @param {QuayRef[]} stops @param {string[]} keys */
  function points(stops, keys) {
    /** @type {ChainPoint[]} */
    const out = [];
    /** @type {number[]} */
    const at = [];
    stops.forEach((q, i) => {
      if (i) for (const [lon, lat] of /** @type {PairState} */ (pairs.get(keys[i - 1])).via) out.push({ lon, lat, via: true });
      at.push(out.length);
      out.push(snaps[q.quayId] ? { lon: q.lon, lat: q.lat, fixed: snaps[q.quayId] } : { lon: q.lon, lat: q.lat });
    });
    return { out, at };
  }

  /**
   * @param {QuayRef[]} stops @param {string[]} keys @param {boolean} [onlyNew] @param {boolean} [rethrow] a tile that does not
   * load throws (a waypoint); else it fails only these legs (final review I3, 2026-10-31) @returns {Promise<boolean>} routed
   */
  async function route(stops, keys, onlyNew = false, rethrow = false) {
    const { out, at } = points(stops, keys);
    let r;
    try {
      r = await routeWithTiles(router, /** @type {any} */ (manifest), out, loadTile);
    } catch (e) {
      if (rethrow) throw e;
      if (keys.length === 1) Object.assign(/** @type {PairState} */ (pairs.get(keys[0])), { state: 'no-route', link: undefined, flags: [], error: String(/** @type {any} */ (e)?.message ?? e) });
      return false;
    }
    if (!r.ok) {
      if (keys.length === 1) {
        const p = /** @type {PairState} */ (pairs.get(keys[0]));
        Object.assign(p, { state: /** @type {any} */ (r).error === 'no-road' ? 'no-road' : 'no-route', link: undefined, flags: [], error: undefined });
      }
      return false;
    }
    stops.forEach((q, i) => {
      const s = r.snaps[at[i]];
      if (!snaps[q.quayId] || s.refLost) snaps[q.quayId] = { way: s.way, lon: s.lon, lat: s.lat, along: s.along, off: s.off, road: s.road };
    });
    const tilesOf = { set: /** @type {'road'} */ ('road'), built: manifest?.built ?? '', dataDate: manifest?.dataDate ?? '',
      hashes: Object.fromEntries([...loaded].sort().map((k) => [k, manifest?.tiles[k]?.hash ?? ''])) };
    keys.forEach((key, k) => {
      const p = /** @type {PairState} */ (pairs.get(key));
      if (onlyNew && p.state === 'routed') return; // a pair in several chains takes the first chain's result
      const leg = r.legs[k], flags = r.flags?.[k] ?? [];
      /** @type {SavedLink} */
      const link = { polyline: encodePolyline(leg.coords, PRECISION), precision: PRECISION, distanceM: Math.round(leg.metres * 10) / 10,
        status: 'OK', from: pos(p.from), to: pos(p.to), ferryM: Math.round(leg.ferryMetres * 10) / 10, seconds: Math.round(leg.seconds),
        via: p.via, roads: leg.roads, flags, routedAt: now().toISOString(), tiles: tilesOf };
      const saved = lineLinks.links[key];
      Object.assign(p, { state: 'routed', link: saved && sameLink(link, saved) ? saved : link, flags, error: undefined });
    });
    return true;
  }

  /** The chain, else pair by pair (Review Focus 2). @param {QuayRef[]} stops @param {string[]} keys */
  async function routeChain(stops, keys) {
    if (await route(stops, keys, true)) return;
    for (let i = 0; i < keys.length; i++) {
      if (/** @type {PairState} */ (pairs.get(keys[i])).state !== 'routed') await route([stops[i], stops[i + 1]], [keys[i]]);
    }
  }

  return {
    /** @param {(done: number, total: number) => void} [onProgress] */
    async start(onProgress) {
      // every Quay once, and the saved waypoints
      const quays = new Map(chains.flatMap((c) => c.stops.map((q) => [q.quayId, { lon: q.lon, lat: q.lat }])));
      const via = [...pairs.values()].flatMap((p) => p.via.map(([lon, lat]) => ({ lon, lat })));
      const opened = await tiles.open([...quays.values(), ...via]);
      manifest = opened.manifest; newer = opened.newer;
      for (const [i, c] of chains.entries()) {
        if (closed) return;
        if (!c.keys.every((k) => pairs.get(k)?.state === 'routed')) await routeChain(c.stops, c.keys);
        onProgress?.(i + 1, chains.length);
      }
    },

    /** @returns {PairState[]} in the order first met */
    pairs: () => [...pairs.values()],

    /** New waypoints for one pair; routes that pair again (its Quays' snaps are fixed, direction and all).
     *  @param {string} key @param {[number, number][]} via */
    async setWaypoints(key, via) {
      const p = pairs.get(key);
      if (!p || !manifest) return;
      const was = p.via;
      p.via = via;
      try { await route([p.from, p.to], [key], false, true); } catch (e) { p.via = was; throw e; }
    },

    /** The links file Apply writes: the old file with this session's routed pairs replaced. @returns {LineLinks} */
    result() {
      const links = { ...lineLinks.links };
      for (const p of pairs.values()) if (p.state === 'routed' && p.link) links[p.key] = p.link;
      return { version: 1, line: code, links, snaps: { ...snaps } };
    },

    /** Anything to save: a routed pair that differs from the saved file, or a new snap. */
    dirty() {
      for (const p of pairs.values()) if (p.state === 'routed' && p.link !== lineLinks.links[p.key]) return true;
      return Object.keys(snaps).some((q) => snaps[q] !== lineLinks.snaps[q]);
    },

    newerMap: () => newer,

    close() {
      closed = true;
      router.close?.();
    },
  };
}
