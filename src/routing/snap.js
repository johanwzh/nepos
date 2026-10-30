// Snap candidates: every road edge near a stop or waypoint. The search picks among them (off-road metres cost time),
// so a stop is not glued to whatever road happens to be nearest.
import { RADIUS_M } from './cost.js';
import { CELL, cellKey } from './graph.js';
import { nearestOnEdge, pointAt, scaleAt } from './edge-geometry.js';

/**
 * @typedef {{ edge: number, at: number, off: number, lon: number, lat: number, d?: number }} Candidate
 *   at: metres from the edge's from node; off: metres from the point; lon/lat: the snap point; d: a saved snap's
 *   direction (0 = the way's node order), the only one allowed there
 * @typedef {{ way: number, lon: number, lat: number, along: boolean, off: number, road: string }} SnapRef
 *   a saved snap (one per Quay within a line); along: driving in the way's node order
 */

const Q = 1e7;
const REF_TOLERANCE_M = 10;

/** @param {import('./graph.js').Graph} G @param {number[]} edges @param {number} px @param {number} py @param {number} radius */
function near(G, edges, px, py, radius) {
  /** @type {Candidate[]} */
  const out = [];
  for (const e of edges) {
    const { off, at } = nearestOnEdge(G, e, px, py);
    if (off <= radius) {
      const [lon, lat] = pointAt(G, e, at);
      out.push({ edge: e, at, off, lon, lat });
    }
  }
  return out;
}

/** Edges whose buckets lie within `radius` of (px, py) at 1e-7. */
function edgesNear(G, px, py, radius) {
  const s = scaleAt(py), rx = Math.ceil(radius / s.x / CELL), ry = Math.ceil(radius / s.y / CELL);
  const cx0 = Math.floor(px / CELL), cy0 = Math.floor(py / CELL), seen = new Set();
  for (let cx = cx0 - rx; cx <= cx0 + rx; cx++)
    for (let cy = cy0 - ry; cy <= cy0 + ry; cy++)
      for (const e of G.cells.get(cellKey(cx, cy)) ?? []) seen.add(e);
  return [...seen];
}

/** @param {import('./graph.js').Graph} G @param {[number, number]} p [lon, lat] @param {number} [radius] @returns {Candidate[]} */
export function candidates(G, p, radius = RADIUS_M) {
  const px = Math.round(p[0] * Q), py = Math.round(p[1] * Q);
  return near(G, edgesNear(G, px, py, radius), px, py, radius);
}

/** 75 m, then 150, then 300; an empty list when even 300 m finds nothing. @param {import('./graph.js').Graph} G @param {[number, number]} p */
export function candidatesWidening(G, p) {
  let radius = RADIUS_M;
  for (;;) {
    const list = candidates(G, p, radius);
    if (list.length || radius >= RADIUS_M * 4) return { list, radius };
    radius *= 2;
  }
}

/** The candidate on the saved snap's way nearest its point (within 10 m), or null when the way or point is gone.
 *  @param {import('./graph.js').Graph} G @param {SnapRef} ref @returns {Candidate | null} */
export function fromRef(G, ref) {
  const px = Math.round(ref.lon * Q), py = Math.round(ref.lat * Q);
  const best = near(G, edgesNear(G, px, py, REF_TOLERANCE_M).filter((e) => G.way[e] === ref.way), px, py, REF_TOLERANCE_M)
    .sort((a, b) => a.off - b.off)[0];
  return best ? { ...best, off: ref.off, d: ref.along ? 0 : 1 } : null;
}
