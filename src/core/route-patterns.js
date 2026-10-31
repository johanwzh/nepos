// The journey patterns of a table set and their routing state (routing editor, 2026-10-31). A pattern is a full stop
// sequence as the export writes it; it is traced to the pattern the user accepted through its trips' UUIDs, so a Quay
// replaced on a row is a change inside the pattern (orange), and another set of calls is a new pattern (red). Pure.
import { eachTrip, quayRef } from './link-pairs.js';
import { journeyStops } from './netex/journeys.js';
import { expandRoute } from './blocks.js';
import { linkMoved } from './link-state.js';
import { profileFor } from '../routing/profiles.js';

/** @typedef {import('./link-pairs.js').QuayRef} QuayRef */
/** @typedef {import('../project/links-store.js').LineLinks} LineLinks */
/** @typedef {import('../project/links-store.js').SavedPattern} SavedPattern */
/**
 * id: the stop IDs joined by a space; keys: per leg, null when either stop has no NSR position; trips: column UUIDs;
 * runs: how many trips run it as the export writes them (a block's generated trips each count; user 2026-10-31).
 * @typedef {{ id: string, stops: { stopId: string, quay: QuayRef | null, name: string }[], keys: (string | null)[], trips: string[], runs: number }} Pattern
 */
/** @typedef {{ key: string | null, state: 'routed' | 'moved' | 'map' | 'changed' | 'none' | 'unroutable', oldKey?: string }} LegState */
/** @typedef {{ pattern: Pattern, state: 'red' | 'orange' | 'green', legs: LegState[], saved: SavedPattern | null }} PatternState */

/**
 * @param {any} rs @param {{ calendars: import('./calendars.js').Calendar[], quayInfo: Map<string, any>, setId?: number }} ctx
 * @returns {Pattern[]} in the order first met; none for a line not routed on roads
 */
export function tablePatterns(rs, { calendars, quayInfo, setId }) {
  const profile = profileFor(rs?.mode ?? '', rs?.submode ?? '');
  if (!profile) return [];
  /** @type {Map<string, Pattern>} */
  const out = new Map();
  eachTrip(rs, { calendars, setId }, (calls, uid) => {
    const seq = calls.filter((c, i) => !i || calls[i - 1].stopId !== c.stopId);
    if (seq.length < 2) return;
    const id = seq.map((c) => c.stopId).join(' ');
    let p = out.get(id);
    if (!p) {
      const stops = seq.map((c) => ({ stopId: c.stopId, quay: quayRef(c.stopId, quayInfo), name: c.name ?? '' }));
      const keys = stops.slice(1).map((s, i) => (stops[i].quay && s.quay ? `${stops[i].stopId}|${s.stopId}|${profile}` : null));
      p = { id, stops, keys, trips: [], runs: 0 };
      out.set(id, p);
    }
    p.runs++;
    if (uid && !p.trips.includes(uid)) p.trips.push(uid);
  });
  return [...out.values()];
}

/**
 * The saved pattern a pattern comes from: the same stops, else the one sharing most trips — only with as many stops.
 * @param {Pattern} p @param {Record<string, SavedPattern> | undefined} saved @returns {SavedPattern | null}
 */
function traced(p, saved) {
  if (!saved) return null;
  if (saved[p.id]) return saved[p.id];
  // Only as many stops; a pattern and its "doesn't run" variant share their trips, so ties go to the most stops in
  // common (final review 2, 2026-10-31)
  let best = null, most = 0, common = -1;
  for (const s of Object.values(saved)) {
    if (s.stops.length !== p.stops.length) continue;
    const n = s.trips.filter((u) => p.trips.includes(u)).length;
    const c = s.stops.filter((id, i) => id === p.stops[i].stopId).length;
    if (n && (n > most || (n === most && c > common))) { best = s; most = n; common = c; }
  }
  return best;
}

/**
 * @param {Pattern[]} patterns @param {LineLinks | undefined} lineLinks
 * @param {{ quayInfo: Map<string, any>, publishedBuilt?: string }} ctx publishedBuilt: the published road build, '' unknown
 * @returns {PatternState[]}
 */
