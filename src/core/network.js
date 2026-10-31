// The network on Oversikt (dashboard design 2026-10-21): every stretch between two stops a trip calls at, drawn once
// however many lines and patterns use it, with the number of trips on it and whether a line with errors uses it.
// A stretch follows the line's routed link where a bus line has one (user 2026-10-31), else a straight line between
// the stops' NSR positions; stops without a position are left out. Main stops (bold in a timetable) are marked: the
// overview draws only those, small, so the map is not crowded with dots.
import { tripCols } from './blocks.js';
import { isExportable } from './link-state.js';
import { isRoadLine } from '../routing/profiles.js';
import { decodePolyline } from '../routing/geometry.js';

/**
 * @typedef {{ from: string, to: string, coords: [number, number][], trips: number, problem: boolean, lines: string[] }} Segment
 * @typedef {{ id: string, name: string, lon: number, lat: number, lines: number, main: boolean }} NetStop
 */

/** @param {any} cell */
const calls = (cell) => !!cell && !!cell.time && cell.time !== '|';

/**
 * @param {{ code: string, rs: any, problem: boolean, links?: Record<string, import('./link-state.js').SavedLink> }[]} routes
 *   the lines to draw; problem: the line has errors; links: the line's routed links
 * @param {Map<string, any>} quayInfo NSR's answers by Quay ID (lon, lat)
 * @returns {{ segments: Segment[], stops: NetStop[] }}
 */
export function networkOf(routes, quayInfo) {
  /** @type {Map<string, Segment & { lineSet: Set<string> }>} */
  const segments = new Map();
  /** @type {Map<string, NetStop & { lineSet: Set<string> }>} */
  const stops = new Map();
  /** @param {string} id */
  const pos = (id) => { const q = quayInfo.get(id); return q && (q.lon || q.lat) ? /** @type {[number, number]} */ ([q.lon, q.lat]) : null; };
  /** A stretch along the line's routed link (either way round), or null. @param {Record<string, any> | undefined} links @param {string} a @param {string} b */
  const routed = (links, a, b) => {
    for (const [key, flip] of /** @type {[string, boolean][]} */ ([[`${a}|${b}|bus`, false], [`${b}|${a}|bus`, true]])) {
      const l = links?.[key];
      if (l && isExportable(key, l, quayInfo)) {
        const c = /** @type {[number, number][]} */ (decodePolyline(l.polyline, l.precision ?? 6));
        return flip ? c.reverse() : c;
      }
    }
    return null;
  };
  for (const { code, rs, problem, links: all } of routes) {
    const links = isRoadLine(rs) ? all : undefined;
    for (const grid of Object.values(rs?.grids ?? {})) {
      const g = /** @type {any} */ (grid);
      for (const col of g.cols ? tripCols(g) : []) { // a block's trips count too
        /** @type {string[]} the stops this trip calls at, in order, a waiting stop once */
        const seq = [];
        /** @type {Set<string>} the stops that are bold in this timetable */
        const bold = new Set();
        (col.cells ?? []).forEach((/** @type {any} */ c, /** @type {number} */ ri) => {
          const id = g.stops[ri]?.stopId;
          if (!calls(c) || !id) return;
          if (g.stops[ri]?.bold) bold.add(String(id));
          if (seq[seq.length - 1] !== String(id)) seq.push(String(id));
        });
        for (const id of seq) {
          const p = pos(id);
          if (!p) continue;
          const s = stops.get(id) ?? { id, name: quayInfo.get(id)?.stopPlaceName ?? '', lon: p[0], lat: p[1], lines: 0, main: false, lineSet: new Set() };
          s.lineSet.add(code);
          s.main ||= bold.has(id);
          stops.set(id, s);
        }
        for (let i = 1; i < seq.length; i++) {
          const a = seq[i - 1], b = seq[i];
          const pa = pos(a), pb = pos(b);
          if (!pa || !pb) continue;
          const key = a < b ? `${a}|${b}` : `${b}|${a}`;
          const seg = segments.get(key) ?? { from: a, to: b, coords: [pa, pb], trips: 0, problem: false, lines: [], lineSet: new Set() };
          const road = seg.coords.length > 2 ? null : routed(links, a, b);
          if (road) seg.coords = seg.from === a ? road : road.reverse();
          seg.trips++;
          seg.problem ||= problem;
          seg.lineSet.add(code);
          segments.set(key, seg);
        }
      }
    }
  }
  return {
    segments: [...segments.values()].map(({ lineSet, ...s }) => ({ ...s, lines: [...lineSet].sort() })),
    stops: [...stops.values()].map(({ lineSet, ...s }) => ({ ...s, lines: lineSet.size })),
  };
}
