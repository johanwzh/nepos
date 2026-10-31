// Analyse's Nettverkskart (spec 2026-10-31, part 2): where each trip is at a moment of a date. Along a leg the trip is
// at the share of the leg's time gone, measured by distance along the routed line (or the straight line where the leg
// is not routed): links keep only a total drive time, so the pace is even along the leg (planning ruling). While it
// waits at a stop it stands there. The evening before's trips still running after midnight are on the next date too.
import { haversineM } from '../../routing/geometry.js';
import { addDays } from '../calendars.js';

/** @typedef {[number, number]} LonLat */
/** @typedef {import('./facts.js').TripFact} TripFact */

/** The point at a share of a line's length. @param {LonLat[]} line @param {number} share 0–1 @returns {LonLat} */
function along(line, share) {
  const parts = line.slice(1).map((p, i) => haversineM(line[i], p));
  let left = share * parts.reduce((a, b) => a + b, 0);
  for (let i = 0; i < parts.length; i++) {
    if (left <= parts[i] || i === parts.length - 1) {
      const f = parts[i] ? Math.min(1, left / parts[i]) : 0;
      return [line[i][0] + (line[i + 1][0] - line[i][0]) * f, line[i][1] + (line[i + 1][1] - line[i][1]) * f];
    }
    left -= parts[i];
  }
  return line[0];
}

/**
 * @param {TripFact[]} facts @param {string} date YYYYMMDD @param {number} minute after the date's midnight
 * @param {{ legLine: (key: string) => LonLat[] | null, stopPos: (stopId: string) => LonLat | null }} geo
 * @returns {{ line: string, lon: number, lat: number, waiting: boolean }[]}
 */
export function tripsAt(facts, date, minute, { legLine, stopPos }) {
  const before = addDays(date, -1);
  const out = [];
  for (const f of facts) {
    // Today's trip, and the evening before's still running after midnight: a daily late trip can be both (final review I1)
    const ats = [f.days.includes(date) ? minute : null, f.end > 1440 && f.days.includes(before) ? minute + 1440 : null];
    for (const at of ats) {
      if (at == null || at < f.start || at > f.end) continue;
      const p = place(f, at, legLine, stopPos);
      if (p) out.push({ line: f.line, lon: p.pos[0], lat: p.pos[1], waiting: p.waiting });
    }
  }
  return out;
}

/** @param {TripFact} f @param {number} at @param {(key: string) => LonLat[] | null} legLine @param {(stopId: string) => LonLat | null} stopPos */
function place(f, at, legLine, stopPos) {
  for (let i = 0; i < f.calls.length; i++) {
    const c = f.calls[i];
    if (at >= c.arr && at <= c.dep) { const pos = stopPos(c.stopId); return pos ? { pos, waiting: i > 0 && i < f.calls.length - 1 } : null; }
    const next = f.calls[i + 1];
    if (next && at > c.dep && at < next.arr) {
      const from = stopPos(c.stopId), to = stopPos(next.stopId);
      if (!from || !to) return null;
      const line = legLine(f.legs[i]?.key ?? '') ?? [from, to];
      return { pos: along(line, (at - c.dep) / (next.arr - c.dep)), waiting: false };
    }
  }
  return null;
}
