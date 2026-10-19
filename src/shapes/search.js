// The search (Lasse's spec: edge-based A* with turn constraints). A state is a directed edge, not a node, so the
// turn between two edges can be judged: above the profile's hard limit it is not allowed (no train reversing
// through a switch), above the soft limit it costs the profile's turn cost (a bus U-turn). It starts from the
// snapped points of the first Quay (several candidates) and ends at any candidate of the second. Pure.
import { PROFILES } from './profiles.js';
import { createHeap } from './heap.js';
import { haversineM, bearing, turnAngle, lengthM } from './geometry.js';

/** @typedef {[number, number]} LonLat */
/** @typedef {import('./snap.js').SnapCandidate} SnapCandidate */
/**
 * @typedef {{ coords: LonLat[], distanceM: number, cost: number, arriveBearing: number, warnings: string[] }} RouteResult
 */

/** Weight of the distance from a Quay to the network (near candidates win unless a far one is much better). */
const SNAP_WEIGHT = 3;

/** The forward and reverse directed edge of every edge (-1 when that way is not allowed). @param {import('./graph.js').Graph} g */
function dirsOf(g) {
  const any = /** @type {any} */ (g);
  if (any._dirs) return /** @type {Int32Array} */ (any._dirs);
  const dirs = new Int32Array(g.edges.length * 2).fill(-1);
  for (let d = 0; d < g.dEdge.length; d++) dirs[g.dEdge[d] * 2 + (g.dRev[d] ? 1 : 0)] = d;
  any._dirs = dirs;
  return dirs;
}

/** Consecutive duplicate points out. @param {LonLat[]} pts */
function clean(pts) {
  return pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
}

/**
 * @param {import('./graph.js').Graph} g
 * @param {SnapCandidate[]} fromCands
 * @param {SnapCandidate[]} toCands
 * @param {import('./profiles.js').Profile} profile
 * @param {{ arriveBearing?: number | null, maxSettled?: number, fromPoint?: LonLat, toPoint?: LonLat }} [opts]
 * @returns {RouteResult | null}
 */
export function route(g, fromCands, toCands, profile, opts = {}) {
  const first = search(g, fromCands, toCands, profile, opts.arriveBearing ?? null, opts);
  if (first || opts.arriveBearing == null) return first;
  // No way on in the direction it arrived: it turns back at the stop (a terminus, a train changing direction)
  const again = search(g, fromCands, toCands, profile, null, opts);
  if (again) again.warnings.push('reversed at stop');
  return again;
}

/**
 * @param {import('./graph.js').Graph} g @param {SnapCandidate[]} fromCands @param {SnapCandidate[]} toCands
 * @param {import('./profiles.js').Profile} profile @param {number | null} arriveBearing
 * @param {{ maxSettled?: number, fromPoint?: LonLat, toPoint?: LonLat }} opts
 * @returns {RouteResult | null}
 */
