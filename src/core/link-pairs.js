// Which links (stop-to-stop legs) a line needs: the consecutive calls of every trip, as the export writes them,
// including the extra patterns a "doesn't run" date makes (tripVariants), so every exported JourneyPattern can get
// its ServiceLinks. A pair is skipped when either stop is not an NSR Quay with a position. Kept from 2.3 for the
// routing session to come (the legs it routes). Pure.
import { journeyStops, tripVariants } from './netex/journeys.js';
import { unionDays, tripDays } from './calendars.js';
import { NSR_QUAY_PATTERN } from './quays.js';
import { profileFor } from '../routing/profiles.js';
import { expandRoute } from './blocks.js';

/** @typedef {{ quayId: string, lon: number, lat: number }} QuayRef */
/** @typedef {{ key: string, from: QuayRef, to: QuayRef, profile: import('../routing/profiles.js').Profile }} LinkPair */

/** @param {string} id @param {Map<string, any>} quayInfo @returns {QuayRef | null} */
function quayRef(id, quayInfo) {
  if (!NSR_QUAY_PATTERN.test(id)) return null;
  const q = quayInfo.get(id);
  return q?.lat != null && q.lon != null ? { quayId: id, lon: q.lon, lat: q.lat } : null;
}

/**
 * Every trip's calls as the export writes them: blocks expanded, the extra patterns of "doesn't run" dates, only the
 * periods of table set `setId` when given.
 * @param {any} rs @param {{ calendars: import('./calendars.js').Calendar[], setId?: number }} ctx
 * @param {(calls: { stopId: string }[]) => void} fn
 */
function eachTrip(rs, { calendars, setId }, fn) {
  const ex = expandRoute(rs);
  for (const per of ex?.periods ?? []) {
    if (setId !== undefined && per.setId !== setId) continue;
    const grid = ex.grids?.[`${per.id}:${per.setId}`];
    if (!grid) continue;
    const periodDays = unionDays(calendars.filter((c) => per.calendarIds.includes(c.id)));
    for (const col of grid.cols) {
      const days = tripDays(periodDays, col);
      const variants = days.length ? tripVariants(grid, col, days) : [{ calls: journeyStops(grid, col) }];
      for (const v of variants) fn(v.calls);
    }
  }
}

/**
 * @param {any} rs a parsed line (route state), its grids as they are now
 * @param {{ calendars: import('./calendars.js').Calendar[], quayInfo: Map<string, any>, setId?: number }} ctx
 * @returns {LinkPair[]} unique by key, in the order first met
 */
export function linkPairs(rs, { calendars, quayInfo, setId }) {
  const profile = profileFor(rs?.mode ?? '', rs?.submode ?? '');
  if (!profile) return [];
  /** @type {Map<string, LinkPair>} */
  const out = new Map();
  eachTrip(rs, { calendars, setId }, (calls) => {
    for (let i = 1; i < calls.length; i++) {
      if (calls[i - 1].stopId === calls[i].stopId) continue;
      const from = quayRef(calls[i - 1].stopId, quayInfo), to = quayRef(calls[i].stopId, quayInfo);
      if (!from || !to) continue;
      const key = `${from.quayId}|${to.quayId}|${profile}`;
      if (!out.has(key)) out.set(key, { key, from, to, profile });
    }
  });
  return [...out.values()];
}

/**
 * The distinct stop sequences a routing session routes (one chain per pattern). A stop that linkPairs skips (not an
 * NSR Quay with a position) splits the chain; a dwell is one stop. Chains of one stop are dropped.
 * @param {any} rs @param {{ calendars: import('./calendars.js').Calendar[], quayInfo: Map<string, any>, setId?: number }} ctx
 * @returns {{ stops: QuayRef[], keys: string[] }[]} in the order first met
 */
export function linkChains(rs, { calendars, quayInfo, setId }) {
  const profile = profileFor(rs?.mode ?? '', rs?.submode ?? '');
  if (!profile) return [];
  /** @type {Map<string, { stops: QuayRef[], keys: string[] }>} */
  const out = new Map();
  /** @param {QuayRef[]} stops */
  const add = (stops) => {
    if (stops.length < 2) return;
    const id = stops.map((q) => q.quayId).join(' ');
    if (!out.has(id)) out.set(id, { stops, keys: stops.slice(1).map((q, i) => `${stops[i].quayId}|${q.quayId}|${profile}`) });
  };
  eachTrip(rs, { calendars, setId }, (calls) => {
    /** @type {QuayRef[]} */
    let run = [];
    calls.forEach((c, i) => {
      if (i && calls[i - 1].stopId === c.stopId) return;
      const q = quayRef(c.stopId, quayInfo);
      if (q) run.push(q);
      else { add(run); run = []; }
    });
    add(run);
  });
  return [...out.values()];
}

/**
 * The links of one trip, with their rows (drawing the selected trip).
 * @param {{ stops: any[] }} grid @param {{ cells: any[] }} col @param {import('../routing/profiles.js').Profile} profile
 * @returns {{ key: string, fromRi: number, toRi: number }[]}
 */
export function tripLinks(grid, col, profile) {
  const calls = journeyStops(grid, col);
  /** @type {{ key: string, fromRi: number, toRi: number }[]} */
  const out = [];
  for (let i = 1; i < calls.length; i++) {
    if (calls[i - 1].stopId === calls[i].stopId) continue;
    out.push({ key: `${calls[i - 1].stopId}|${calls[i].stopId}|${profile}`, fromRi: calls[i - 1].ri, toRi: calls[i].ri });
  }
  return out;
}
