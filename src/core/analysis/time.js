// Analyse (spec 2026-10-31): the plan over time — trips in motion per 15 minutes on one date (the fewest vehicles the
// plan needs, without blocks), and departures and km per date across the period.
import { inPeriod } from './receipt.js';
import { addDays } from '../calendars.js';

/** @typedef {import('./facts.js').TripFact} TripFact */
const SLOT = 15;

/**
 * Trips in motion on a date, per 15 minutes from its midnight: its own trips, and the evening before's still running
 * after midnight. The slots run as far as the last counted trip (past 24:00 for late trips).
 * @param {TripFact[]} facts @param {string} date YYYYMMDD
 * @returns {{ slots: number[], peak: { count: number, slot: number } }}
 */
export function inMotion(facts, date) {
  const before = addDays(date, -1);
  /** @type {[number, number][]} */
  const spans = [];
  for (const f of facts) {
    if (f.days.includes(date)) spans.push([f.start, f.end]);
    if (f.end > 1440 && f.days.includes(before)) spans.push([f.start - 1440, f.end - 1440]);
  }
  const live = spans.filter(([, e]) => e > 0).map(([s, e]) => /** @type {[number, number]} */ ([Math.max(0, s), e]));
  if (!live.length) return { slots: [], peak: { count: 0, slot: 0 } };
  const n = Math.max(...live.map(([s, e]) => Math.floor(Math.max(s, e - 1) / SLOT) + 1));
  const slots = new Array(n).fill(0);
  for (const [s, e] of live) for (let i = Math.floor(s / SLOT); i <= Math.floor(Math.max(s, e - 1) / SLOT); i++) slots[i]++;
  let peak = { count: 0, slot: 0 };
  slots.forEach((c, i) => { if (c > peak.count) peak = { count: c, slot: i }; });
  return { slots, peak };
}

/**
 * Departures and known km per date, every date from the first to the last (the period's, or the trips'), 0 where
 * nothing runs. @param {TripFact[]} facts @param {import('./receipt.js').Period} period
 * @returns {{ date: string, departures: number, km: number }[]}
 */
export function perDate(facts, period) {
  /** @type {Map<string, { departures: number, km: number }>} */
  const by = new Map();
  for (const f of facts) for (const d of inPeriod(f, period)) {
    const x = by.get(d) ?? { departures: 0, km: 0 };
    x.departures++; x.km += f.km ?? 0;
    by.set(d, x);
  }
  const known = [...by.keys()].sort();
  const first = period?.from ?? known[0], last = period?.to ?? known[known.length - 1];
  if (!first || !last) return [];
  const out = [];
  for (let d = first; d <= last; d = addDays(d, 1)) out.push({ date: d, ...(by.get(d) ?? { departures: 0, km: 0 }) });
  return out;
}

/** The date with the most departures (the earliest on a tie), or null. @param {TripFact[]} facts @param {import('./receipt.js').Period} period */
export function busiestDate(facts, period) {
  let best = /** @type {{ date: string, departures: number } | null} */ (null);
  for (const d of perDate(facts, period)) if (d.departures && (!best || d.departures > best.departures)) best = d;
  return best?.date ?? null;
}
