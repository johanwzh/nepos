// A routing session on one table set (routing editor, 2026-10-31): the user is in control. Opening it reads the links
// file and the published road build's date, and routes nothing. Route makes a *proposal* for one journey pattern (or one
// leg of it); Accept turns the proposal into the line's links, Keep marks out-of-date legs as reviewed, Discard drops
// it. Nothing is written here: accept() and keep() return the file the view writes. One snap per Quay within a line: a
// Quay's saved snap is fixed; a Quay without one (or one NSR has moved) gets the snap of the first route through it. A
// run of legs that fails is routed again leg by leg, so one bad leg does not lose the others.
import { routeWithTiles } from './router-core.js';
import { encodePolyline, haversineM } from './geometry.js';
import { MOVED_M } from '../core/link-state.js';
import { tablePatterns, patternStates } from '../core/route-patterns.js';

/** @typedef {import('../core/link-pairs.js').QuayRef} QuayRef */
/** @typedef {import('../core/link-state.js').SavedLink} SavedLink */
/** @typedef {import('../project/links-store.js').LineLinks} LineLinks */
/** @typedef {import('../core/route-patterns.js').Pattern} Pattern */
/** @typedef {import('../core/route-patterns.js').PatternState} PatternState */
/** @typedef {import('./snap.js').SnapRef} SnapRef */
/** @typedef {import('./search.js').ChainPoint} ChainPoint */
/** @typedef {[number, number]} LonLat */
/**
 * legs: each routed or failed leg by key (a failed one: why); via: the waypoints set in this proposal; old: a changed
 * leg's key → the key of the leg it replaced (the comparison draws the old route).
 * @typedef {{ legs: Map<string, SavedLink | { state: 'no-route' | 'no-road', error?: string }>, via: Map<string, LonLat[]>, old: Map<string, string> }} Proposal
 */

const PRECISION = 6;
const pos = (/** @type {{ lon: number, lat: number }} */ p) => /** @type {LonLat} */ ([p.lon, p.lat]);

/** The same route as the saved link (then the saved one is kept as it is, routedAt and all). @param {SavedLink} a @param {SavedLink | undefined} b */
const sameLink = (a, b) => !!b && b.status === 'OK' && a.polyline === b.polyline && a.distanceM === b.distanceM
  && JSON.stringify(a.via ?? []) === JSON.stringify(b.via ?? []) && JSON.stringify(a.from) === JSON.stringify(b.from) && JSON.stringify(a.to) === JSON.stringify(b.to);
const isLink = (/** @type {any} */ l) => l?.status === 'OK';

/**
 * @param {{ code: string, rs: any, setId: number, calendars: import('../core/calendars.js').Calendar[], lineLinks: LineLinks,
 *   quayInfo: Map<string, any>,
 *   router: { has: (key: string) => boolean, addTiles: (e: { key: string, buf: ArrayBuffer }[]) => any, route: (c: ChainPoint[]) => any, close?: () => void },
 *   tiles: import('./tile-source.js').TileSource, now?: () => Date }} opts
 */
