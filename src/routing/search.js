// The route search (design 2026-10-30 §5): a time-cost A* over directed edges, run leg by leg between the snap
// candidates of consecutive points, so memory stays one leg's worth. A state is a directed edge de = e * 2 + d ("drove
// e in direction d, now at its head"); at a point, a virtual state is (candidate, direction). Rules from the spike
// review: leave a point in the direction you arrived; never take back the edge just driven unless it is a dead end;
// bus turn restrictions apply; off-road metres between a point and its snap cost OFFROAD_S_PER_M and are never driven.
// A vehicle (backlog 92/93, design 2026-11-03): an edge it is over is never driven nor snapped to; each leg reports the
// lowest limits along it and the edges it drove. U-turns (backlog 107): with a U-turn length, a vehicle may turn at a
// stop, a waypoint or a node on a small slow road (graph uturnOk) for uturnSeconds(length); a dead end stays free and
// unreported; without one, the ban above holds.
import { createHeap } from './heap.js';
import { OFFROAD_S_PER_M } from './cost.js';
import { candidatesWidening, fromRef } from './snap.js';
import { scaleAt, sliceEdge, turnDeg, pointAt } from './edge-geometry.js';
import { isOver, uturnSeconds } from '../core/vehicle-limits.js';
import { rulesFor, MAX_TURN_DEG, CROSSING_MAX_DEG } from './rules.js';

/**
 * @typedef {import('./graph.js').Graph} Graph
 * @typedef {import('./snap.js').Candidate} Candidate
 * @typedef {import('./snap.js').SnapRef} SnapRef
 * @typedef {{ lon: number, lat: number, via?: boolean, fixed?: SnapRef }} ChainPoint
 * @typedef {import('../core/vehicle-limits.js').Limits} Limits
 * @typedef {{ at: [number, number], road: string, where: 'stop' | 'waypoint' | 'node' }} UTurn
 * @typedef {{ metres: number, ferryMetres: number, seconds: number, coords: [number, number][], roads: string[], limits: Limits, edges: number[], uturns: UTurn[] }} Leg
 * @typedef {SnapRef & { refLost?: boolean, radius: number }} Snap
 * @typedef {{ ok: true, legs: Leg[], snaps: Snap[], ms: number, settled: number }
 *   | { ok: false, error: 'no-road' | 'no-route', point?: number, leg?: number, blockedSnap?: { point: number, edge: number } }} ChainResult
 *   blockedSnap: the stop or waypoint whose only roads (or saved snap) the vehicle cannot use
 * @typedef {{ edge: number, d: number, a: number, b: number }} Piece  driven on edge from a to b metres (from its from node)
 */

const Q = 1e7;
/** After the best target, keep searching this long for the other targets (they may suit the next leg better). */
const SLACK_S = 600;

/** Per-graph scratch arrays, reused across searches. @type {WeakMap<Graph, { dist: Float64Array, prev: Int32Array, done: Uint8Array }>} */
const scratch = new WeakMap();

/**
 * The graph's profile sets the snap radius, the top speed and whether track turns are checked (rules.js). vehicle: its
 * sizes (none: no limits); uturnLength: the length a U-turn is costed by (none: no U-turns but at dead ends).
 * @param {Graph} G @param {ChainPoint[]} points
 * @param {{ offroad?: number, radius?: number, vmax?: number, track?: boolean, turnAtStops?: boolean, vehicle?: import('../core/vehicle-limits.js').Sizes, uturnLength?: number }} [opts] @returns {ChainResult}
 */
