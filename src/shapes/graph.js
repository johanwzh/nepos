// The routing graph for one profile (Lasse's spec: graph construction). Vector tiles have no topology, so it is
// rebuilt from drawing data: lines meet where they share a global integer vertex. Bridges and tunnels get their
// own namespace (brunnel + layer) so a bridge never joins the road under it; a bridge or tunnel line's ends also
// belong to the ground, so it joins the roads at its ends. Lines are split at every shared vertex, then each piece
// becomes one or two directed edges with bearings at both ends (for the turn rules in the search). Pure.
import { PROFILES } from './profiles.js';
import { tileToLonLat, haversineM, bearing } from './geometry.js';

/** @typedef {import('./tiles.js').DecodedLine} DecodedLine */
/** @typedef {[number, number]} LonLat */
/**
 * @typedef {{ from: number, to: number, lengthM: number, cost: number, geom: LonLat[], cls: string, oneway: number }} Edge
 * @typedef {{ nodeLon: number[], nodeLat: number[], edges: Edge[],
 *             dEdge: number[], dRev: boolean[], dFrom: number[], dTo: number[], dCost: number[], dBOut: number[], dBIn: number[],
 *             out: number[][], nodeAt: (gx: number, gy: number) => number, profile: import('./profiles.js').Profile }} Graph
 *   d*: directed edges (dRev: against the edge's geometry); out[node]: the directed edges leaving it
 */

/** How far into an edge its end bearing is measured, so quantization noise does not fake sharp angles. */
const BEARING_M = 10;

/** @param {LonLat[]} geom */
function startBearing(geom) {
  let m = 0;
  for (let i = 1; i < geom.length; i++) {
    m += haversineM(geom[i - 1], geom[i]);
    if (m >= BEARING_M || i === geom.length - 1) return bearing(geom[0], geom[i]);
  }
  return 0;
}
/** The bearing arriving at the end of geom. @param {LonLat[]} geom */
function endBearing(geom) {
  let m = 0;
  for (let i = geom.length - 2; i >= 0; i--) {
    m += haversineM(geom[i + 1], geom[i]);
    if (m >= BEARING_M || i === 0) return bearing(geom[i], geom[geom.length - 1]);
  }
  return 0;
}

/** A line end this close to another line's segment (in tile units, ~0.3 m each at z14) is a junction. */
const T_JOIN_UNITS = 2;
const CELL = 64;

/**
 * T-junctions (added to Lasse's spec after testing on the Oslo tiles, 2026-10-19): the tiles often drop the vertex
 * where a side road meets a through road, so the side road's end lies on the middle of a segment and nothing joins
 * them. Each line end within T_JOIN_UNITS of another line's segment (on the ground, or in the same bridge or tunnel)
 * is inserted into that line as a vertex, so the two share it. Changes `lines` in place (callers pass copies).
 * @param {DecodedLine[]} lines
 */