export function patternStates(patterns, lineLinks, { quayInfo, publishedBuilt = '' }) {
  return patterns.map((pattern) => {
    const saved = traced(pattern, lineLinks?.patterns);
    /** @type {LegState[]} */
    const legs = pattern.keys.map((key, i) => {
      if (key === null) return { key, state: 'unroutable' };
      const link = lineLinks?.links[key];
      if (link?.status === 'OK') {
        if (linkMoved(key, link, quayInfo)) return { key, state: 'moved' };
        const built = [link.tiles?.built ?? '', link.reviewed?.built ?? ''].sort().pop() ?? '';
        if (publishedBuilt && built < publishedBuilt) return { key, state: 'map' };
        return { key, state: 'routed' };
      }
      const oldKey = saved?.keys[i];
      return oldKey && oldKey !== key ? { key, state: 'changed', oldKey } : { key, state: 'none' };
    });
    const has = (/** @type {string[]} */ s) => legs.some((l) => s.includes(l.state));
    const state = has(['none', 'unroutable']) ? 'red' : has(['moved', 'map', 'changed']) ? 'orange' : 'green';
    return { pattern, state, legs, saved };
  });
}

/** A call a "doesn't run" date can take out (tripVariants then makes the pattern without it). @param {any} c */
const skippable = (c) => [c.arrCell, c.depCell].some((cell) => cell?.dates?.some((/** @type {any} */ r) => !r.on));

/**
 * The file without the links no trip uses any more (spec Goal 6), run when a line is saved. Used is decided by stop IDs
 * only — never by NSR positions, so an offline lookup drops nothing; without calendars, every pair a "doesn't run" date
 * could make counts as used. A saved pattern stays while one of its trips exists, and so do its legs' links (the
 * comparison needs them); snaps go with the last link of their Quay.
 * @param {any} rs @param {LineLinks} lineLinks @returns {LineLinks | null} null: nothing to drop, or a line that is not routed (air)
 */
export function pruneLineLinks(rs, lineLinks) {
  const profile = profileFor(rs?.mode ?? '', rs?.submode ?? '');
  if (!profile) return null;
  /** @type {Set<string>} */
  const used = new Set();
  /** @type {Set<string>} */
  const uids = new Set();
  const ex = expandRoute(rs);
  for (const grid of Object.values(ex?.grids ?? {})) {
    for (const col of /** @type {any} */ (grid).cols) {
      if (col.uid) uids.add(col.uid);
      const calls = journeyStops(/** @type {any} */ (grid), col);
      for (let i = 0; i < calls.length; i++) {
        for (let j = i + 1; j < calls.length; j++) {
          if (calls[i].stopId !== calls[j].stopId) used.add(`${calls[i].stopId}|${calls[j].stopId}|${profile}`);
          if (!skippable(calls[j])) break;
        }
      }
    }
  }
  const patterns = Object.fromEntries(Object.entries(lineLinks.patterns ?? {}).filter(([, sp]) => sp.trips.some((u) => uids.has(u))));
  for (const sp of Object.values(patterns)) for (const key of sp.keys) if (key) used.add(key);
  // another network's links stay: a line switched from bus to tram keeps its bus routes (final review I4)
  const links = Object.fromEntries(Object.entries(lineLinks.links).filter(([key]) => used.has(key) || !key.endsWith(`|${profile}`)));
  const quays = new Set(Object.keys(links).flatMap((key) => key.split('|').slice(0, 2)));
  const snaps = Object.fromEntries(Object.entries(lineLinks.snaps).filter(([id]) => quays.has(id)));
  const same = (/** @type {object} */ a, /** @type {object | undefined} */ b) => Object.keys(a).length === Object.keys(b ?? {}).length;
  if (same(links, lineLinks.links) && same(snaps, lineLinks.snaps) && same(patterns, lineLinks.patterns)) return null;
  return { ...lineLinks, links, snaps, patterns };
}
