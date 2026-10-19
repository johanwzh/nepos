// A Quay onto the network (Lasse's spec: Quay → network): the nearest edges within the profile's snap radius, at
// most one point per edge and K in all, nearest first. Several candidates handle a Quay beside a dual carriageway
// or among many station tracks: the search picks the one that gives the best path. Pure.
import { PROFILES } from './profiles.js';
import { projectOnSegment, haversineM } from './geometry.js';

/** Candidates this much further than the nearest are another road, not this stop's. */
const TIE_M = 3;

/**
 * @typedef {{ edge: number, seg: number, point: [number, number], alongM: number, distM: number }} SnapCandidate
 *   seg: the index of the segment's end vertex in the edge's geometry (1-based); alongM: from the edge's start
 */

/**
 * @param {import('./graph.js').Graph} g
 * @param {[number, number]} p the Quay, [lon, lat]
 * @param {import('./profiles.js').Profile} profile
 * @param {number} [K]
 * @returns {SnapCandidate[]}
 */
export function snap(g, p, profile, K = 4) {
  const radius = PROFILES[profile].snapRadiusM;
  const dLat = radius / 111000, dLon = radius / (111000 * Math.cos((p[1] * Math.PI) / 180));
  /** @type {SnapCandidate[]} */
  const out = [];
  g.edges.forEach((e, ei) => {
    let best = /** @type {SnapCandidate | null} */ (null);
    let along = 0;
    for (let s = 1; s < e.geom.length; s++) {
      const a = e.geom[s - 1], b = e.geom[s];
      const segLen = haversineM(a, b);
      if (Math.min(a[0], b[0]) - dLon > p[0] || Math.max(a[0], b[0]) + dLon < p[0] || Math.min(a[1], b[1]) - dLat > p[1] || Math.max(a[1], b[1]) + dLat < p[1]) { along += segLen; continue; }
      const { t, point } = projectOnSegment(p, a, b);
      const distM = haversineM(p, point);
      if (distM <= radius && (!best || distM < best.distM)) best = { edge: ei, seg: s, point, alongM: along + t * segLen, distM };
      along += segLen;
    }
    if (best) out.push(best);
  });
  // A stop belongs to the road it stands beside (Bjerke, 2026-10-19): only candidates within TIE_M of the nearest, so
  // every link through the stop uses the same road. Service roads count double, so a car park a little nearer does
  // not win over the main road. A stop between two roads (an island) keeps both.
  const score = (/** @type {SnapCandidate} */ c) => c.distM * (g.edges[c.edge].cls === 'service' ? 2 : 1);
  out.sort((x, y) => score(x) - score(y));
  const best = out.length ? score(out[0]) : 0;
  return out.filter((c) => score(c) <= best + TIE_M).slice(0, K);
}
