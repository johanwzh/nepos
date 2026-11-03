// A routing session on one table set (routing editor, 2026-10-31): the user is in control. Opening it reads the links
// file and the published road build's date, and routes nothing. Route makes a *proposal* for one journey pattern (or one
// leg of it); Accept turns the proposal into the line's links, Keep marks out-of-date legs as reviewed, Discard drops
// it. Nothing is written here: accept() and keep() return the file the view writes. One snap per Quay within a line: a
// Quay's saved snap is fixed; a Quay without one (or one NSR has moved) gets the snap of the first route through it. A
// run of legs that fails is routed again leg by leg, so one bad leg does not lose the others. Vehicle groups (design
// 2026-11-03 §5–§8): a pattern is also its trips' vehicle group; Route passes its sizes and U-turn length; Accept writes the
// plain link or the group's variant; Keep confirms a route for the group; checkLimits records the limits along saved routes.
import { routeWithTiles } from './router-core.js';
import { tilesForChain } from './tile-select.js';
import { encodePolyline, decodePolyline, haversineM } from './geometry.js';
import { MOVED_M } from '../core/link-state.js';
import { tablePatterns, patternStates, pruneLineLinks } from '../core/route-patterns.js';
import { profileFor } from './profiles.js';
import { rulesFor } from './rules.js';
import { uturnLength, parseGroupKey, biggerOrEqual } from '../core/vehicle-limits.js';
import { variantKey, sameRouteFor, groupOfKey } from '../core/vehicle-links.js';

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
 * A routed leg may carry free (the route without limits, drawn red; never saved); a leg with no route for this vehicle
 * carries it with around (what blocks it).
 * @typedef {{ legs: Map<string, (SavedLink & { free?: LonLat[], freeM?: number, freeS?: number }) | { state: 'no-route' | 'no-road' | 'no-route-vehicle', error?: string,
 *   around?: import('../core/vehicle-limits.js').LimitAt[], free?: LonLat[], freeM?: number, freeS?: number }>, via: Map<string, LonLat[]>, old: Map<string, string> }} Proposal
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
 *   tiles: import('./tile-source.js').TileSource, now?: () => Date, onProgress?: (done: number, total: number) => void, vehicles?: any[] }} opts
 *   onProgress: map data downloaded so far, when Route has to fetch it; vehicles: the project's (the trips' groups)
 */
