// The journey patterns of a table set and their routing state (routing editor, 2026-10-31). A pattern is a full stop
// sequence as the export writes it; it is traced to the pattern the user accepted through its trips' UUIDs, so a Quay
// replaced on a row is a change inside the pattern (orange), and another set of calls is a new pattern (red). Pure.
import { eachTrip, quayRef } from './link-pairs.js';
import { quayMoved } from './link-state.js';
import { profileFor } from '../routing/profiles.js';

/** @typedef {import('./link-pairs.js').QuayRef} QuayRef */
/** @typedef {import('../project/links-store.js').LineLinks} LineLinks */
/** @typedef {import('../project/links-store.js').SavedPattern} SavedPattern */
/**
 * id: the stop IDs joined by a space; keys: per leg, null when either stop has no NSR position; trips: column UUIDs.
 * @typedef {{ id: string, stops: { stopId: string, quay: QuayRef | null, name: string }[], keys: (string | null)[], trips: string[] }} Pattern
 */
/** @typedef {{ key: string | null, state: 'routed' | 'moved' | 'map' | 'changed' | 'none' | 'unroutable', oldKey?: string }} LegState */
/** @typedef {{ pattern: Pattern, state: 'red' | 'orange' | 'green', legs: LegState[], saved: SavedPattern | null }} PatternState */

/**
 * @param {any} rs @param {{ calendars: import('./calendars.js').Calendar[], quayInfo: Map<string, any>, setId?: number }} ctx
 * @returns {Pattern[]} in the order first met; none for a line not routed on roads
 */
export function tablePatterns(rs, { calendars, quayInfo, setId }) {
  const profile = profileFor(rs?.mode ?? '', rs?.submode ?? '');
  if (profile !== 'bus') return [];
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
      p = { id, stops, keys, trips: [] };
      out.set(id, p);
    }
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
  let best = null, most = 0;
  for (const s of Object.values(saved)) {
    const n = s.trips.filter((u) => p.trips.includes(u)).length;
    if (n > most) { best = s; most = n; }
  }
  return best && best.stops.length === p.stops.length ? best : null;
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
        const r = link.reviewed;
        const at = r?.from || r?.to ? { ...link, from: r.from ?? link.from, to: r.to ?? link.to } : link;
        if (quayMoved(key, at, quayInfo)) return { key, state: 'moved' };
        const built = [link.tiles?.built ?? '', r?.built ?? ''].sort().pop() ?? '';
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