function joinTJunctions(lines) {
  const space = (/** @type {DecodedLine} */ l) => (l.props.brunnel ? `${l.props.brunnel}:${l.props.layer ?? ''}` : '');
  /** @type {Map<string, number>} how many line vertices sit on each point */
  const at = new Map();
  for (const l of lines) for (const [x, y] of l.points) at.set(`${x},${y}`, (at.get(`${x},${y}`) ?? 0) + 1);

  // Near-miss line ends (Lasse's spec, stitching fallback; found at Bjerke, 2026-10-19): a road cut at a tile edge can
  // end one unit short of where its next piece starts. A loose end within T_JOIN_UNITS of another loose end moves
  // onto it, so the two share a vertex.
  /** @type {Map<string, [number, number][]>} grid cell → loose line ends */
  const ends = new Map();
  const loose = (/** @type {[number, number]} */ p) => (at.get(`${p[0]},${p[1]}`) ?? 0) === 1;
  for (const l of lines) for (const p of [l.points[0], l.points[l.points.length - 1]]) {
    if (!loose(p)) continue;
    const k = `${Math.floor(p[0] / CELL)},${Math.floor(p[1] / CELL)}`;
    let list = ends.get(k);
    if (!list) { list = []; ends.set(k, list); }
    list.push(p);
  }
  for (const l of lines) for (const i of [0, l.points.length - 1]) {
    const p = l.points[i];
    if (!loose(p)) continue;
    const [cx, cy] = [Math.floor(p[0] / CELL), Math.floor(p[1] / CELL)];
    let hit = /** @type {[number, number] | null} */ (null);
    for (let dx = -1; dx <= 1 && !hit; dx++) for (let dy = -1; dy <= 1 && !hit; dy++) {
      for (const q of ends.get(`${cx + dx},${cy + dy}`) ?? []) {
        if (q === p || (q[0] === p[0] && q[1] === p[1])) continue;
        if (Math.abs(q[0] - p[0]) <= T_JOIN_UNITS && Math.abs(q[1] - p[1]) <= T_JOIN_UNITS) { hit = q; break; }
      }
    }
    if (!hit) continue;
    at.set(`${p[0]},${p[1]}`, 0);
    l.points[i] = [hit[0], hit[1]];
    at.set(`${hit[0]},${hit[1]}`, 2);
  }
  /** @type {Map<string, [number, number][]>} grid cell → [line, segment] */
  const cells = new Map();
  lines.forEach((l, li) => {
    for (let s = 1; s < l.points.length; s++) {
      const [a, b] = [l.points[s - 1], l.points[s]];
      for (let cx = Math.floor((Math.min(a[0], b[0]) - T_JOIN_UNITS) / CELL); cx <= Math.floor((Math.max(a[0], b[0]) + T_JOIN_UNITS) / CELL); cx++)
        for (let cy = Math.floor((Math.min(a[1], b[1]) - T_JOIN_UNITS) / CELL); cy <= Math.floor((Math.max(a[1], b[1]) + T_JOIN_UNITS) / CELL); cy++) {
          const k = `${cx},${cy}`;
          let list = cells.get(k);
          if (!list) { list = []; cells.set(k, list); }
          list.push([li, s]);
        }
    }
  });
  /** @type {{ li: number, s: number, t: number, p: [number, number] }[]} */
  const inserts = [];
  lines.forEach((l, li) => {
    for (const end of [l.points[0], l.points[l.points.length - 1]]) {
      if ((at.get(`${end[0]},${end[1]}`) ?? 0) > 1) continue; // already shared
      for (const [ti, s] of cells.get(`${Math.floor(end[0] / CELL)},${Math.floor(end[1] / CELL)}`) ?? []) {
        if (ti === li) continue;
        const t = lines[ti];
        if (space(t) && space(t) !== space(l)) continue; // never onto a bridge or tunnel you are not on
        const [a, b] = [t.points[s - 1], t.points[s]];
        const dx = b[0] - a[0], dy = b[1] - a[1], len = dx * dx + dy * dy;
        if (!len) continue;
        const u = ((end[0] - a[0]) * dx + (end[1] - a[1]) * dy) / len;
        if (u <= 0 || u >= 1) continue; // at a vertex: shared already or not at all
        if (Math.hypot(a[0] + u * dx - end[0], a[1] + u * dy - end[1]) > T_JOIN_UNITS) continue;
        inserts.push({ li: ti, s, t: u, p: end });
        break;
      }
    }
  });
  // Later segments first, and within a segment the furthest first, so indices stay valid
  inserts.sort((x, y) => x.li - y.li || y.s - x.s || y.t - x.t);
  for (const { li, s, p } of inserts) lines[li].points.splice(s, 0, [p[0], p[1]]);
}

/**
 * @param {DecodedLine[]} lines
 * @param {import('./profiles.js').Profile} profile
 * @param {number} z
 * @returns {Graph}
 */