export function createRoutingSession({ code, rs, setId, calendars, lineLinks, quayInfo, router, tiles, now = () => new Date(), onProgress, vehicles = [] }) {
  const patterns = tablePatterns(rs, { calendars, quayInfo, setId, vehicles });
  const lineMode = String(rs?.mode ?? '');
  /** The tile set the line routes on (routing for all modes): its tiles source and router are made for it by the caller. */
  const set = rulesFor(profileFor(rs?.mode ?? '', rs?.submode ?? '') ?? 'bus').set;
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
  /** What Route passes for a pattern: its group's sizes, and on roads its U-turn length (backlog 107). @param {Pattern} p */
  const optsFor = (p) => ({ ...(Object.keys(p.group ?? {}).length ? { vehicle: p.group } : {}), ...(set === 'road' ? { uturnLength: uturnLength(p.group ?? {}, lineMode) } : {}) });
  /** The keys of the links pattern p's legs use now (a variant or the pair), each leg's: one state per call (final review M8). @param {Pattern} p */
  const usedKeys = (p) => { const st = stateOf(p.id); return p.keys.map((k, i) => st?.legs[i]?.key ?? k); };

  const states = () => patternStates(patterns, file, { quayInfo });
  const stateOf = (/** @type {string} */ id) => /** @type {PatternState} */ (states().find((s) => s.pattern.id === id));
  /** @param {string} id */
  const proposalOf = (id) => {
    let p = proposals.get(id);
    if (!p) { p = { legs: new Map(), via: new Map(), old: new Map() }; proposals.set(id, p); }
    return p;
  };
  /** The waypoints a leg is routed through: set in the proposal, else the link it uses now (waypoints belong to the link,
   *  §7). @param {Proposal | undefined} pr @param {string} key the pair @param {string | null} [used] the link's key */
  const viaOf = (pr, key, used = key) => pr?.via.get(key) ?? file.links[used ?? key]?.via ?? [];

  /** The road build, once, on the first Route (never on open). */
  /**
   * The map data for one pattern, in driving order (its stops and waypoints): only what it needs, fetched on its Route
   * (user 2026-10-31: a short branch fetched the whole line). The first call chooses the build. @param {Pattern} p
   */
  async function openTiles(p) {
    /** @type {{ lon: number, lat: number }[]} */
    const points = [];
    const used = usedKeys(p);
    p.stops.forEach((s, i) => {
      if (s.quay) points.push({ lon: s.quay.lon, lat: s.quay.lat });
      const k = p.keys[i];
      if (k) for (const [lon, lat] of viaOf(proposals.get(p.id), k, used[i])) points.push({ lon, lat });
    });
    // The newest published build: Route on an orange "newer map data" pattern compares with that (final review 1)
    const opened = await tiles.open(points, { latest: true, onProgress });
    manifest = opened.manifest; newer = opened.newer;
  }

  /**
   * Routes a run of consecutive stops of pattern p; the results land in the proposal. @param {Pattern} p @param {Proposal} pr
   * @param {QuayRef[]} stops @param {string[]} keys the pairs @param {string[]} used the links they use now
   * @param {boolean} [rethrow] a tile that does not load throws (a waypoint); else it fails only these legs (final
   * review I3) @returns {Promise<boolean>} routed
   */
  async function route(p, pr, stops, keys, used, rethrow = false) {
    /** @type {ChainPoint[]} */
    const out = [];
    /** @type {number[]} */
    const at = [];
    const opts = optsFor(p);
    stops.forEach((q, i) => {
      if (i) for (const [lon, lat] of viaOf(pr, keys[i - 1], used[i - 1])) out.push({ lon, lat, via: true });
      at.push(out.length);
      out.push(snaps[q.quayId] ? { lon: q.lon, lat: q.lat, fixed: snaps[q.quayId] } : { lon: q.lon, lat: q.lat });
    });
    let r;
    try {
      r = await routeWithTiles(router, /** @type {any} */ (manifest), out, loadTile, 3, opts);
    } catch (e) {
      if (rethrow) throw e;
      if (keys.length === 1) pr.legs.set(keys[0], { state: 'no-route', error: String(/** @type {any} */ (e)?.message ?? e) });
      return false;
    }
    if (!r.ok) {
      const f = /** @type {any} */ (r);
      // no route for this vehicle (§10): the route without limits and what blocks it go with the failed leg
      if (keys.length === 1) pr.legs.set(keys[0], f.error === 'no-route-vehicle' ? { state: 'no-route-vehicle', around: f.around, free: f.free, freeM: f.freeM, freeS: f.freeS }
        : { state: f.error === 'no-road' ? 'no-road' : 'no-route' });
      return false;
    }
    stops.forEach((q, i) => {
      const s = r.snaps[at[i]];
      if (!snaps[q.quayId] || s.refLost) snaps[q.quayId] = { way: s.way, lon: s.lon, lat: s.lat, along: s.along, off: s.off, road: s.road };
    });
    const tilesOf = { set, built: manifest?.built ?? '', dataDate: manifest?.dataDate ?? '',
      hashes: Object.fromEntries([...loaded].sort().map((k) => [k, manifest?.tiles[k]?.hash ?? ''])) };
    keys.forEach((key, k) => {
      const leg = /** @type {import('./router-core.js').RoutedLeg} */ (r.legs[k]), flags = r.flags?.[k] ?? [];
      const limits = { ...leg.limits, built: manifest?.built ?? '' };
      /** @type {SavedLink & { free?: [number, number][], freeM?: number, freeS?: number }} */
      const link = { polyline: encodePolyline(leg.coords, PRECISION), precision: PRECISION, distanceM: Math.round(leg.metres * 10) / 10,
        status: 'OK', from: pos(stops[k]), to: pos(stops[k + 1]), ferryM: Math.round(leg.ferryMetres * 10) / 10, seconds: Math.round(leg.seconds),
        via: viaOf(pr, key, used[k]), roads: leg.roads, flags, routedAt: now().toISOString(), tiles: tilesOf, limits,
        ...(opts.uturnLength != null ? { uturn: opts.uturnLength } : {}), ...(leg.uturns?.length ? { uturns: leg.uturns } : {}),
        ...(leg.around?.length ? { around: leg.around, free: leg.free, freeM: leg.freeM, freeS: leg.freeS } : {}) };
      const saved = file.links[used[k]];
      if (!saved || !sameLink(link, saved)) { pr.legs.set(key, link); return; }
      // The same route: kept as it is (not a metre changes); a route saved before 2.6.1 gets its limits, one on an older
      // build is marked checked against this one
      const built = [saved.tiles?.built ?? '', saved.reviewed?.built ?? ''].sort().pop() ?? '';
      let keep = /** @type {SavedLink & { free?: LonLat[], freeM?: number, freeS?: number }} */ (saved);
      if (!saved.limits) keep = { ...keep, limits };
      // the route without limits and what blocked it, for the comparison (final review I2; Accept strips the free route)
      if (link.around?.length) keep = { ...keep, around: link.around, free: link.free, freeM: link.freeM, freeS: link.freeS };
      if (manifest?.built && built < manifest.built) keep = { ...keep, reviewed: { ...saved.reviewed, built: manifest.built } };
      pr.legs.set(key, keep);
    });
    return true;
  }

  /**
   * Routes these legs of the pattern: runs of consecutive legs together, a run that fails leg by leg.
   * @param {Pattern} p @param {Proposal} pr @param {Set<number>} which leg indexes
   */
  async function routeLegs(p, pr, which) {
    const usedAll = usedKeys(p);
    for (let i = 0; i < p.keys.length; i++) {
      if (!which.has(i)) continue;
      let j = i;
      while (j + 1 < p.keys.length && which.has(j + 1)) j++;
      const stops = /** @type {QuayRef[]} */ (p.stops.slice(i, j + 2).map((s) => s.quay));
      const keys = /** @type {string[]} */ (p.keys.slice(i, j + 1));
      const used = keys.map((_, k) => /** @type {string} */ (usedAll[i + k]));
      if (!(await route(p, pr, stops, keys, used)) && keys.length > 1) {
        for (let k = 0; k < keys.length; k++) await route(p, pr, [stops[k], stops[k + 1]], [keys[k]], [used[k]]);
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
      await openTiles(p);
      const st = stateOf(id);
      const pr = proposalOf(id);
      /** @type {Set<number>} */
      const which = new Set();
      const used = usedKeys(p);
      p.keys.forEach((k, i) => {
        if (!k || (key && k !== key)) return;
        const viaChanged = pr.via.has(k) && JSON.stringify(pr.via.get(k)) !== JSON.stringify(file.links[used[i] ?? k]?.via ?? []);
        if (key || st.legs[i].state !== 'routed' || viaChanged) which.add(i);
      });
      if (!which.size) p.keys.forEach((k, i) => { if (k) which.add(i); });
      // the comparison draws the route a leg had: its old key (a changed stop), or the link it uses now when that is not the pair
      st.legs.forEach((l, i) => {
        if (!which.has(i) || !l.pair) return;
        if (l.oldKey) pr.old.set(l.pair, l.oldKey);
        else if (l.key && l.key !== l.pair) pr.old.set(l.pair, l.key);
      });
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
        await openTiles(p);
        await route(p, pr, [/** @type {QuayRef} */ (p.stops[i].quay), /** @type {QuayRef} */ (p.stops[i + 1].quay)], [key], [/** @type {string} */ (usedKeys(p)[i])], true);
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
      const before = stateOf(id);
      const gk = p.groupKey ?? '', defLen = uturnLength({}, lineMode), uLen = uturnLength(p.group ?? {}, lineMode);
      /** @type {(string | null)[]} the keys the legs use after this Accept */
      const usedNow = p.keys.map((k, i) => before?.legs[i]?.key ?? k);
      p.keys.forEach((pair, i) => {
        const l = pair ? pr?.legs.get(pair) : undefined;
        if (!pair || !isLink(l)) return;
        const { free, freeM, freeS, ...link } = /** @type {SavedLink & { free?: any, freeM?: number, freeS?: number }} */ (l);
        const plain = links[pair], own = variantKey(pair, gk), used = /** @type {string} */ (usedNow[i]);
        if (!gk) { links[pair] = link; usedNow[i] = pair; return; }
        /** The route is a saved one: no copy; confirmed for the group when Nepos cannot prove it. @param {string} k */
        const confirm = (k) => {
          const at = links[k], g0 = k === pair ? {} : parseGroupKey(groupOfKey(k));
          const next = { ...at, ...(at.limits ? {} : { limits: link.limits }) };
          // provable as linkFor proves it: the plain link, or another group's route for a group at least as big (rules 3, 5)
          const proven = (k === pair || biggerOrEqual(p.group ?? {}, g0)) && sameRouteFor(next, p.group, uLen, uturnLength(g0, lineMode));
          if (k !== own && !proven && !next.kept?.includes(gk)) next.kept = [...(next.kept ?? []), gk];
          links[k] = next; usedNow[i] = k;
        };
        // the link the leg uses now, when it is another group's route (rule 4 to 6, final review M5)
        if (used !== pair && used !== own && links[used] && sameLink(link, links[used])) { confirm(used); return; }
        if (plain && sameLink(link, plain)) {
          // the group's route is the plain one: its own route goes, unless another pattern still uses it (final review I1)
          if (links[own] && !states().some((o) => o.pattern.id !== id && o.legs.some((x) => x.key === own))) delete links[own];
          confirm(pair); return;
        }
        // a route changed in the thumbnail of a group with its own route is that route (a variant never touches the plain
        // link, design §7); else one that did not go round, costing U-turns as the default group does, is the plain one
        if (used !== own && !link.around?.length && (link.uturn ?? defLen) === defLen) { links[pair] = link; usedNow[i] = pair; return; }
        links[own] = link; usedNow[i] = own;
      });
      const nextSnaps = { ...file.snaps };
      for (const s of p.stops) if (s.quay && snaps[s.quay.quayId]) nextSnaps[s.quay.quayId] = snaps[s.quay.quayId];
      const traced = before.saved;
      const pats = Object.fromEntries(Object.entries(file.patterns ?? {}).filter(([pid, sp]) => pid === id || sp !== traced));
      pats[id] = { stops: p.stops.map((s) => s.stopId), keys: usedNow, trips: p.trips, acceptedAt: now().toISOString(), ...(gk ? { vehicle: gk } : {}) };
      file = { version: 1, line: code, links, snaps: nextSnaps, patterns: pats };
      proposals.delete(id);
      return file;
    },

    /**
     * Keep: the pattern's out-of-date legs are marked reviewed against today's Quay positions and road build, and a route
     * to reconfirm is confirmed for the pattern's vehicle group (§8), so they turn green without changing a metre.
     * @param {string} id @returns {LineLinks}
     */
    keep(id) {
      const st = stateOf(id);
      if (!st) return file;
      const links = { ...file.links };
      const gk = st.pattern.groupKey ?? '';
      for (const l of st.legs) {
        if (l.key && l.state === 'reconfirm' && gk) {
          const link = links[l.key];
          links[l.key] = { ...link, kept: [...new Set([...(link.kept ?? []), gk])] };
          continue;
        }
        if (!l.key || l.state !== 'moved') continue;
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

    /**
     * Drops the links no trip of the line uses — only when the user asks (user 2026-10-31: a red link is kept, so fixing
     * a typo in the timetable brings it back). @returns {LineLinks} the file to write
     */
    removeUnused() {
      const next = pruneLineLinks(rs, file, vehicles);
      if (next) file = next;
      return file;
    },

    /**
     * The automatic check when Routing opens (design 2026-11-03 §8): the links a trip with a sized vehicle uses whose
     * limits are not known, or were read from an older build than the published one, are placed on the road data and
     * get their limits; nothing else of them changes. Only that map data is fetched. Offline, or nothing to check: null.
     * @returns {Promise<LineLinks | null>} the file to write
     */
    async checkLimits() {
      /** @type {Map<string, SavedLink>} */
      const want = new Map();
      try {
        if (!states().some((st) => st.pattern.groupKey)) return null;
        const pub = await tiles.published().catch(() => null);
        if (!pub) return null;
        for (const st of states()) {
          if (!st.pattern.groupKey) continue;
          for (const l of st.legs) {
            const link = l.key ? file.links[l.key] : undefined;
            if (l.key && link?.status === 'OK' && (!link.limits || (link.limits.built ?? '') < pub.built)) want.set(l.key, link);
          }
        }
        if (!want.size) return null;
        const links = { ...file.links };
        let changed = false;
        for (const [key, link] of want) {
          const coords = /** @type {[number, number][]} */ (decodePolyline(link.polyline, link.precision ?? 6));
          const points = coords.filter((_, i) => i % 20 === 0 || i === coords.length - 1).map(([lon, lat]) => ({ lon, lat }));
          const opened = await tiles.open(points, { latest: true, onProgress });
          manifest = opened.manifest; newer = opened.newer;
          const missing = tilesForChain(manifest, points, 1).filter((k) => !router.has(k));
          if (missing.length) await router.addTiles(await Promise.all(missing.map(async (k) => ({ key: k, buf: await loadTile(k) }))));
          const placed = await /** @type {any} */ (router).place(coords);
          if (!placed?.matched) continue;
          links[key] = { ...link, limits: { ...placed.limits, built: manifest.built } };
          changed = true;
        }
        if (!changed) return null;
        file = { ...file, links };
        return file;
      } catch {
        return null;
      }
    },

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
