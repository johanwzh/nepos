// The network on Oversikt (dashboard design 2026-10-21): every stretch between two stops a trip calls at, drawn once
// however many lines and patterns use it, with the number of trips on it and whether a line with errors uses it.
// Straight lines between the stops' NSR positions (routing is off); stops without a position are left out.
import { tripCols } from './blocks.js';

/**
 * @typedef {{ from: string, to: string, coords: [number, number][], trips: number, problem: boolean, lines: string[] }} Segment
 * @typedef {{ id: string, name: string, lon: number, lat: number, lines: number }} NetStop
 */

/** @param {any} cell */
const calls = (cell) => !!cell && !!cell.time && cell.time !== '|';

/**
 * @param {{ code: string, rs: any, problem: boolean }[]} routes the lines to draw; problem: the line has errors
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
  for (const { code, rs, problem } of routes) {
    for (const grid of Object.values(rs?.grids ?? {})) {
      const g = /** @type {any} */ (grid);
      for (const col of g.cols ? tripCols(g) : []) { // a block's trips count too
        /** @type {string[]} the stops this trip calls at, in order, a waiting stop once */
        const seq = [];
        (col.cells ?? []).forEach((/** @type {any} */ c, /** @type {number} */ ri) => {
          const id = g.stops[ri]?.stopId;
          if (!calls(c) || !id || seq[seq.length - 1] === String(id)) return;
          seq.push(String(id));
        });
        for (const id of seq) {
          const p = pos(id);
          if (!p) continue;
          const s = stops.get(id) ?? { id, name: quayInfo.get(id)?.stopPlaceName ?? '', lon: p[0], lat: p[1], lines: 0, lineSet: new Set() };
          s.lineSet.add(code);
          stops.set(id, s);
        }
        for (let i = 1; i < seq.length; i++) {
          const a = seq[i - 1], b = seq[i];
          const pa = pos(a), pb = pos(b);
          if (!pa || !pb) continue;
          const key = a < b ? `${a}|${b}` : `${b}|${a}`;
          const seg = segments.get(key) ?? { from: a, to: b, coords: [pa, pb], trips: 0, problem: false, lines: [], lineSet: new Set() };
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
