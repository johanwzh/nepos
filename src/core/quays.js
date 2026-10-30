// NSR Quay IDs: recognising them, turning them into NeTEx references, and judging a stop's
// status from an NSR lookup. Pure.
import { ERN_MODES } from './ern/modes.js';

export const NSR_QUAY_PATTERN = /^NSR:Quay:\d+$/;
export const NSR_STOP_PLACE_PATTERN = /^NSR:StopPlace:\d+$/;

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
 * The line's transport mode: its Transmodel mode, or (an old line) its ERN code's. Modes with no ERN code (cableway,
 * coach, funicular …) have ERN code 0, so the mode itself must be used (user 2026-10-30: a cableway line was offered
 * bus stops). @param {{ mode?: string, transportMode?: number } | null | undefined} rs
 */
export const lineModeOf = (rs) => rs?.mode || /** @type {any} */ (ERN_MODES)[rs?.transportMode ?? 0]?.mode || '';

/**
 * Whether a stop place's NSR transport mode suits the line's mode. Bus and coach stops serve both.
 * @param {string | number} lineMode the line's Transmodel mode (lineModeOf), or an ERN #RUT mode code
 * @param {string} nsrMode lower-case NSR transport mode ('' when unknown)
 */
export function modeMatches(lineMode, nsrMode) {
  const want = typeof lineMode === 'number' ? /** @type {any} */ (ERN_MODES)[lineMode]?.mode : lineMode;
  if (!want || !nsrMode) return true;
  const road = ['bus', 'coach'];
  return nsrMode === want || (road.includes(want) && road.includes(nsrMode));
}

/**
 * A stop's status for the grid and the export check (spec §7.2).
 * @param {string | null} stopId
 * @param {import('../services/nsr.js').QuayInfo | null | undefined} info undefined: not looked up
 *   (yet, or NSR could not be reached); null: NSR does not know the Quay
 * @param {string | number} lineMode the line's mode (lineModeOf), or its ERN code
 * @returns {'missing' | 'not-nsr' | 'unknown' | 'not-seen' | 'mode-mismatch' | 'confirmed'}
 */
export function quayStatus(stopId, info, lineMode) {
  if (stopId == null || stopId === '') return 'missing';
  if (!NSR_QUAY_PATTERN.test(stopId)) return 'not-nsr';
  if (info === undefined) return 'unknown';
  if (info === null) return 'not-seen';
  return modeMatches(lineMode, info.mode) ? 'confirmed' : 'mode-mismatch';
}