export function routeChain(G, points, opts = {}) {
  const rules = rulesFor(G.profile);
  const { offroad = OFFROAD_S_PER_M, radius: radius0 = rules.radius, vmax = rules.vmax, track = rules.track, turnAtStops = !!rules.turnAtStops } = opts;
  const t0 = performance.now();
  /** @type {Candidate[][]} */
  const cands = [];
  const refLost = [], radius = [];
  const canDrive = (e, d) => G.dir[e] === 0 || G.dir[e] === (d ? 2 : 1);
  const v = opts.vehicle;
  /** An edge this vehicle is over (never driven, never snapped to). @param {number} e */
  const cannot = v ? (e) => isOver('height', G.maxheight[e], v.height) || isOver('width', G.maxwidth[e], v.width)
    || isOver('length', G.maxlength[e], v.length) || isOver('weight', G.maxweight[e], v.weight) : () => false;
  /** The leg a point lies on: a stop's the one arriving at it (the first stop's the first leg), a waypoint's its own. @param {number} i */
  const legAt = (i) => { let before = 0; for (let j = 0; j < i; j++) if (j === 0 || !points[j].via) before++; return Math.max(0, before - 1); };
  const uturnCost = opts.uturnLength != null ? uturnSeconds(opts.uturnLength) : null;
  /** What leaving point p the other way from its arrival costs on candidate c (null: not allowed). A boat turns at a quay
   *  for free (user 2026-11-01), a road vehicle on a small slow road for its U-turn cost. @param {ChainPoint} p @param {Candidate} c */
  const turnCost = (p, c) => (turnAtStops ? (p.via ? null : 0) : uturnCost != null && G.uturnOk[c.edge] ? uturnCost : null);
  const blocked = (/** @type {number} */ i, /** @type {number} */ edge) => /** @type {ChainResult} */ ({ ok: false, error: 'no-route', point: i, leg: legAt(i), blockedSnap: { point: i, edge } });
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const fixed = p.fixed ? fromRef(G, p.fixed) : null;
    // a boat may arrive and leave either way at a quay: its saved snap keeps the place, not the direction
    const ref = fixed && turnAtStops ? { ...fixed, d: undefined } : fixed;
    if (ref && canDrive(ref.edge, ref.d)) {
      if (cannot(ref.edge)) return blocked(i, ref.edge);
      cands.push([ref]); radius.push(0); refLost.push(false); continue;
    }
    const w = candidatesWidening(G, [p.lon, p.lat], radius0);
    if (!w.list.length) return { ok: false, error: 'no-road', point: i };
    // A stop is a kerb: one whose roads near it are all closed to the vehicle is not moved to another road further off
    const list = w.list.filter((c) => !cannot(c.edge));
    if (!list.length) return blocked(i, w.list[0].edge);
    cands.push(list); radius.push(w.radius); refLost.push(!!p.fixed);
  }

  // Virtual states of point i: index c * 2 + d. cost[i][s] = best time to stand there; back[i][s] = how.
  /** @type {Float64Array[]} */
  const cost = [];
  /** @type {({ from: number, pieces: Piece[] } | null)[][]} */
  const back = [];
  cost.push(new Float64Array(cands[0].length * 2).fill(Infinity));
  back.push(new Array(cands[0].length * 2).fill(null));
  cands[0].forEach((c, ci) => { for (const d of [0, 1]) if (canDrive(c.edge, d) && (c.d === undefined || c.d === d)) cost[0][ci * 2 + d] = offroad * c.off; });
  /** turned[i][s]: state s of point i is left the other way from the arrival, by a U-turn with a cost. @type {Uint8Array[]} */
  const turned = [new Uint8Array(cands[0].length * 2)];
  // The first stop's kerb faces one way: a vehicle may turn there and leave the other way
  cands[0].forEach((c, ci) => {
    const t = c.d === undefined ? null : turnCost(points[0], c), o = 1 - /** @type {number} */ (c.d);
    if (t && canDrive(c.edge, o)) { cost[0][ci * 2 + o] = offroad * c.off + t; turned[0][ci * 2 + o] = 1; }
  });

  let settled = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    const leg = searchLeg(G, cands[i], cost[i], cands[i + 1], points[i + 1], offroad, canDrive, vmax, track, cannot, uturnCost);
    settled += leg.settled;
    if (!leg.cost.some(Number.isFinite)) {
      let stops = 0;
      for (let j = 0; j <= i; j++) if (j === 0 || !points[j].via) stops++;
      return { ok: false, error: 'no-route', leg: stops - 1 };
    }
    // Leaving a point the way it came: a boat at a quay, a road vehicle on a small slow road (turnCost)
    const cs = cands[i + 1], here = new Uint8Array(cs.length * 2);
    if (i + 1 < points.length - 1) {
      const arrived = leg.cost.slice(), how = leg.back.slice();
      for (let c = 0; c < cs.length; c++) {
        const t = turnCost(points[i + 1], cs[c]);
        if (t === null) continue;
        for (const d of [0, 1]) {
          const s = c * 2 + d, o = c * 2 + 1 - d;
          if (Number.isFinite(arrived[o]) && arrived[o] + t < leg.cost[s] && canDrive(cs[c].edge, d)) {
            leg.cost[s] = arrived[o] + t; leg.back[s] = how[o]; here[s] = t > 0 ? 1 : 0;
          }
        }
      }
    }
    cost.push(leg.cost); back.push(leg.back); turned.push(here);
  }

  // The cheapest state at the last point, walked back to the first.
  const last = points.length - 1;
  let s = cost[last].indexOf(Math.min(...cost[last]));
  /** @type {Piece[][]} */
  const searchLegs = [];
  const chosen = new Array(points.length);
  for (let i = last; i >= 0; i--) {
    chosen[i] = s;
    if (i > 0) { const b = back[i][s]; searchLegs[i - 1] = b.pieces; s = b.from; }
  }

  /** @type {Leg[]} */
  const legs = [];
  let cur = newLeg();
  for (let i = 0; i < searchLegs.length; i++) {
    if (turned[i][chosen[i]]) {
      const c = cands[i][chosen[i] >> 1];
      cur.uturns.push({ at: [c.lon, c.lat], road: G.road(c.edge), where: i === 0 || !points[i].via ? 'stop' : 'waypoint' });
    }
    /** @type {Piece | null} */
    let prev = null;
    for (const pc of searchLegs[i]) {
      if (prev && uturnCost !== null && pc.edge === prev.edge && pc.d !== prev.d) {
        const v = prev.d ? G.from[prev.edge] : G.to[prev.edge], back = (prev.edge * 2 + prev.d) ^ 1;
        let deadEnd = !G.open[v];
        for (let k = G.out.start[v]; k < G.out.start[v + 1]; k++) if (G.out.de[k] !== back) deadEnd = false;
        if (!deadEnd) cur.uturns.push({ at: [G.lon[v] / Q, G.lat[v] / Q], road: G.road(prev.edge), where: 'node' });
      }
      addPiece(G, cur, pc);
      prev = pc;
    }
    if (i + 1 === last || !points[i + 1].via) { legs.push(cur); cur = newLeg(); }
  }
  const snaps = chosen.map((st, i) => {
    const c = cands[i][st >> 1], e = c.edge;
    // the kerb is the way the vehicle arrived: a turned state leaves the other way
    const arrived = turned[i][st] ? 1 - (st & 1) : st & 1;
    /** @type {Snap} */
    const snap = { way: G.way[e], lon: c.lon, lat: c.lat, along: arrived === 0, off: c.off, road: G.road(e), radius: radius[i] };
    if (refLost[i]) snap.refLost = true;
    return snap;
  });
  return { ok: true, legs, snaps, ms: performance.now() - t0, settled };
}

