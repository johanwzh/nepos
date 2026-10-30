// What the map pane draws while a stop row is being picked (stop picking spec §5): the line's
// stops (faded, numbered, joined), the row's current Quay, search hits and browsed stop places,
// Quays of the open (or browsed, zoomed-in) stop places, and the candidate. Pure, so it is tested
// without a map.
import { modeMatches } from './quays.js';

/**
 * @typedef {{ kind: 'line' | 'current' | 'candidate' | 'place' | 'browsePlace' | 'quay', id: string,
 *             lat: number, lon: number, label: string, mode?: string, n?: number,
 *             state?: '' | 'current' | 'candidate' }} PickerMarker   state: a Quay that is the row's stop or the candidate
 */

/** @param {{ lat: number | null, lon: number | null } | null | undefined} p */
const placed = (p) => !!p && p.lat != null && p.lon != null;

/**
 * @param {{ lineStops: { n: number, stopId: string | null, name: string, info: any }[], row: number | null,
 *           current: any, candidate: any, hits: any[], place: any, browse: any[], browseQuays: any[],
 *           onlyMode: boolean, ernMode: string | number }} s   ernMode: the line's mode (or an old ERN code)
 * @returns {{ markers: PickerMarker[], line: [number, number][], fit: [number, number][] | null }}
 */
export function pickerMapModel(s) {
  /** @type {PickerMarker[]} */
  const markers = [];
  const rowStop = s.row == null ? null : s.lineStops[s.row];
  /** @type {[number, number][]} */
  const line = [];
  for (const st of s.lineStops) {
    if (!placed(st.info)) continue;
    line.push([st.info.lat, st.info.lon]);
    if (st === rowStop) continue;
    markers.push({ kind: 'line', id: String(st.stopId), lat: st.info.lat, lon: st.info.lon, label: st.name || st.info.stopPlaceName, n: st.n });
  }
  // Quays shown as squares: the row's stop and the candidate mark their own square (spec §5).
  /** @type {PickerMarker[]} */
  const quays = [];
  const placeOk = (/** @type {any} */ p) => !s.onlyMode || !s.ernMode || !p?.mode || modeMatches(s.ernMode, p.mode);
  for (const place of [s.place, ...s.browseQuays]) {
    if (!placeOk(place)) continue;
    for (const q of place?.quays ?? []) {
      if (quays.some((m) => m.id === q.quayId) || !placed(q)) continue;
      const state = s.candidate?.quayId === q.quayId ? 'candidate' : s.current?.quayId === q.quayId ? 'current' : '';
      quays.push({ kind: 'quay', id: q.quayId, lat: q.lat, lon: q.lon, label: q.publicCode, mode: place.mode, state });
    }
  }
  const shownAsQuay = (/** @type {any} */ x) => quays.some((m) => m.id === x?.quayId);
  if (placed(s.current) && !shownAsQuay(s.current)) markers.push({ kind: 'current', id: s.current.quayId, lat: s.current.lat, lon: s.current.lon, label: `${s.current.stopPlaceName} ${s.current.publicCode}`.trim() });

  /** @param {any} h */
  const modeOk = (h) => !s.onlyMode || !s.ernMode || !h.modes?.length || h.modes.some((/** @type {string} */ m) => modeMatches(s.ernMode, m));
  const hits = s.hits.filter(modeOk);
  const seen = new Set(s.place ? [s.place.id] : []);
  for (const h of hits) {
    if (seen.has(h.id) || !placed(h)) continue;
    seen.add(h.id);
    markers.push({ kind: 'place', id: h.id, lat: h.lat, lon: h.lon, label: h.name, mode: h.modes?.[0] ?? '' });
  }
  for (const h of s.browse.filter(modeOk)) {
    if (seen.has(h.id) || !placed(h)) continue;
    seen.add(h.id);
    markers.push({ kind: 'browsePlace', id: h.id, lat: h.lat, lon: h.lon, label: h.name, mode: h.modes?.[0] ?? '' });
  }
  markers.push(...quays);
  if (placed(s.candidate) && !shownAsQuay(s.candidate)) markers.push({ kind: 'candidate', id: s.candidate.quayId, lat: s.candidate.lat, lon: s.candidate.lon, label: `${s.candidate.stopPlaceName} ${s.candidate.publicCode}`.trim() });

  // What the view should show: the open stop place, else the hits, else the row's stop.
  /** @type {[number, number][] | null} */
  let fit = null;
  const pts = (/** @type {any[]} */ xs) => xs.filter(placed).map((x) => /** @type {[number, number]} */ ([x.lat, x.lon]));
  if (s.place && pts(s.place.quays).length) fit = pts(s.place.quays);
  else if (hits.length && pts(hits).length) fit = pts(hits);
  else if (placed(s.current)) fit = [[s.current.lat, s.current.lon]];
  return { markers, line, fit };
}
