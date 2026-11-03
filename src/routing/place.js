// Placing a saved route on the road data (design 2026-11-03 §8): the lowest limits along a route accepted before 2.6.1,
// or checked again on a newer build, without routing it. Each segment of the saved line is matched to the edge it runs
// along: both ends and the middle within half a metre, in the same direction (so a bridge crossing above is never
// counted). A route with a stretch no edge carries is not matched.
import { candidates } from './snap.js';
import { nearestOnEdge, pointAt } from './edge-geometry.js';
import { haversineM } from './geometry.js';

/** @typedef {import('../core/vehicle-limits.js').Limits} Limits */

const Q = 1e7;
const ON_M = 0.5;
const SHORT_M = 0.2;
const MAX_DEG = 20;
const LIMIT_ARRAYS = /** @type {const} */ ([['height', 'maxheight', 100], ['width', 'maxwidth', 100], ['length', 'maxlength', 10], ['weight', 'maxweight', 10]]);

/** @param {import('./graph.js').Graph} G @param {number} e @param {[number, number]} p */
const offEdge = (G, e, p) => nearestOnEdge(G, e, Math.round(p[0] * Q), Math.round(p[1] * Q));

/** The angle (0–90°) between two directions given as [dlon, dlat] at latitude lat, either way round. */
function angle(/** @type {[number, number]} */ u, /** @type {[number, number]} */ v, /** @type {number} */ lat) {
  const k = Math.cos(lat * Math.PI / 180);
  const a = Math.atan2(u[1], u[0] * k) - Math.atan2(v[1], v[0] * k);
  const deg = Math.abs(((a * 180 / Math.PI) % 180 + 180) % 180);
  return Math.min(deg, 180 - deg);
}

/**
 * @param {import('./graph.js').Graph} G @param {[number, number][]} coords the saved route, [lon, lat]
 * @returns {{ limits: Limits, matched: boolean }}
 */
export function placeRoute(G, coords) {
  /** @type {Limits} */
  const limits = {};
  let matched = true;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1], b = coords[i];
    if (haversineM(a, b) < SHORT_M) continue;
    const mid = /** @type {[number, number]} */ ([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
    const on = candidates(G, mid, ON_M).filter((c) => {
      if (offEdge(G, c.edge, a).off > ON_M || offEdge(G, c.edge, b).off > ON_M) return false;
      const p0 = pointAt(G, c.edge, Math.max(0, c.at - 1)), p1 = pointAt(G, c.edge, Math.min(G.len[c.edge], c.at + 1));
      return angle([b[0] - a[0], b[1] - a[1]], [p1[0] - p0[0], p1[1] - p0[1]], mid[1]) <= MAX_DEG;
    });
    if (!on.length) { matched = false; continue; }
    for (const c of on) {
      for (const [kind, arr, res] of LIMIT_ARRAYS) {
        const value = Math.round(G[arr][c.edge] * res) / res;
        if (!(value > 0) || (limits[kind] && /** @type {any} */ (limits[kind]).value <= value)) continue;
        limits[kind] = { kind, value, way: G.way[c.edge], road: G.road(c.edge), at: mid };
      }
    }
  }
  return { limits, matched };
}
