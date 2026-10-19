// Vector tiles for routing (Lasse's spec: tile acquisition and decoding): decode a tile's `transportation` lines,
// clip them to the tile's own square (dropping the buffer geometry every tile repeats from its neighbours), and
// turn their coordinates into global integers (gx = tileX * extent + x), which are every vertex's identity.
// Also: which tiles a link needs (a corridor along the straight line, not a box). Pure.
import { VectorTile } from '@mapbox/vector-tile';
import Pbf from 'pbf';
import { haversineM, lonLatToTile, tileToLonLat, pointSegmentM } from './geometry.js';

/**
 * @typedef {{ cls: string, subclass: string, props: Record<string, any>, extent: number, z: number,
 *             points: [number, number][] }} DecodedLine   points: global integer tile coordinates
 */

/**
 * Clip the segment p–q to the square [0, e] (Liang–Barsky). Null when it lies outside.
 * @param {number[]} p @param {number[]} q @param {number} e
 * @returns {[[number, number], [number, number]] | null}
 */
function clipSegment(p, q, e) {
  let t0 = 0, t1 = 1;
  const dx = q[0] - p[0], dy = q[1] - p[1];
  for (const [pp, qq] of [[-dx, p[0]], [dx, e - p[0]], [-dy, p[1]], [dy, e - p[1]]]) {
    if (pp === 0) { if (qq < 0) return null; continue; }
    const r = qq / pp;
    if (pp < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  // Points exactly on the edge stay on it, so lines cut at a tile edge meet their neighbour's
  const at = (/** @type {number} */ t) => /** @type {[number, number]} */ ([
    Math.min(e, Math.max(0, Math.round(p[0] + t * dx))), Math.min(e, Math.max(0, Math.round(p[1] + t * dy)))]);
  return [at(t0), at(t1)];
}

/**
 * @param {Uint8Array} bytes
 * @param {number} z @param {number} x @param {number} y
 * @param {string[]} [layers]
 * @returns {DecodedLine[]}
 */
export function decodeTile(bytes, z, x, y, layers = ['transportation']) {
  const tile = new VectorTile(new Pbf(bytes));
  /** @type {DecodedLine[]} */
  const out = [];
  for (const name of layers) {
    const layer = tile.layers[name];
    if (!layer) continue;
    const e = layer.extent;
    for (let i = 0; i < layer.length; i++) {
      const f = layer.feature(i);
      if (f.type !== 2) continue; // lines only
      const props = /** @type {Record<string, any>} */ (f.properties);
      for (const ring of f.loadGeometry()) {
        /** @type {[number, number][]} */
        let piece = [];
        const flush = () => { if (piece.length > 1) out.push({ cls: String(props.class ?? ''), subclass: String(props.subclass ?? ''), props, extent: e, z, points: piece }); piece = []; };
        for (let k = 1; k < ring.length; k++) {
          const seg = clipSegment([ring[k - 1].x, ring[k - 1].y], [ring[k].x, ring[k].y], e);
          if (!seg) { flush(); continue; }
          const [a, b] = seg.map(([px, py]) => /** @type {[number, number]} */ ([x * e + px, y * e + py]));
          const last = piece[piece.length - 1];
          if (!last || last[0] !== a[0] || last[1] !== a[1]) { flush(); piece.push(a); }
          if (b[0] !== a[0] || b[1] !== a[1]) piece.push(b);
          // The line left the square here: a new piece starts if it comes back
          if (seg[1][0] !== ring[k].x || seg[1][1] !== ring[k].y) flush();
        }
        flush();
      }
    }
  }
  return out;
}

/**
 * The tiles within `bufferM` of the straight line a–b at zoom z.
 * @param {[number, number]} a @param {[number, number]} b @param {number} z @param {number} bufferM
 * @returns {{ x: number, y: number }[]}
 */
export function corridorTiles(a, b, z, bufferM) {
  const ta = lonLatToTile(a[0], a[1], z), tb = lonLatToTile(b[0], b[1], z);
  // A tile's half diagonal, in metres, at this latitude
  const c0 = tileToLonLat(Math.floor(ta.x) * 4096, Math.floor(ta.y) * 4096, z, 4096);
  const c1 = tileToLonLat((Math.floor(ta.x) + 1) * 4096, (Math.floor(ta.y) + 1) * 4096, z, 4096);
  const half = haversineM(c0, c1) / 2;
  const spanX = Math.ceil(bufferM / (half * 1.4)) + 1;
  /** @type {{ x: number, y: number }[]} */
  const out = [];
  const [xMin, xMax] = [Math.floor(Math.min(ta.x, tb.x)) - spanX, Math.floor(Math.max(ta.x, tb.x)) + spanX];
  const [yMin, yMax] = [Math.floor(Math.min(ta.y, tb.y)) - spanX, Math.floor(Math.max(ta.y, tb.y)) + spanX];
  for (let x = xMin; x <= xMax; x++) for (let y = yMin; y <= yMax; y++) {
    const centre = tileToLonLat((x + 0.5) * 4096, (y + 0.5) * 4096, z, 4096);
    const own = (x === Math.floor(ta.x) && y === Math.floor(ta.y)) || (x === Math.floor(tb.x) && y === Math.floor(tb.y));
    if (own || pointSegmentM(centre, a, b) <= bufferM + half) out.push({ x, y });
  }
  return out;
}
