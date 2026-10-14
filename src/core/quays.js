// NSR Quay IDs: recognising them, turning them into NeTEx references, and judging a stop's
// status from an NSR lookup. Pure.
import { ERN_MODES } from './ern/modes.js';

export const NSR_QUAY_PATTERN = /^NSR:Quay:\d+$/;

/**
 * A stop ID as the local part of a NeTEx ID (ScheduledStopPoint, RoutePoint, …):
 * NSR:Quay:7203 → NSR-Quay-7203. Old numeric IDs are unchanged.
 * @param {string} id
 */
export function stopLocalId(id) {
  return String(id).replace(/[^A-Za-z0-9_-]/g, '-');
}

/**
 * The QuayRef for a stop: an NSR Quay ID as-is; anything else (old 1.x IDs) in the project's
 * codespace, as 1.5.7 wrote it.
 * @param {string} id
 * @param {string} cs
 */
export function quayRef(id, cs) {
  return NSR_QUAY_PATTERN.test(String(id)) ? String(id) : `${cs}:Quay:${id}`;
}

/**
 * The NSR Quay IDs used in a route file's #TRL records, once each, in file order.
 * @param {string} text
 */
export function quayIdsInErn(text) {
  return [...new Set([...text.matchAll(/^[ \t]*#TRL;[^;\r\n]*;[ \t]*(NSR:Quay:\d+)[ \t]*;/gm)].map((m) => m[1]))];
}

/**
 * Whether a stop place's NSR transport mode suits the line's ERN mode. Advisory only.
 * @param {number} ernMode ERN #RUT mode code
 * @param {string} nsrMode lower-case NSR transport mode ('' when unknown)
 */
export function modeMatches(ernMode, nsrMode) {
  const want = /** @type {any} */ (ERN_MODES)[ernMode]?.mode;
  if (!want || !nsrMode) return true;
  return nsrMode === want || (want === 'bus' && nsrMode === 'coach');
}

/**
 * A stop's status for the grid and the export check (spec §7.2).
 * @param {string | null} stopId
 * @param {import('../services/nsr.js').QuayInfo | null | undefined} info undefined: not looked up
 *   (yet, or NSR could not be reached); null: NSR does not know the Quay
 * @param {number} ernMode the line's ERN mode
 * @returns {'missing' | 'not-nsr' | 'unknown' | 'not-seen' | 'mode-mismatch' | 'confirmed'}
 */
export function quayStatus(stopId, info, ernMode) {
  if (stopId == null || stopId === '') return 'missing';
  if (!NSR_QUAY_PATTERN.test(stopId)) return 'not-nsr';
  if (info === undefined) return 'unknown';
  if (info === null) return 'not-seen';
  return modeMatches(ernMode, info.mode) ? 'confirmed' : 'mode-mismatch';
}
