// Which links a line needs (design §1 and §10): the consecutive calls of every trip, as the export writes them,
// including the extra patterns a "doesn't run" date makes (tripVariants), so every exported JourneyPattern can get
// its ServiceLinks. A pair is skipped when either stop is not an NSR Quay with a position. Pure.
import { journeyStops, tripVariants } from './netex/journeys.js';
import { unionDays, tripDays } from './calendars.js';
import { NSR_QUAY_PATTERN } from './quays.js';
import { profileFor } from '../shapes/profiles.js';

/** @typedef {{ quayId: string, lon: number, lat: number }} QuayRef */
/** @typedef {{ key: string, from: QuayRef, to: QuayRef, profile: import('../shapes/profiles.js').Profile }} LinkPair */

/** @param {string} id @param {Map<string, any>} quayInfo @returns {QuayRef | null} */
function quayRef(id, quayInfo) {
  if (!NSR_QUAY_PATTERN.test(id)) return null;
  const q = quayInfo.get(id);
  return q?.lat != null && q.lon != null ? { quayId: id, lon: q.lon, lat: q.lat } : null;
}

/**
 * @param {any} rs a parsed line (route state), its grids as they are now
 * @param {{ calendars: import('./calendars.js').Calendar[], quayInfo: Map<string, any> }} ctx
 * @returns {LinkPair[]} unique by key, in the order first met
 */
export function linkPairs(rs, { calendars, quayInfo }) {
  const profile = profileFor(rs?.mode ?? '', rs?.submode ?? '');
  if (!profile) return [];
  /** @type {Map<string, LinkPair>} */
  const out = new Map();
  /** @param {{ stopId: string }[]} calls */
  const add = (calls) => {
    for (let i = 1; i < calls.length; i++) {
      if (calls[i - 1].stopId === calls[i].stopId) continue;
      const from = quayRef(calls[i - 1].stopId, quayInfo), to = quayRef(calls[i].stopId, quayInfo);
      if (!from || !to) continue;
      const key = `${from.quayId}|${to.quayId}|${profile}`;
      if (!out.has(key)) out.set(key, { key, from, to, profile });
    }
  };
  for (const per of rs.periods ?? []) {
    const grid = rs.grids?.[`${per.id}:${per.setId}`];
    if (!grid) continue;
    const periodDays = unionDays(calendars.filter((c) => per.calendarIds.includes(c.id)));
    for (const col of grid.cols) {
      const days = tripDays(periodDays, col);
      const variants = days.length ? tripVariants(grid, col, days) : [{ calls: journeyStops(grid, col) }];
      for (const v of variants) add(v.calls);
    }
  }
  return [...out.values()];
}

/**
 * The links of one trip, with their rows (drawing the selected trip).
 * @param {{ stops: any[] }} grid @param {{ cells: any[] }} col @param {import('../shapes/profiles.js').Profile} profile
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
