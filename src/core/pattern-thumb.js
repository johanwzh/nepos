// A journey pattern drawn small (routing editor, 2026-10-31): its legs as an SVG path fitted to a box, north up, with
// longitude scaled by the latitude so the shape looks as on the map. Pure.

/** @typedef {[number, number]} LonLat */

const MARGIN = 4;

/**
 * @param {LonLat[][]} legs each leg's line (routed, or straight between its stops) @param {number} w @param {number} h
 * @returns {string} the path's d, '' with nothing to draw
 */
export function patternThumb(legs, w, h) {
  const all = legs.flat();
  if (!all.length) return '';
  const k = Math.cos(((all.reduce((s, p) => s + p[1], 0) / all.length) * Math.PI) / 180);
  const xs = all.map((p) => p[0] * k), ys = all.map((p) => p[1]);
  const x0 = Math.min(...xs), y1 = Math.max(...ys);
  const spanX = Math.max(...xs) - x0, spanY = y1 - Math.min(...ys);
  const s = Math.min((w - 2 * MARGIN) / (spanX || 1e-9), (h - 2 * MARGIN) / (spanY || 1e-9));
  // centred in the box
  const ox = (w - spanX * s) / 2, oy = (h - spanY * s) / 2;
  const f = (/** @type {number} */ v) => String(Math.round(v * 10) / 10);
  return legs.filter((l) => l.length).map((l) => l.map(([lon, lat], i) => `${i ? 'L' : 'M'} ${f(ox + (lon * k - x0) * s)} ${f(oy + (y1 - lat) * s)}`).join(' ')).join(' ');
}