export function createRoutingSession({ code, rs, setId, calendars, lineLinks, quayInfo, router, tiles, now = () => new Date() }) {
  const patterns = tablePatterns(rs, { calendars, quayInfo, setId });
  const byId = new Map(patterns.map((p) => [p.id, p]));
  let file = lineLinks;
  let publishedBuilt = '';
  /** @type {Map<string, Proposal>} */
  const proposals = new Map();
  /** @type {Record<string, SnapRef>} */
  const snaps = { ...lineLinks.snaps };
  // A Quay NSR has moved since its links were routed snaps again (spec §5: re-routing on purpose may choose again)
  for (const p of patterns) for (const s of p.stops) {
    const q = s.quay;
    if (!q) continue;
    const moved = Object.entries(lineLinks.links).some(([key, l]) => {
      const [a, b] = key.split('|');
      return (a === q.quayId && haversineM(l.from, pos(q)) > MOVED_M) || (b === q.quayId && haversineM(l.to, pos(q)) > MOVED_M);
    });
    if (moved) delete snaps[q.quayId];
  }
  /** @type {import('./tile-source.js').Manifest | null} */
  let manifest = null;
  let newer = false;
  const loaded = new Set();
  const loadTile = (/** @type {string} */ key) => { loaded.add(key); return tiles.loadTile(key); };

  const states = () => patternStates(patterns, file, { quayInfo, publishedBuilt });
  const stateOf = (/** @type {string} */ id) => /** @type {PatternState} */ (states().find((s) => s.pattern.id === id));
  /** @param {string} id */
  const proposalOf = (id) => {
    let p = proposals.get(id);
    if (!p) { p = { legs: new Map(), via: new Map(), old: new Map() }; proposals.set(id, p); }
    return p;
  };
  /** The waypoints a leg is routed through: set in the proposal, else saved. @param {Proposal | undefined} pr @param {string} key */
  const viaOf = (pr, key) => pr?.via.get(key) ?? file.links[key]?.via ?? [];

  /** The road build, once, on the first Route (never on open). */
  async function openTiles() {
    if (manifest) return;
    /** @type {{ lon: number, lat: number }[]} */
    const points = [];
    for (const p of patterns) {
      for (const s of p.stops) if (s.quay) points.push({ lon: s.quay.lon, lat: s.quay.lat });
      for (const k of p.keys) if (k) for (const [lon, lat] of viaOf(proposals.get(p.id), k)) points.push({ lon, lat });
    }
    // The newest published build: Route on an orange "newer map data" pattern compares with that (final review 1)
    const opened = await tiles.open(points, { latest: true });
    manifest = opened.manifest; newer = opened.newer;
  }

  /**
   * Routes a run of consecutive stops; the results land in the proposal. @param {Proposal} pr @param {QuayRef[]} stops
   * @param {string[]} keys @param {boolean} [rethrow] a tile that does not load throws (a waypoint); else it fails only
   * these legs (final review I3) @returns {Promise<boolean>} routed
   */
  async function route(pr, stops, keys, rethrow = false) {
    /** @type {ChainPoint[]} */
    const out = [];
    /** @type {number[]} */
    const at = [];
    stops.forEach((q, i) => {
      if (i) for (const [lon, lat] of viaOf(pr, keys[i - 1])) out.push({ lon, lat, via: true });
      at.push(out.length);
      out.push(snaps[q.quayId] ? { lon: q.lon, lat: q.lat, fixed: snaps[q.quayId] } : { lon: q.lon, lat: q.lat });
    });
    let r;
    try {
      r = await routeWithTiles(router, /** @type {any} */ (manifest), out, loadTile);
    } catch (e) {
      if (rethrow) throw e;
      if (keys.length === 1) pr.legs.set(keys[0], { state: 'no-route', error: String(/** @type {any} */ (e)?.message ?? e) });
      return false;
    }
    if (!r.ok) {
      if (keys.length === 1) pr.legs.set(keys[0], { state: /** @type {any} */ (r).error === 'no-road' ? 'no-road' : 'no-route' });
      return false;
    }
    stops.forEach((q, i) => {
      const s = r.snaps[at[i]];
      if (!snaps[q.quayId] || s.refLost) snaps[q.quayId] = { way: s.way, lon: s.lon, lat: s.lat, along: s.along, off: s.off, road: s.road };
    });
    const tilesOf = { set: /** @type {'road'} */ ('road'), built: manifest?.built ?? '', dataDate: manifest?.dataDate ?? '',
      hashes: Object.fromEntries([...loaded].sort().map((k) => [k, manifest?.tiles[k]?.hash ?? ''])) };
    keys.forEach((key, k) => {
      const leg = r.legs[k], flags = r.flags?.[k] ?? [];
      /** @type {SavedLink} */
      const link = { polyline: encodePolyline(leg.coords, PRECISION), precision: PRECISION, distanceM: Math.round(leg.metres * 10) / 10,
        status: 'OK', from: pos(stops[k]), to: pos(stops[k + 1]), ferryM: Math.round(leg.ferryMetres * 10) / 10, seconds: Math.round(leg.seconds),
        via: viaOf(pr, key), roads: leg.roads, flags, routedAt: now().toISOString(), tiles: tilesOf };
      const saved = file.links[key];
      if (!saved || !sameLink(link, saved)) { pr.legs.set(key, link); return; }
      // The same route on a newer build: kept as it is, marked checked against that build (not a metre changes)
      const built = [saved.tiles?.built ?? '', saved.reviewed?.built ?? ''].sort().pop() ?? '';
      pr.legs.set(key, manifest?.built && built < manifest.built ? { ...saved, reviewed: { ...saved.reviewed, built: manifest.built } } : saved);
    });
    return true;
  }

  /**
   * Routes these legs of the pattern: runs of consecutive legs together, a run that fails leg by leg.
   * @param {Pattern} p @param {Proposal} pr @param {Set<number>} which leg indexes
   */
  async function routeLegs(p, pr, which) {
    for (let i = 0; i < p.keys.length; i++) {
      if (!which.has(i)) continue;
      let j = i;
      while (j + 1 < p.keys.length && which.has(j + 1)) j++;
      const stops = /** @type {QuayRef[]} */ (p.stops.slice(i, j + 2).map((s) => s.quay));
      const keys = /** @type {string[]} */ (p.keys.slice(i, j + 1));
      if (!(await route(pr, stops, keys)) && keys.length > 1) {
        for (let k = 0; k < keys.length; k++) await route(pr, [stops[k], stops[k + 1]], [keys[k]]);
      }
      i = j;
    }
  }

  return {
    /** The published road build's date (newer map data is orange); no tiles, no routing. */
    async open() {
      publishedBuilt = (await tiles.published().catch(() => null))?.built ?? '';
    },

    /** @returns {(PatternState & { proposal: Proposal | null })[]} the patterns as saved, each with its proposal */
    states: () => states().map((s) => ({ ...s, proposal: proposals.get(s.pattern.id) ?? null })),

    /** @param {string} id @returns {Proposal | null} */
    proposal: (id) => proposals.get(id) ?? null,

    /**
     * Proposes a route for the pattern, or one leg of it. The pattern: its legs that are not routed and those whose
     * waypoints changed; a green pattern with nothing changed, every leg. @param {string} id @param {string} [key]
     */
    async route(id, key) {
      const p = byId.get(id);
      if (!p) return;
      await openTiles();
      const st = stateOf(id);
      const pr = proposalOf(id);
      /** @type {Set<number>} */
      const which = new Set();
      p.keys.forEach((k, i) => {
        if (!k || (key && k !== key)) return;
        const viaChanged = pr.via.has(k) && JSON.stringify(pr.via.get(k)) !== JSON.stringify(file.links[k]?.via ?? []);
        if (key || st.legs[i].state !== 'routed' || viaChanged) which.add(i);
      });
      if (!which.size) p.keys.forEach((k, i) => { if (k) which.add(i); });
      st.legs.forEach((l, i) => { if (l.oldKey && which.has(i)) pr.old.set(/** @type {string} */ (l.key), l.oldKey); });
      await routeLegs(p, pr, which);
    },

    /**
     * New waypoints for one leg. Stored only until the leg has a proposal (place points first on a long leg); then that
     * leg is routed again. @param {string} id @param {string} key @param {LonLat[]} via
     */
    async setWaypoints(id, key, via) {
      const p = byId.get(id);
      const i = p?.keys.indexOf(key) ?? -1;
      if (!p || i < 0) return;
      const pr = proposalOf(id);
      const had = pr.via.get(key);
      pr.via.set(key, via);
      if (!pr.legs.has(key)) return;
      try {
        await openTiles();
        await route(pr, [/** @type {QuayRef} */ (p.stops[i].quay), /** @type {QuayRef} */ (p.stops[i + 1].quay)], [key], true);
      } catch (e) {
        if (had) pr.via.set(key, had); else pr.via.delete(key);
        throw e;
      }
    },

    /**
     * The proposal becomes the line's links, and the pattern is recorded (its stops, keys and trips). A leg that failed
     * keeps its old link. @param {string} id @returns {Promise<LineLinks>} the file to write
     */
    async accept(id) {
      const p = byId.get(id);
      const pr = proposals.get(id);
      if (!p) return file;
      const links = { ...file.links };
      for (const [k, l] of pr?.legs ?? []) if (isLink(l)) links[k] = /** @type {SavedLink} */ (l);
      const nextSnaps = { ...file.snaps };
      for (const s of p.stops) if (s.quay && snaps[s.quay.quayId]) nextSnaps[s.quay.quayId] = snaps[s.quay.quayId];
      const traced = stateOf(id).saved;
      const pats = Object.fromEntries(Object.entries(file.patterns ?? {}).filter(([pid, sp]) => pid === id || sp !== traced));
      pats[id] = { stops: p.stops.map((s) => s.stopId), keys: p.keys, trips: p.trips, acceptedAt: now().toISOString() };
      file = { version: 1, line: code, links, snaps: nextSnaps, patterns: pats };
      proposals.delete(id);
      return file;
    },

    /**
     * Keep: the pattern's out-of-date legs are marked reviewed against today's Quay positions and road build, so they turn
     * green without changing a metre. @param {string} id @returns {LineLinks}
     */
    keep(id) {
      const st = stateOf(id);
      if (!st) return file;
      const links = { ...file.links };
      for (const l of st.legs) {
        if (!l.key || (l.state !== 'moved' && l.state !== 'map')) continue;
        const [a, b] = l.key.split('|').map((q) => quayInfo.get(q));
        const link = links[l.key];
        links[l.key] = { ...link, reviewed: { built: publishedBuilt || undefined,
          from: a?.lat != null ? [a.lon, a.lat] : link.from, to: b?.lat != null ? [b.lon, b.lat] : link.to } };
      }
      file = { ...file, links };
      return file;
    },

    /** @param {string} id */
    discard(id) { proposals.delete(id); },

    /** @returns {string[]} the patterns with a proposal not accepted */
    pending: () => [...proposals.keys()],

    newerMap: () => newer,

    /** The links file as accepted and kept so far in this session. */
    file: () => file,

    /** Auto routing (a setting): routes and accepts every red and orange pattern. @returns {Promise<LineLinks>} */
    async updateAll() {
      for (const s of states()) {
        if (s.state === 'green') continue;
        await this.route(s.pattern.id);
        await this.accept(s.pattern.id);
      }
      return file;
    },

    close() { router.close?.(); },
  };
}