/** @returns {Leg} */
const newLeg = () => ({ metres: 0, ferryMetres: 0, seconds: 0, coords: [], roads: [], limits: {}, edges: [], uturns: [] });

/** The limit arrays of the graph by kind, and the resolution the tiles store them at. */
const LIMIT_ARRAYS = /** @type {const} */ ([['height', 'maxheight', 100], ['width', 'maxwidth', 100], ['length', 'maxlength', 10], ['weight', 'maxweight', 10]]);

/** @param {Graph} G @param {Leg} leg @param {Piece} pc */
function addPiece(G, leg, pc) {
  const lo = Math.min(pc.a, pc.b), hi = Math.max(pc.a, pc.b), m = hi - lo;
  if (m <= 0) return;
  leg.metres += m; leg.seconds += m * G.spm[pc.edge];
  if (G.ferry[pc.edge]) leg.ferryMetres += m;
  const part = sliceEdge(G, pc.edge, lo, hi);
  if (pc.d) part.reverse();
  for (const p of part) {
    const l = leg.coords[leg.coords.length - 1];
    if (!l || l[0] !== p[0] || l[1] !== p[1]) leg.coords.push(p);
  }
  const road = G.road(pc.edge);
  if (road && leg.roads[leg.roads.length - 1] !== road) leg.roads.push(road);
  if (leg.edges[leg.edges.length - 1] !== pc.edge) leg.edges.push(pc.edge);
  for (const [kind, arr, res] of LIMIT_ARRAYS) {
    const value = Math.round(G[arr][pc.edge] * res) / res;
    if (!(value > 0) || (leg.limits[kind] && /** @type {any} */ (leg.limits[kind]).value <= value)) continue;
    const [lon, lat] = pointAt(G, pc.edge, (lo + hi) / 2);
    leg.limits[kind] = { kind, value, way: G.way[pc.edge], road, at: [lon, lat] };
  }
}

