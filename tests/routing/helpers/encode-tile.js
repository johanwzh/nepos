// Test-only encoder of the NPT2 tile layout (nepos-tiles build/encode.py), so routing tests can make small graphs.
// Coordinates are given in degrees and stored at 1e-7.

const Q = 1e7;

/**
 * @typedef {{ cls: number, dir?: number, speed?: number, ferry?: boolean, maxheight?: number, maxwidth?: number, maxlength?: number, maxweight?: number }} AttrIn
 * @typedef {{ from: number, to: number, len: number, attr?: number, name?: number, way: number, pts?: [number, number][] }} EdgeIn
 * @param {{ nodes: [number, number, number?][], attrs: AttrIn[], names?: string[], edges: EdgeIn[], restrictions?: [number, number, number, number][] }} t
 * @returns {ArrayBuffer}
 */
export function encodeTile({ nodes, attrs, names = [''], edges, restrictions = [] }) {
  const bytes = [];
  const u8 = (v) => bytes.push(v & 0xff);
  const u16 = (v) => { u8(v); u8(v >> 8); };
  const u32 = (v) => { u16(v & 0xffff); u16(v >>> 16); };
  const i32 = (v) => u32(v >>> 0);
  const f32 = (v) => { const b = new Uint8Array(new Float32Array([v]).buffer); b.forEach(u8); };
  const pad = () => { while (bytes.length % 4) bytes.push(0); };
  const nameBytes = new TextEncoder().encode(names.join('\n'));
  const points = [];
  const varint = (v) => {
    let z = v < 0 ? -2 * v - 1 : 2 * v;
    while (z >= 0x80) { points.push((z % 0x80) | 0x80); z = Math.floor(z / 0x80); }
    points.push(z);
  };
  const qn = nodes.map(([lon, lat, border = 0]) => [Math.round(lon * Q), Math.round(lat * Q), border]);
  const offs = [], counts = [];
  for (const e of edges) {
    offs.push(points.length);
    const pts = (e.pts ?? []).map(([lon, lat]) => [Math.round(lon * Q), Math.round(lat * Q)]);
    counts.push(pts.length);
    let [px, py] = qn[e.from];
    for (const [x, y] of pts) { varint(x - px); varint(y - py); px = x; py = y; }
  }

  bytes.push(...new TextEncoder().encode('NPT2'));
  [nodes.length, edges.length, attrs.length, nameBytes.length, points.length, restrictions.length].forEach(u32);
  qn.forEach((n) => i32(n[0])); qn.forEach((n) => i32(n[1])); qn.forEach((n) => u8(n[2])); pad();
  for (const a of attrs) {
    u8(a.cls); u8(a.dir ?? 0); u8(a.speed ?? 0); u8(a.ferry ? 1 : 0);
    u16(Math.round((a.maxheight ?? 0) * 100)); u16(Math.round((a.maxwidth ?? 0) * 100));
    u16(Math.round((a.maxlength ?? 0) * 10)); u16(Math.round((a.maxweight ?? 0) * 10));
  }
  bytes.push(...nameBytes); pad();
  edges.forEach((e) => u32(e.from)); pad();
  edges.forEach((e) => u32(e.to)); pad();
  edges.forEach((e) => f32(e.len)); pad();
  edges.forEach((e) => u16(e.attr ?? 0)); pad();
  edges.forEach((e) => u32(e.name ?? 0)); pad();
  edges.forEach((e) => u32(e.way)); pad();
  offs.forEach(u32); pad();
  counts.forEach(u16); pad();
  bytes.push(...points); pad();
  for (const [f, v, t, only] of restrictions) { u32(f); u32(v); u32(t); u8(only); u8(0); u8(0); u8(0); }
  return new Uint8Array(bytes).buffer;
}
