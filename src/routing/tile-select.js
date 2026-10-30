// Which tiles a chain of points needs: those under the straight line between consecutive points, plus a ring around
// them for roads that bend away. Long lines load a corridor, not a rectangle (design 2026-10-30 §5).

const STEP_DEG = 0.01;

/**
 * @param {{ tileLon: number, tileLat: number, tiles: Record<string, any> }} manifest
 * @param {{ lon: number, lat: number }[]} points
 * @param {number} [ring]
 * @returns {string[]} keys present in the manifest, sorted
 */
export function tilesForChain(manifest, points, ring = 1) {
  const { tileLon, tileLat } = manifest, cells = new Set();
  const add = (lon, lat) => cells.add(`${Math.floor(lon / tileLon)}_${Math.floor(lat / tileLat)}`);
  points.forEach((p, i) => {
    add(p.lon, p.lat);
    const q = points[i + 1];
    if (!q) return;
    const n = Math.ceil(Math.max(Math.abs(q.lon - p.lon), Math.abs(q.lat - p.lat)) / Math.min(STEP_DEG, tileLon / 2, tileLat / 2));
    for (let k = 1; k <= n; k++) add(p.lon + ((q.lon - p.lon) * k) / n, p.lat + ((q.lat - p.lat) * k) / n);
  });
  const out = new Set();
  for (const c of cells) {
    const [ix, iy] = c.split('_').map(Number);
    for (let dx = -ring; dx <= ring; dx++)
      for (let dy = -ring; dy <= ring; dy++) {
        const k = `${ix + dx}_${iy + dy}`;
        if (k in manifest.tiles) out.add(k);
      }
  }
  return [...out].sort();
}
