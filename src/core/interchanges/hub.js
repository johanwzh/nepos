// Knutepunkt (interchanges spec 2026-10-31): a stop on our line where our trips wait for a feeder from another line.
// It lives in the line file (user 2026-10-31: line files stand on their own): the hub on its row (#KNP), each picked
// trip and its approved link on our cell at that row (#KNL). So both move with rows and columns, and are saved and
// undone with the line.

/**
 * What the feeder must be: orgIds by role, mode, line number, and StopPlaces it has called at before.
 * @typedef {{ authority?: string[], operator?: string[], mode?: string, submode?: string, publicCode?: string, calledAt?: string[] }} Criteria
 */
/**
 * On a row, grid.stops[ri].hub (on when present). stopId: the row's Quay when the hub was made (a row whose stop is
 * changed later makes the hub "lost"). stops: StopPlace ids (or Quay ids) where the feeder may arrive. window: minutes
 * before our departure in which its arrival counts. maxWait: how long our trip may be held. walk: minimum transfer.
 * @typedef {{ stopId: string, stops: string[], radiusM: number | null, window: [number, number], maxWait: number, walk: number, criteria: Criteria }} Hub
 */
/**
 * On our cell at a hub row, col.cells[ri].hubLink: the trip is picked; with `line` set, its approved link. line: the
 * feeder line's code; trip: the feeder trip's uid; stopId: the feeder's Quay; arr: its arrival in minutes (day offset
 * × 1440 included); at: when it was approved (ISO).
 * @typedef {{ line?: string, trip?: string, stopId?: string, arr?: number, at?: string }} HubLink
 */

/** A hub just turned on: a 2–15 minute window, held up to 5 minutes, feeders at our own StopPlace. @param {string} stopId @param {Map<string, any>} quayInfo @returns {Hub} */
export function newHub(stopId, quayInfo) {
  const sp = quayInfo.get(stopId)?.stopPlaceId;
  return { stopId, stops: [sp || stopId], radiusM: null, window: [2, 15], maxWait: 5, walk: 0, criteria: {} };
}

/** @param {{ stops: any[] }} grid @param {number} ri @returns {'none' | 'ok' | 'lost'} */
export function hubState(grid, ri) {
  const stop = grid.stops[ri];
  if (!stop?.hub) return 'none';
  return String(stop.stopId ?? '') === stop.hub.stopId ? 'ok' : 'lost';
}

/** The rows a hub can sit on: a stop's call, so a waiting stop once, at its departure row. @param {{ stops: any[] }} grid */
export function hubRows(grid) {
  return grid.stops.flatMap((s, ri) => (s.stopId != null && s.stopId !== '' && !s.isDwellArr ? [ri] : []));
}

const list = (/** @type {string[] | undefined} */ l) => (l ?? []).join(',');
const unlist = (/** @type {string | undefined} */ s) => (s ?? '').split(',').map((v) => v.trim()).filter(Boolean);
const num = (/** @type {string | undefined} */ s, /** @type {number} */ dflt) => { const n = parseInt(s ?? '', 10); return Number.isFinite(n) ? n : dflt; };

/** #KNP's fields after the row. @param {Hub} h @param {(s: string) => string} esc @returns {string} */
export function encodeHub(h, esc) {
  const c = h.criteria ?? {};
  return [h.stopId, list(h.stops), h.radiusM ?? '', h.window[0], h.window[1], h.maxWait, h.walk,
    list(c.authority), list(c.operator), c.mode ?? '', c.submode ?? '', esc(c.publicCode ?? ''), list(c.calledAt)].join(';');
}

/** @param {string[]} f the #KNP record's fields (f[1] is the row) @returns {Hub} */
export function decodeHub(f) {
  /** @type {Criteria} */
  const criteria = {};
  const put = (/** @type {keyof Criteria} */ k, /** @type {any} */ v) => { if (Array.isArray(v) ? v.length : v) criteria[k] = v; };
  put('authority', unlist(f[9])); put('operator', unlist(f[10]));
  put('mode', (f[11] ?? '').trim()); put('submode', (f[12] ?? '').trim()); put('publicCode', f[13] ?? '');
  put('calledAt', unlist(f[14]));
  const radius = parseInt(f[4] ?? '', 10);
  return { stopId: (f[2] ?? '').trim(), stops: unlist(f[3]), radiusM: Number.isFinite(radius) && radius > 0 ? radius : null,
    window: [num(f[5], 2), num(f[6], 15)], maxWait: num(f[7], 5), walk: num(f[8], 0), criteria };
}

/** #KNL's fields after column and row. @param {HubLink} l @returns {string} */
export function encodeLink(l) {
  return l.line ? [l.line, l.trip ?? '', l.stopId ?? '', l.arr ?? '', l.at ?? ''].join(';') : ';;;;';
}

/** @param {string[]} f the #KNL record's fields (f[1] column, f[2] row) @returns {HubLink} */
export function decodeLink(f) {
  const line = (f[3] ?? '').trim();
  if (!line) return {};
  return { line, trip: (f[4] ?? '').trim(), stopId: (f[5] ?? '').trim(), arr: num(f[6], 0), at: (f[7] ?? '').trim() };
}
