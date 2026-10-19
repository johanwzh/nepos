// Geometry for the routing engine (Lasse's spec): distances, tile maths, bearings, polyline coding and the
// Hausdorff distance. Coordinates are [lon, lat]. Pure; no DOM, no MapLibre.

/** @typedef {[number, number]} LonLat */

const R = 6371008.8;
const rad = Math.PI / 180;

/** Great-circle distance in metres. @param {LonLat} a @param {LonLat} b */
export function haversineM(a, b) {
  const dLat = (b[1] - a[1]) * rad, dLon = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Fractional tile coordinates of a point at zoom z (Web Mercator). @param {number} lon @param {number} lat @param {number} z */
export function lonLatToTile(lon, lat, z) {
  const n = 2 ** z;
  const x = ((lon + 180) / 360) * n;
  const y = ((1 - Math.log(Math.tan(lat * rad) + 1 / Math.cos(lat * rad)) / Math.PI) / 2) * n;
  return { x, y };
}

/** The point of a global tile pixel (gx = tileX * extent + px). @param {number} gx @param {number} gy @param {number} z @param {number} extent @returns {LonLat} */
export function tileToLonLat(gx, gy, z, extent) {
  const n = 2 ** z * extent;
  const lon = (gx / n) * 360 - 180;
  const lat = Math.atan(Math.sinh(Math.PI * (1 - (2 * gy) / n))) / rad;
  return [lon, lat];
}

/** Initial bearing from a to b, 0–360 (0 = north). @param {LonLat} a @param {LonLat} b */
export function bearing(a, b) {
  const y = Math.sin((b[0] - a[0]) * rad) * Math.cos(b[1] * rad);
  const x = Math.cos(a[1] * rad) * Math.sin(b[1] * rad) - Math.sin(a[1] * rad) * Math.cos(b[1] * rad) * Math.cos((b[0] - a[0]) * rad);
  return (Math.atan2(y, x) / rad + 360) % 360;
}

/** The turn between arriving on bearing `inB` and leaving on `outB`: 0 straight on, 180 a full reversal. @param {number} inB @param {number} outB */
export function turnAngle(inB, outB) {
  return Math.abs(((outB - inB + 540) % 360) - 180);
}

/** Google's polyline coding, lat first, at 10^precision. @param {LonLat[]} coords @param {number} [precision] */
export function encodePolyline(coords, precision = 6) {
  const f = 10 ** precision;
  let out = '', pLat = 0, pLon = 0;
  const put = (/** @type {number} */ v) => {
    let n = v < 0 ? ~(v << 1) : v << 1;
    while (n >= 0x20) { out += String.fromCharCode((0x20 | (n & 0x1f)) + 63); n >>= 5; }
    out += String.fromCharCode(n + 63);
  };
  for (const [lon, lat] of coords) {
    const iLat = Math.round(lat * f), iLon = Math.round(lon * f);
    put(iLat - pLat); put(iLon - pLon);
    pLat = iLat; pLon = iLon;
  }
  return out;
}

/** @param {string} s @param {number} [precision] @returns {LonLat[]} */
export function decodePolyline(s, precision = 6) {
  const f = 10 ** precision;
  /** @type {LonLat[]} */
  const out = [];
  let i = 0, lat = 0, lon = 0;
  const get = () => {
    let shift = 0, result = 0, b;
    do { b = s.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (i < s.length) { lat += get(); lon += get(); out.push([lon / f, lat / f]); }
  return out;
}

/** Distance from p to the segment a–b, in metres (local flat approximation). @param {LonLat} p @param {LonLat} a @param {LonLat} b */
export function pointSegmentM(p, a, b) {
  const kx = Math.cos(p[1] * rad) * R * rad, ky = R * rad;
  const ax = (a[0] - p[0]) * kx, ay = (a[1] - p[1]) * ky, bx = (b[0] - p[0]) * kx, by = (b[1] - p[1]) * ky;
  const dx = bx - ax, dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len)) : 0;
  return Math.hypot(ax + t * dx, ay + t * dy);
}

/** The point on a–b nearest p, and how far along (0–1). @param {LonLat} p @param {LonLat} a @param {LonLat} b */
export function projectOnSegment(p, a, b) {
  const kx = Math.cos(p[1] * rad);
  const dx = (b[0] - a[0]) * kx, dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, (((p[0] - a[0]) * kx) * dx + (p[1] - a[1]) * dy) / len)) : 0;
  return { t, point: /** @type {LonLat} */ ([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]) };
}

/** The symmetric Hausdorff distance between two lines, in metres. @param {LonLat[]} a @param {LonLat[]} b */
export function hausdorffM(a, b) {
  const one = (/** @type {LonLat[]} */ p, /** @type {LonLat[]} */ q) => {
    let worst = 0;
    for (const pt of p) {
      let best = Infinity;
      for (let i = 1; i < q.length; i++) best = Math.min(best, pointSegmentM(pt, q[i - 1], q[i]));
      if (q.length === 1) best = haversineM(pt, q[0]);
      worst = Math.max(worst, best);
    }
    return worst;
  };
  return Math.max(one(a, b), one(b, a));
}

/** Length of a line in metres. @param {LonLat[]} line */
export function lengthM(line) {
  let m = 0;
  for (let i = 1; i < line.length; i++) m += haversineM(line[i - 1], line[i]);
  return m;
}
