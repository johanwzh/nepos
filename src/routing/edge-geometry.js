// Positions along an edge's geometry, in metres from its from node, scaled so the whole edge measures len[e].
// A local flat projection is plenty at edge scale.

const Q = 1e7, R = 6371008.8, rad = Math.PI / 180;

/** Metres per 1e-7 degree at a latitude given at 1e-7. @param {number} latQ */
export const scaleAt = (latQ) => ({ x: rad * R * Math.cos((latQ / Q) * rad) / Q, y: rad * R / Q });

/** @param {import('./graph.js').Graph} G @param {number} e @returns {{ seg: Float64Array, ratio: number }} flat segment lengths and len / their sum */
function segments(G, e) {
  const s = scaleAt(G.lat[G.from[e]]), i0 = G.geoStart[e], n = G.geoStart[e + 1] - i0 - 1;
  const seg = new Float64Array(n);
  let total = 0;
  for (let i = 0; i < n; i++) {
    const k = (i0 + i) * 2;
    seg[i] = Math.hypot((G.geo[k + 2] - G.geo[k]) * s.x, (G.geo[k + 3] - G.geo[k + 1]) * s.y);
    total += seg[i];
  }
  return { seg, ratio: total ? G.len[e] / total : 1 };
}

/** [lon, lat] in degrees `at` metres along edge e. @param {import('./graph.js').Graph} G @param {number} e @param {number} at */
export function pointAt(G, e, at) {
  return sliceEdge(G, e, at, at)[0];
}

/**
 * The edge's line between a and b metres from its from node (a <= b), as [lon, lat] in degrees.
 * @param {import('./graph.js').Graph} G @param {number} e @param {number} a @param {number} b
 * @returns {[number, number][]}
 */
export function sliceEdge(G, e, a, b) {
  const { seg, ratio } = segments(G, e), i0 = G.geoStart[e], out = [];
  const at = (/** @type {number} */ i, /** @type {number} */ f) => {
    const k = (i0 + i) * 2;
    return /** @type {[number, number]} */ ([(G.geo[k] + (G.geo[k + 2] - G.geo[k]) * f) / Q, (G.geo[k + 1] + (G.geo[k + 3] - G.geo[k + 1]) * f) / Q]);
  };
  let run = 0;
  for (let i = 0; i < seg.length; i++) {
    const r0 = run, r1 = run + seg[i] * ratio, last = i === seg.length - 1;
    if (r1 >= a || last) {
      const len = r1 - r0, f = (/** @type {number} */ r) => (len ? Math.max(0, Math.min(1, (r - r0) / len)) : 0);
      if (!out.length) out.push(at(i, f(a)));
      if (r1 >= b || last) { out.push(at(i, f(b))); break; }
      out.push(at(i, 1));
    }
    run = r1;
  }
  return out;
}

/**
 * Nearest point of edge e to (px, py) at 1e-7: metres off and metres along.
 * @param {import('./graph.js').Graph} G @param {number} e @param {number} px @param {number} py
 */
export function nearestOnEdge(G, e, px, py) {
  const s = scaleAt(py), i0 = G.geoStart[e], n = G.geoStart[e + 1] - i0 - 1;
  let best = Infinity, bestAt = 0, run = 0;
  for (let i = 0; i < n; i++) {
    const k = (i0 + i) * 2;
    const ax = (G.geo[k] - px) * s.x, ay = (G.geo[k + 1] - py) * s.y, bx = (G.geo[k + 2] - px) * s.x, by = (G.geo[k + 3] - py) * s.y;
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, seg = Math.sqrt(l2);
    const t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
    const d = Math.hypot(ax + t * dx, ay + t * dy);
    if (d < best) { best = d; bestAt = run + t * seg; }
    run += seg;
  }
  return { off: best, at: Math.min(bestAt * (run ? G.len[e] / run : 1), G.len[e]) };
}