function search(g, fromCands, toCands, profile, arriveBearing, opts) {
  if (!fromCands.length || !toCands.length) return null;
  const rules = PROFILES[profile];
  const dirs = dirsOf(g);
  const D = g.dEdge.length;
  const cost = new Float64Array(D).fill(Infinity);
  const prev = new Int32Array(D).fill(-1);
  const startOf = new Int32Array(D).fill(-1); // the from-candidate a start state began at
  const heap = createHeap(256);
  const maxSettled = opts.maxSettled ?? 500000;
  const turnOk = (/** @type {number} */ inB, /** @type {number} */ outB) => turnAngle(inB, outB) <= rules.hardTurn;
  const signed = (/** @type {number} */ inB, /** @type {number} */ outB) => ((outB - inB + 540) % 360) - 180;
  /** @param {number} inB @param {number} outB @param {number} node */
  const turnCost = (inB, outB, node) => (rules.turnCost ? rules.turnCost(signed(inB, outB), (g.degree?.[node] ?? 0) > 2)
    : turnAngle(inB, outB) > rules.softTurn ? rules.softCost : 0);
  const accessPerM = rules.accessPerM ?? SNAP_WEIGHT;
  /** A start or a goal may begin heading `b` only within the hard limit of the arrival bearing. @param {number} b */
  const startOk = (b) => arriveBearing == null || turnOk(arriveBearing, b);

  // Heuristic: straight distance to the nearest target, at the cheapest penalty (admissible)
  const hNode = new Float64Array(g.nodeLon.length).fill(-1);
  const h = (/** @type {number} */ n) => {
    if (hNode[n] < 0) {
      let best = Infinity;
      for (const t of toCands) best = Math.min(best, haversineM([g.nodeLon[n], g.nodeLat[n]], t.point));
      hNode[n] = best * rules.minPenalty;
    }
    return hNode[n];
  };

  /** @type {{ total: number, from: number, tc: number, rev: boolean, coords?: LonLat[] }[]} goals; ids D + index in the heap */
  const goals = [];
  const pushGoal = (/** @type {any} */ goal) => { goals.push(goal); heap.push(D + goals.length - 1, goal.total); };

  const segBearing = (/** @type {LonLat[]} */ geom, /** @type {number} */ seg, /** @type {boolean} */ rev) => (rev ? bearing(geom[seg], geom[seg - 1]) : bearing(geom[seg - 1], geom[seg]));

  // Start states: from each candidate, along its edge both ways (where allowed)
  fromCands.forEach((c, ci) => {
    const e = g.edges[c.edge];
    const access = c.distM * accessPerM;
    for (const rev of [false, true]) {
      const d = dirs[c.edge * 2 + (rev ? 1 : 0)];
      if (d < 0 || !startOk(segBearing(e.geom, c.seg, rev))) continue;
      const share = e.lengthM ? (rev ? c.alongM : e.lengthM - c.alongM) / e.lengthM : 0;
      const gc = access + e.cost * share;
      if (gc < cost[d]) { cost[d] = gc; startOf[d] = ci; prev[d] = -1; heap.push(d, gc + h(g.dTo[d])); }
      // The second Quay on the same edge, further along this way
      toCands.forEach((t, ti) => {
        if (t.edge !== c.edge) return;
        if (rev ? t.alongM > c.alongM : t.alongM < c.alongM) return;
        const part = e.lengthM ? (Math.abs(t.alongM - c.alongM) / e.lengthM) * e.cost : 0;
        const mid = rev ? e.geom.slice(t.seg, c.seg).reverse() : e.geom.slice(c.seg, t.seg);
        pushGoal({ total: access + part + t.distM * accessPerM, from: -1, tc: ti, rev, coords: [c.point, ...mid, t.point] });
      });
    }
  });

  let settled = 0;
  while (heap.size()) {
    if (++settled > maxSettled) return null;
    const p = heap.pop();
    if (p >= D) return finish(g, goals[p - D], toCands, fromCands, prev, startOf, opts);
    const n = g.dTo[p];
    const base = cost[p];
    const inB = g.dBIn[p];
    for (const d2 of g.out[n]) {
      const outB = g.dBOut[d2];
      if (!turnOk(inB, outB)) continue;
      const nc = base + g.dCost[d2] + turnCost(inB, outB, n);
      if (nc < cost[d2]) { cost[d2] = nc; prev[d2] = p; startOf[d2] = -1; heap.push(d2, nc + h(g.dTo[d2])); }
    }
    // A target on an edge leaving this node
    toCands.forEach((t, ti) => {
      const f = g.edges[t.edge];
      for (const rev of [false, true]) {
        if ((rev ? f.to : f.from) !== n) continue;
        const d = dirs[t.edge * 2 + (rev ? 1 : 0)];
        if (d < 0) continue;
        const outB = g.dBOut[d];
        if (!turnOk(inB, outB)) continue;
        const share = f.lengthM ? (rev ? f.lengthM - t.alongM : t.alongM) / f.lengthM : 0;
        pushGoal({ total: base + f.cost * share + turnCost(inB, outB, n) + t.distM * accessPerM, from: p, tc: ti, rev });
      }
    });
  }
  return null;
}

/**
 * Walk back from the goal and join the geometry, Quay to Quay.
 * @param {import('./graph.js').Graph} g @param {any} goal @param {SnapCandidate[]} toCands @param {SnapCandidate[]} fromCands
 * @param {Int32Array} prev @param {Int32Array} startOf @param {{ fromPoint?: LonLat, toPoint?: LonLat }} opts
 * @returns {RouteResult}
 */
function finish(g, goal, toCands, fromCands, prev, startOf, opts) {
  /** @type {LonLat[]} */
  let net;
  if (goal.from < 0) net = goal.coords;
  else {
    /** @type {number[]} */
    const chain = [];
    for (let d = goal.from; d >= 0; d = prev[d]) chain.push(d);
    chain.reverse();
    const d0 = chain[0];
    const c = fromCands[startOf[d0]];
    const e0 = g.edges[g.dEdge[d0]];
    net = g.dRev[d0] ? [c.point, ...e0.geom.slice(0, c.seg).reverse()] : [c.point, ...e0.geom.slice(c.seg)];
    for (const d of chain.slice(1)) {
      const geom = g.edges[g.dEdge[d]].geom;
      net.push(...(g.dRev[d] ? geom.slice().reverse() : geom));
    }
    const t = toCands[goal.tc];
    const f = g.edges[t.edge];
    net.push(...(goal.rev ? f.geom.slice(t.seg).reverse() : f.geom.slice(0, t.seg)), t.point);
  }
  net = clean(net);
  const coords = clean([...(opts.fromPoint ? [opts.fromPoint] : []), ...net, ...(opts.toPoint ? [opts.toPoint] : [])]);
  const arriveBearing = net.length > 1 ? bearing(net[net.length - 2], net[net.length - 1]) : 0;
  return { coords, distanceM: lengthM(coords), cost: goal.total, arriveBearing, warnings: [] };
}
