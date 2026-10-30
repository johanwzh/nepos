// NPT2 road graph tiles (nepos-tiles, 2026-10-30): typed-array views on one tile. Layout: little-endian, every section
// on a 4-byte boundary; header 'NPT2' + u32 nodes, edges, attrs, names bytes, points bytes, restrictions.

/**
 * @typedef {{ cls: number, dir: number, speed: number, ferry: boolean, maxheight: number, maxwidth: number, maxlength: number, maxweight: number }} Attr
 * @typedef {{ lon: Int32Array, lat: Int32Array, border: Uint8Array, attrs: Attr[], names: string[],
 *   from: Uint32Array, to: Uint32Array, len: Float32Array, attr: Uint16Array, name: Uint32Array, way: Uint32Array,
 *   ptOff: Uint32Array, ptCount: Uint16Array, points: Uint8Array, restrictions: Uint32Array }} Tile
 */

const MAGIC = 0x3254504e;          // 'NPT2' read as a little-endian u32

/** @param {ArrayBuffer} buf @returns {Tile} */
export function decodeTile(buf) {
  const dv = new DataView(buf);
  if (buf.byteLength < 28 || dv.getUint32(0, true) !== MAGIC) throw new Error('not an NPT2 tile');
  const [nodes, edges, nAttrs, namesBytes, pointsBytes, nRestr] = [4, 8, 12, 16, 20, 24].map((o) => dv.getUint32(o, true));
  let pos = 28;
  const align = () => { pos += (4 - (pos % 4)) % 4; };
  /** @template T @param {new (b: ArrayBuffer, o: number, n: number) => T} Type @param {number} n @param {number} size @returns {T} */
  const take = (Type, n, size) => { const a = new Type(buf, pos, n); pos += n * size; align(); return a; };

  const lon = take(Int32Array, nodes, 4), lat = take(Int32Array, nodes, 4), border = take(Uint8Array, nodes, 1);
  /** @type {Attr[]} */
  const attrs = [];
  for (let i = 0; i < nAttrs; i++, pos += 12) {
    attrs.push({
      cls: dv.getUint8(pos), dir: dv.getUint8(pos + 1), speed: dv.getUint8(pos + 2), ferry: (dv.getUint8(pos + 3) & 1) === 1,
      maxheight: dv.getUint16(pos + 4, true) / 100, maxwidth: dv.getUint16(pos + 6, true) / 100,
      maxlength: dv.getUint16(pos + 8, true) / 10, maxweight: dv.getUint16(pos + 10, true) / 10,
    });
  }
  const names = new TextDecoder().decode(new Uint8Array(buf, pos, namesBytes)).split('\n');
  pos += namesBytes; align();
  const from = take(Uint32Array, edges, 4), to = take(Uint32Array, edges, 4), len = take(Float32Array, edges, 4);
  const attr = take(Uint16Array, edges, 2), name = take(Uint32Array, edges, 4), way = take(Uint32Array, edges, 4);
  const ptOff = take(Uint32Array, edges, 4), ptCount = take(Uint16Array, edges, 2);
  const points = take(Uint8Array, pointsBytes, 1);
  const restrictions = new Uint32Array(nRestr * 4);
  for (let i = 0; i < nRestr; i++, pos += 16) {
    restrictions[i * 4] = dv.getUint32(pos, true);
    restrictions[i * 4 + 1] = dv.getUint32(pos + 4, true);
    restrictions[i * 4 + 2] = dv.getUint32(pos + 8, true);
    restrictions[i * 4 + 3] = dv.getUint8(pos + 12);
  }
  return { lon, lat, border, attrs, names, from, to, len, attr, name, way, ptOff, ptCount, points, restrictions };
}

/** [lon0, lat0, …] at 1e-7: the from node, the interior points, the to node. @param {Tile} t @param {number} e */
export function edgePoints(t, e) {
  const n = t.ptCount[e], out = new Int32Array((n + 2) * 2), p = t.points;
  let x = t.lon[t.from[e]], y = t.lat[t.from[e]], pos = t.ptOff[e];
  out[0] = x; out[1] = y;
  const varint = () => {
    let shift = 1, z = 0, b;
    do { b = p[pos++]; z += (b & 0x7f) * shift; shift *= 128; } while (b >= 0x80);
    return z % 2 ? -(z + 1) / 2 : z / 2;
  };
  for (let i = 1; i <= n; i++) {
    x += varint(); y += varint();
    out[i * 2] = x; out[i * 2 + 1] = y;
  }
  out[(n + 1) * 2] = t.lon[t.to[e]]; out[(n + 1) * 2 + 1] = t.lat[t.to[e]];
  return out;
}

/** Tiles are served as gzip bytes without Content-Encoding; unzip them here. @param {ArrayBuffer} buf @returns {Promise<ArrayBuffer>} */
export async function gunzip(buf) {
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}
