// One routing graph from several NPT2 tiles: border nodes with the same coordinate become one node, so a road crosses
// from tile to tile. Directed edge de = e * 2 + d: d = 0 drives from -> to, d = 1 to -> from.
import { edgePoints } from './tile-format.js';
import { secondsPerMetre } from './cost.js';

/** @typedef {import('./tile-format.js').Tile} Tile */
/** @typedef {{ key: string, tile: Tile }} TileEntry */
/**
 * @typedef {{ nodes: number, edges: number, lon: Int32Array, lat: Int32Array, from: Uint32Array, to: Uint32Array,
 *   len: Float32Array, spm: Float32Array, ferry: Uint8Array, dir: Uint8Array, way: Uint32Array, road: (e: number) => string,
 *   geo: Int32Array, geoStart: Uint32Array, out: { start: Uint32Array, de: Uint32Array },
 *   open: Uint8Array, restrict: Map<number, { no: Set<number>, only: number }>, cells: Map<number, number[]>, keys: Set<string>,
 *   entries: TileEntry[] }} Graph
 */

/** Snap buckets: 0.005° (~300 x 550 m) at 1e-7. */
export const CELL = 50000;
export const cellKey = (/** @type {number} */ cx, /** @type {number} */ cy) => cx * 100000 + cy;

/** @param {TileEntry[]} entries @returns {Graph} */
export function buildGraph(entries) {
  let nodes = 0, edges = 0, points = 0;
  for (const { tile } of entries) {
    nodes += tile.lon.length; edges += tile.from.length;
    for (let e = 0; e < tile.from.length; e++) points += tile.ptCount[e] + 2;
  }
  const lon = new Int32Array(nodes), lat = new Int32Array(nodes), open = new Uint8Array(nodes);
  const from = new Uint32Array(edges), to = new Uint32Array(edges), len = new Float32Array(edges), spm = new Float32Array(edges);
  const ferry = new Uint8Array(edges), dir = new Uint8Array(edges), way = new Uint32Array(edges);
  const tileOf = new Uint16Array(edges), nameOf = new Uint32Array(edges);
  const geo = new Int32Array(points * 2), geoStart = new Uint32Array(edges + 1);
  const restrict = new Map(), cells = new Map(), border = new Map();
  let n = 0, e = 0, g = 0;

  entries.forEach(({ tile }, ti) => {
    const local = new Uint32Array(tile.lon.length);
    for (let i = 0; i < tile.lon.length; i++) {
      if (tile.border[i]) {
        const k = `${tile.lon[i]},${tile.lat[i]}`, known = border.get(k);
        if (known !== undefined) { local[i] = known; open[known] = 0; continue; }
        border.set(k, n);
        open[n] = 1;                                 // on the edge of the loaded tiles until a neighbour joins
      }
      lon[n] = tile.lon[i]; lat[n] = tile.lat[i]; local[i] = n++;
    }
    const e0 = e;
    for (let i = 0; i < tile.from.length; i++, e++) {
      const a = tile.attrs[tile.attr[i]];
      from[e] = local[tile.from[i]]; to[e] = local[tile.to[i]]; len[e] = tile.len[i];
      spm[e] = secondsPerMetre(a); ferry[e] = a.ferry ? 1 : 0; dir[e] = a.dir; way[e] = tile.way[i];
      tileOf[e] = ti; nameOf[e] = tile.name[i];
      const pts = edgePoints(tile, i);
      geoStart[e] = g; geo.set(pts, g * 2); g += pts.length / 2;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let j = 0; j < pts.length; j += 2) {
        x0 = Math.min(x0, pts[j]); x1 = Math.max(x1, pts[j]); y0 = Math.min(y0, pts[j + 1]); y1 = Math.max(y1, pts[j + 1]);
      }
      for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++)
        for (let cy = Math.floor(y0 / CELL); cy <= Math.floor(y1 / CELL); cy++) {
          const k = cellKey(cx, cy), list = cells.get(k);
          list ? list.push(e) : cells.set(k, [e]);
        }
    }
    const r = tile.restrictions;
    for (let i = 0; i < r.length; i += 4) {
      const fe = e0 + r[i], via = local[r[i + 1]], te = e0 + r[i + 2];
      const de = fe * 2 + (to[fe] === via ? 0 : 1);
      let entry = restrict.get(de);
      if (!entry) restrict.set(de, entry = { no: new Set(), only: -1 });
      if (r[i + 3]) entry.only = te; else entry.no.add(te);
    }
  });
  geoStart[e] = g;

  // Directed edges leaving each node, honouring oneway (dir 1 forward only, 2 backward only).
  const count = new Uint32Array(n + 1);
  for (let i = 0; i < e; i++) {
    if (dir[i] !== 2) count[from[i]]++;
    if (dir[i] !== 1) count[to[i]]++;
  }
  const start = new Uint32Array(n + 1);
  for (let v = 0; v < n; v++) start[v + 1] = start[v] + count[v];
  const fill = start.slice(0, n), de = new Uint32Array(start[n]);
  for (let i = 0; i < e; i++) {
    if (dir[i] !== 2) de[fill[from[i]]++] = i * 2;
    if (dir[i] !== 1) de[fill[to[i]]++] = i * 2 + 1;
  }

  return {
    nodes: n, edges: e, lon: lon.subarray(0, n), lat: lat.subarray(0, n), open: open.subarray(0, n), from, to, len, spm, ferry, dir, way,
    road: (i) => entries[tileOf[i]].tile.names[nameOf[i]] ?? '',
    geo, geoStart, out: { start, de }, restrict, cells, keys: new Set(entries.map((t) => t.key)), entries,
  };
}

/** A new graph with more tiles (tiles already in G are skipped). @param {Graph} G @param {TileEntry[]} more */
export function addTiles(G, more) {
  const fresh = more.filter((t) => !G.keys.has(t.key));
  return fresh.length ? buildGraph([...G.entries, ...fresh]) : G;
}
