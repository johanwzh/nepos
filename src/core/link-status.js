// A link's status, computed live and cheaply, without routing (spec §6): routed, not routed, or out of date (a Quay
// has moved more than 5 m since it was routed). Newer map data is only a notice in the session, never a status. Pure.
import { linkMoved } from './link-state.js';
import { eachTrip, quayRef } from './link-pairs.js';
import { isRoutedLine, profileFor } from '../routing/profiles.js';
import { groupOf, groupKey } from './vehicle-limits.js';
import { linkFor } from './vehicle-links.js';

/** @typedef {'routed' | 'not-routed' | 'out-of-date'} LinkStatus */

/**
 * @param {string} key fromQuay|toQuay|profile @param {import('./link-state.js').SavedLink | undefined} link
 * @param {Map<string, any>} quayInfo @returns {LinkStatus}
 */
export function linkStatus(key, link, quayInfo) {
  if (!link || link.status !== 'OK') return 'not-routed';
  return linkMoved(key, link, quayInfo) ? 'out-of-date' : 'routed';
}

/**
 * The pairs a line needs, by status, once per vehicle group through the link the group uses (design 2026-11-03 §7);
 * none for a line that is not routed.
 * @param {any} rs @param {import('../project/links-store.js').LineLinks | undefined} lineLinks
 * @param {{ calendars: import('./calendars.js').Calendar[], quayInfo: Map<string, any>, vehicles?: any[] }} ctx
 */
export function lineLinkSummary(rs, lineLinks, { calendars, quayInfo, vehicles = [] }) {
  const sum = { pairs: 0, routed: 0, notRouted: 0, outOfDate: 0 };
  if (!isRoutedLine(rs)) return sum;
  const profile = /** @type {import('../routing/profiles.js').Profile} */ (profileFor(rs?.mode ?? '', rs?.submode ?? ''));
  /** @type {Set<string>} */
  const seen = new Set();
  eachTrip(rs, { calendars }, (calls, _uid, trip) => {
    const g = profile === 'bus' ? groupOf(String(trip.col?.vehicle ?? ''), vehicles) : {};
    for (let i = 1; i < calls.length; i++) {
      if (calls[i - 1].stopId === calls[i].stopId) continue;
      const from = quayRef(calls[i - 1].stopId, quayInfo), to = quayRef(calls[i].stopId, quayInfo);
      if (!from || !to) continue;
      const pair = `${from.quayId}|${to.quayId}|${profile}`, id = `${pair}#${groupKey(g)}`;
      if (seen.has(id)) continue;
      seen.add(id);
      sum.pairs++;
      const { key, link } = linkFor(pair, g, lineLinks?.links ?? {}, { lineMode: String(rs?.mode ?? '') });
      const s = key ? linkStatus(key, link ?? undefined, quayInfo) : 'not-routed';
      if (s === 'routed') sum.routed++;
      else if (s === 'out-of-date') sum.outOfDate++;
      else sum.notRouted++;
    }
  });
  return sum;
}
