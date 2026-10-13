// NSR Quay IDs: recognising them and turning them into NeTEx references. Pure.

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
  return [...new Set([...text.matchAll(/^#TRL;[^;\r\n]*;(NSR:Quay:\d+);/gm)].map((m) => m[1]))];
}
