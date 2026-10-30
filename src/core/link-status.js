// A link's status, computed live and cheaply, without routing (spec §6): routed, not routed, or out of date (a Quay
// has moved more than 5 m since it was routed). Newer map data is only a notice in the session, never a status. Pure.
import { quayMoved } from './link-state.js';
import { linkPairs } from './link-pairs.js';
import { isRoadLine } from '../routing/profiles.js';

/** @typedef {'routed' | 'not-routed' | 'out-of-date'} LinkStatus */

/**
 * @param {string} key fromQuay|toQuay|profile @param {import('./link-state.js').SavedLink | undefined} link
 * @param {Map<string, any>} quayInfo @returns {LinkStatus}
 */
export function linkStatus(key, link, quayInfo) {
  if (!link || link.status !== 'OK') return 'not-routed';
  return quayMoved(key, link, quayInfo) ? 'out-of-date' : 'routed';
}

/**
 * The pairs a line needs, by status; none for a line that is not routed on roads.
 * @param {any} rs @param {import('../project/links-store.js').LineLinks | undefined} lineLinks
 * @param {{ calendars: import('./calendars.js').Calendar[], quayInfo: Map<string, any> }} ctx
 */
export function lineLinkSummary(rs, lineLinks, { calendars, quayInfo }) {
  const sum = { pairs: 0, routed: 0, notRouted: 0, outOfDate: 0 };
  if (!isRoadLine(rs)) return sum;
  for (const p of linkPairs(rs, { calendars, quayInfo })) {
    sum.pairs++;
    const s = linkStatus(p.key, lineLinks?.links[p.key], quayInfo);
    if (s === 'routed') sum.routed++;
    else if (s === 'out-of-date') sum.outOfDate++;
    else sum.notRouted++;
  }
  return sum;
}