/**
 * One search from the virtual states of a point (costs in `start`) to every virtual state of the next point.
 * @param {Graph} G @param {Candidate[]} from @param {Float64Array} start @param {Candidate[]} to @param {ChainPoint} target
 * @param {number} offroad @param {(e: number, d: number) => boolean} canDrive @param {number} vmax @param {boolean} track
 * @param {(e: number) => boolean} cannot an edge the vehicle may not use @param {number | null} uturnCost a U-turn on a small slow road (null: none)
 */
function searchLeg(G, from, start, to, target, offroad, canDrive, vmax, track, cannot, uturnCost) {
  let sc = scratch.get(G);
  if (!sc) {
    const n = G.edges * 2;
    sc = { dist: new Float64Array(n).fill(Infinity), prev: new Int32Array(n), done: new Uint8Array(n) };
    scratch.set(G, sc);
  }
  const { dist, prev, done } = sc;
  const touched = [];
  const nT = to.length * 2;
  const tCost = new Float64Array(nT).fill(Infinity);
  // How each target was reached: from settled state tPrev onto directed edge tEnter, or straight from source tSrc
  // on the same edge (tPrev = -1).
  const tPrev = new Int32Array(nT).fill(-1), tEnter = new Int32Array(nT).fill(-1), tSrc = new Int32Array(nT).fill(-1);
  const tDone = new Uint8Array(nT);
  const toByEdge = new Map();
  to.forEach((c, i) => { const l = toByEdge.get(c.edge); l ? l.push(i) : toByEdge.set(c.edge, [i]); });

  // A* bound: straight distance to the next point, less the widest snap, at the top speed.
  const tx = target.lon * Q, ty = target.lat * Q, sx = scaleAt(ty).x * 0.99, sy = scaleAt(ty).y * 0.99;
  const reach = Math.max(...to.map((c) => c.off));
  const h = (x, y) => Math.max(0, Math.hypot((x - tx) * sx, (y - ty) * sy) - reach) / vmax;

  // Heap ids: a real state de, or -(1 + target index).
  const heap = createHeap(1024);
  const head = (de) => (de & 1 ? G.from[de >> 1] : G.to[de >> 1]);
  const relax = (de, g, p) => {
    if (g >= dist[de]) return;
    if (dist[de] === Infinity) touched.push(de);
    dist[de] = g; prev[de] = p;
    const v = head(de);
    heap.push(de, g + h(G.lon[v], G.lat[v]));
  };
  const reachTarget = (ti, g, prevDe, enter, src) => {
    if (g >= tCost[ti]) return;
    tCost[ti] = g; tPrev[ti] = prevDe; tEnter[ti] = enter; tSrc[ti] = src;
    heap.push(-1 - ti, g);
  };
  /** Targets on edge e driven in direction d, from position a (metres from the from node); arriving costs g at a. */
  const targetsOn = (e, d, a, g, prevDe, enter, src) => {
    for (const ci of toByEdge.get(e) ?? []) {
      if (to[ci].d !== undefined && to[ci].d !== d) continue;
      const ahead = d ? a - to[ci].at : to[ci].at - a;
      if (ahead >= 0) reachTarget(ci * 2 + d, g + ahead * G.spm[e] + offroad * to[ci].off, prevDe, enter, src);
    }
  };

  for (let s = 0; s < start.length; s++) {
    const g = start[s];
    if (!Number.isFinite(g)) continue;
    const c = from[s >> 1], d = s & 1, e = c.edge;
    relax(e * 2 + d, g + (d ? c.at : G.len[e] - c.at) * G.spm[e], -1 - s);
    targetsOn(e, d, c.at, g, -1, -1, s);
  }

  let settled = 0, best = Infinity, left = nT;
  while (heap.size()) {
    const key = heap.peekPriority();
    if (key > best + SLACK_S) break;
    const id = heap.pop();
    if (id < 0) {
      const ti = -1 - id;
      if (tDone[ti]) continue;
      tDone[ti] = 1; settled++;
      best = Math.min(best, tCost[ti]);
      if (--left === 0) break;
      continue;
    }
    const de = id;
    if (done[de]) continue;
    done[de] = 1; settled++;
    const g = dist[de], v = head(de), back = de ^ 1;
    const r = G.restrict.get(de);
    const o0 = G.out.start[v], o1 = G.out.start[v + 1];
    let deadEnd = !G.open[v];            // the edge of the loaded tiles is no dead end: fail there, load more
    for (let k = o0; k < o1; k++) if (G.out.de[k] !== back) { deadEnd = false; break; }
    for (let k = o0; k < o1; k++) {
      const de2 = G.out.de[k], e2 = de2 >> 1, d2 = de2 & 1;
      let extra = 0;
      if (de2 === back && !deadEnd) {
        if (uturnCost === null || !G.uturnOk[e2]) continue;
        extra = uturnCost;
      }
      if (cannot(e2)) continue;
      if (r && (r.no.has(e2) || (r.only >= 0 && r.only !== e2))) continue;
      // a train does not reverse through a switch, nor turn onto the track it crosses
      if (track && de2 !== back && turnDeg(G, de, de2) > (G.cross[v] ? CROSSING_MAX_DEG : MAX_TURN_DEG)) continue;
      relax(de2, g + extra + G.len[e2] * G.spm[e2], de);
      targetsOn(e2, d2, d2 ? G.len[e2] : 0, g + extra, de, de2, -1);
    }
  }

  // Paths back to the source state for every target reached.
  const backs = new Array(nT).fill(null);
  for (let ti = 0; ti < nT; ti++) {
    if (!Number.isFinite(tCost[ti])) continue;
    const c2 = to[ti >> 1], d2 = ti & 1;
    /** @type {Piece[]} */
    const pieces = [];
    let src;
    if (tPrev[ti] < 0) {
      src = tSrc[ti];
      pieces.push({ edge: c2.edge, d: d2, a: from[src >> 1].at, b: c2.at });
    } else {
      const e2 = tEnter[ti] >> 1;
      pieces.push({ edge: e2, d: d2, a: d2 ? G.len[e2] : 0, b: c2.at });
      let de = tPrev[ti];
      for (;;) {
        if (de < 0) { src = -1 - de; break; }
        const e = de >> 1, d = de & 1, p = prev[de];
        if (p < 0) {
          src = -1 - p;
          pieces.push({ edge: e, d, a: from[src >> 1].at, b: d ? 0 : G.len[e] });
          break;
        }
        pieces.push({ edge: e, d, a: d ? G.len[e] : 0, b: d ? 0 : G.len[e] });
        de = p;
      }
    }
    pieces.reverse();
    backs[ti] = { from: src, pieces };
  }
  for (const de of touched) { dist[de] = Infinity; done[de] = 0; }
  return { cost: tCost, back: backs, settled };
}