export function buildGraph(lines, profile, z) {
  const rules = PROFILES[profile];
  const net = lines.map((l) => ({ l, pen: rules.penalty(l.cls, l.subclass, l.props) })).filter((x) => x.pen != null && x.l.points.length > 1)
    .map(({ l, pen }) => ({ l: { ...l, points: l.points.slice() }, pen })); // copies: the T-junction step adds vertices
  joinTJunctions(net.map((x) => x.l));

  // Vertex keys, with union-find so a bridge's ends are both "on the bridge" and "on the ground"
  /** @type {Map<string, string>} */
  const parent = new Map();
  const find = (/** @type {string} */ k) => {
    let r = k;
    while (parent.has(r) && parent.get(r) !== r) r = /** @type {string} */ (parent.get(r));
    let c = k;
    while (c !== r) { const n = /** @type {string} */ (parent.get(c)); parent.set(c, r); c = n; }
    if (!parent.has(r)) parent.set(r, r);
    return r;
  };
  const union = (/** @type {string} */ a, /** @type {string} */ b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  const ns = (/** @type {DecodedLine} */ l) => (l.props.brunnel ? `${l.props.brunnel}:${l.props.layer ?? ''}` : '');
  /** @param {DecodedLine} l @param {number} i */
  const keyOf = (l, i) => {
    const [gx, gy] = l.points[i];
    const end = i === 0 || i === l.points.length - 1;
    const space = ns(l);
    const ground = `${gx},${gy}`;
    if (!space) return ground;
    const own = `${space}|${gx},${gy}`;
    if (end) { union(own, ground); return ground; }
    return own;
  };

  // Pass 1: how many line-vertices share each vertex
  /** @type {string[][]} */
  const keys = net.map(({ l }) => l.points.map((_, i) => keyOf(l, i)));
  /** @type {Map<string, number>} */
  const degree = new Map();
  keys.forEach((ks) => ks.forEach((k) => { const r = find(k); degree.set(r, (degree.get(r) ?? 0) + 1); }));

  // Nodes: line ends and shared vertices
  /** @type {Map<string, number>} */
  const nodeOf = new Map();
  /** @type {number[]} */ const nodeLon = [];
  /** @type {number[]} */ const nodeLat = [];
  /** @param {string} root @param {LonLat} ll */
  const node = (root, ll) => {
    let n = nodeOf.get(root);
    if (n === undefined) { n = nodeLon.length; nodeOf.set(root, n); nodeLon.push(ll[0]); nodeLat.push(ll[1]); }
    return n;
  };

  // Pass 2: split into edges
  /** @type {Edge[]} */
  const edges = [];
  /** @type {{ e: number, oneway: number }[]} */
  const meta = [];
  /** @type {Set<string>} */
  const seen = new Set();
  net.forEach(({ l, pen }, li) => {
    const ks = keys[li];
    const ll = l.points.map(([gx, gy]) => tileToLonLat(gx, gy, z, l.extent));
    let start = 0;
    for (let i = 1; i < l.points.length; i++) {
      const r = find(ks[i]);
      if (i < l.points.length - 1 && (degree.get(r) ?? 0) < 2) continue;
      const geom = ll.slice(start, i + 1);
      const from = node(find(ks[start]), geom[0]), to = node(r, geom[geom.length - 1]);
      let lengthM = 0;
      for (let k = 1; k < geom.length; k++) lengthM += haversineM(geom[k - 1], geom[k]);
      start = i;
      if (from === to && lengthM < 0.5) continue;
      // Dedupe: buffer copies of the same piece from two tiles
      const sig = `${Math.min(from, to)}|${Math.max(from, to)}|${Math.round(lengthM * 2)}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      const ow = rules.oneway ? Number(l.props.oneway ?? 0) : 0;
      edges.push({ from, to, lengthM, cost: lengthM * /** @type {number} */ (pen), geom, cls: l.cls, oneway: ow === 1 || ow === -1 ? ow : 0 });
      meta.push({ e: edges.length - 1, oneway: ow === 1 || ow === -1 ? ow : 0 });
    }
  });

  // Directed edges
  /** @type {number[]} */ const dEdge = [], dFrom = [], dTo = [], dCost = [], dBOut = [], dBIn = [];
  /** @type {boolean[]} */ const dRev = [];
  /** @type {number[][]} */
  const out = nodeLon.map(() => []);
  for (const { e, oneway } of meta) {
    const ed = edges[e];
    const bOut = startBearing(ed.geom), bIn = endBearing(ed.geom);
    const add = (/** @type {boolean} */ rev) => {
      const id = dEdge.length;
      dEdge.push(e); dRev.push(rev);
      dFrom.push(rev ? ed.to : ed.from); dTo.push(rev ? ed.from : ed.to); dCost.push(ed.cost);
      dBOut.push(rev ? (bIn + 180) % 360 : bOut); dBIn.push(rev ? (bOut + 180) % 360 : bIn);
      out[rev ? ed.to : ed.from].push(id);
    };
    if (oneway !== -1) add(false);
    if (oneway !== 1) add(true);
  }

  return {
    nodeLon, nodeLat, edges, dEdge, dRev, dFrom, dTo, dCost, dBOut, dBIn, out, profile,
    nodeAt: (gx, gy) => nodeOf.get(find(`${gx},${gy}`)) ?? -1,
  };
}

/**
 * Connected component of every edge (ignoring direction): for the debug view and tests.
 * @param {Graph} g
 * @returns {number[]} per edge
 */
export function components(g) {
  const p = g.nodeLon.map((_, i) => i);
  const f = (/** @type {number} */ x) => { while (p[x] !== x) { p[x] = p[p[x]]; x = p[x]; } return x; };
  for (const e of g.edges) p[f(e.from)] = f(e.to);
  return g.edges.map((e) => f(e.from));
}
