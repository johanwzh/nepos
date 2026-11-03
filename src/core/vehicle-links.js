// Which saved link a trip's leg uses, by its vehicle group (design 2026-11-03 §7). The plain key fromQuay|toQuay|profile
// is always the default group's route (no limits, the line's default U-turn length); a group whose route differs has a
// variant fromQuay|toQuay|profile|<group key>. When Nepos can prove the router would give a group the same route as a
// saved link, the group uses it without asking (user 2026-11-03): the vehicle fits it and either costs U-turns alike or
// costs them more on a route that makes none, and, for a variant, the vehicle is at least as big as its group (the router
// could only forbid more roads). Otherwise the closest link is a candidate for the user to reconfirm. Pure.
import { fit, groupKey, groupOf, parseGroupKey, biggerOrEqual, uturnLength } from './vehicle-limits.js';

/** @typedef {import('./link-state.js').SavedLink} SavedLink */
/** @typedef {import('./vehicle-limits.js').Sizes} Sizes */
/** @typedef {{ key: string | null, link: SavedLink | null, how: 'plain' | 'own' | 'proven' | 'kept' | 'candidate' | null }} LinkChoice */

/** @param {string} pair @param {string} group */
export const variantKey = (pair, group) => (group ? `${pair}|${group}` : pair);
/** @param {string} key */
export const pairOf = (key) => key.split('|').slice(0, 3).join('|');
/** @param {string} key */
export const groupOfKey = (key) => key.split('|')[3] ?? '';

/**
 * Would the router give group g this saved route? g fits its limits (a link without recorded limits is known only for
 * a group without sizes), and a U-turn costs g the same, or more on a route that makes none.
 * @param {SavedLink} link @param {Sizes} g @param {number} uLen g's U-turn length @param {number} linkLen the length the link counts as routed with when it does not say
 */
export function sameRouteFor(link, g, uLen, linkLen) {
  if (Object.keys(g).length && (!link.limits || fit(link.limits, g).over.length)) return false;
  const lu = link.uturn ?? linkLen;
  return uLen === lu || (uLen > lu && !link.uturns?.length);
}

/**
 * @param {string} pair fromQuay|toQuay|profile @param {Sizes} g the trip's vehicle group
 * @param {Record<string, SavedLink>} links the line's links @param {{ lineMode: string }} ctx
 * @returns {LinkChoice}
 */
export function linkFor(pair, g, links, { lineMode }) {
  const routed = (/** @type {string} */ k) => (links[k]?.status === 'OK' ? links[k] : null);
  const plain = routed(pair);
  const gk = groupKey(g);
  if (!gk) return plain ? { key: pair, link: plain, how: 'plain' } : { key: null, link: null, how: null };
  const own = routed(variantKey(pair, gk));
  if (own) return { key: variantKey(pair, gk), link: own, how: 'own' };
  const uLen = uturnLength(g, lineMode);
  if (plain && sameRouteFor(plain, g, uLen, uturnLength({}, lineMode))) return { key: pair, link: plain, how: 'proven' };
  const variants = Object.keys(links).filter((k) => k.startsWith(`${pair}|`) && routed(k)).sort();
  for (const k of [pair, ...variants]) if (routed(k)?.kept?.includes(gk)) return { key: k, link: links[k], how: 'kept' };
  for (const k of variants) {
    const g0 = parseGroupKey(groupOfKey(k));
    if (biggerOrEqual(g, g0) && sameRouteFor(links[k], g, uLen, uturnLength(g0, lineMode))) return { key: k, link: links[k], how: 'proven' };
  }
  const fits = variants.find((k) => links[k].limits && !fit(links[k].limits, g).over.length);
  const k = fits ?? (plain ? pair : variants[0]);
  return k ? { key: k, link: links[k], how: 'candidate' } : { key: null, link: null, how: null };
}

/**
 * The link a trip's leg uses: its vehicle's group (on roads; elsewhere the plain link), through linkFor. Every reader of a
 * trip's route goes through this: the export, the export check, the timetable's map, the speed strip, Analysis.
 * @param {string} pair @param {string} vehicle the trip's vehicle name @param {Record<string, SavedLink>} links
 * @param {{ vehicles?: any[], lineMode: string }} ctx @returns {LinkChoice}
 */
export function linkForTrip(pair, vehicle, links, { vehicles = [], lineMode }) {
  const g = pair.endsWith('|bus') ? groupOf(vehicle, vehicles) : {};
  return linkFor(pair, g, links, { lineMode });
}
