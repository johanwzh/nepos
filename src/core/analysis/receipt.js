// Analyse (spec 2026-10-31): the receipt — the trip facts added up the way an account is, every total broken down into
// its parts and missing data in an Ukjent row that is part of the sum. Only the days inside the period count: a trip
// with none is left out everywhere, Linjer included.
import { norwegianHolidays } from '../holidays.js';
import { weekdayOf } from '../calendars.js';

/** @typedef {import('./facts.js').TripFact} TripFact */
/** @typedef {{ departures: number, hours: number, km: number, unknownKmDepartures: number }} Prod */
/** @typedef {{ from: string, to: string } | null} Period null: everything planned */
/** @typedef {'weekday' | 'saturday' | 'sunday' | 'holiday'} DayType */
/**
 * @typedef {{ dates: { first: string, last: string, count: number },
 *   scope: { rows: { mode: string, lines: number, trips: number, departures: number, stops: number }[], sum: { lines: number, trips: number, departures: number, stops: number } },
 *   network: { groups: { profile: string, routed: { stretches: number, km: number }, unknown: number }[], sum: { stretches: number, km: number } },
 *   production: { planned: Prod, done: Prod, remaining: Prod, avgKmh: number | null },
 *   fuel: { rows: { fuel: string, departures: number, hours: number, km: number, seatKm: number | null }[], sum: { departures: number, hours: number, km: number, seatKm: number },
 *           unknownKm: { departures: number, hours: number }, lowFloorShare: number | null, bookedShare: number | null },
 *   dayTypes: { type: DayType, dates: number, departures: number, hours: number, first: number | null, last: number | null }[] }} Receipt
 */

/** The fact's days inside the period. @param {TripFact} fact @param {Period} period @returns {string[]} */
export function inPeriod(fact, period) {
  return period ? fact.days.filter((d) => d >= period.from && d <= period.to) : fact.days;
}

/** @type {Map<number, Map<string, string>>} */
const holidayYears = new Map();
/** A date's day type: a holiday wins over Saturday and Sunday. @param {string} d @returns {DayType} */
export function dayTypeOf(d) {
  const y = +d.slice(0, 4);
  if (!holidayYears.has(y)) holidayYears.set(y, norwegianHolidays(y));
  if (holidayYears.get(y)?.has(d)) return 'holiday';
  const w = weekdayOf(d);
  return w === 6 ? 'saturday' : w === 7 ? 'sunday' : 'weekday';
}

/** Rows by departures, most first, the Ukjent row ('') last. @template {{ departures: number }} T @param {[string, T][]} rows @returns {T[]} */
const ordered = (rows) => [...rows].sort(([ka, a], [kb, b]) => (ka === '' ? 1 : 0) - (kb === '' ? 1 : 0) || b.departures - a.departures).map(([, v]) => v);
const prod = () => /** @type {Prod} */ ({ departures: 0, hours: 0, km: 0, unknownKmDepartures: 0 });

/**
 * @param {TripFact[]} facts
 * @param {{ period: Period, today: string }} opts today: YYYYMMDD; "done" is the days before it
 * @returns {Receipt}
 */
export function receipt(facts, { period, today }) {
  const live = facts.map((f) => ({ f, days: inPeriod(f, period) })).filter((x) => x.days.length);
  /** @type {Set<string>} */ const allDates = new Set();
  /** @type {Map<string, { mode: string, lines: Set<string>, trips: number, departures: number, stops: Set<string> }>} */ const modes = new Map();
  /** @type {Map<string, { profile: string, keys: Map<string, number | null> }>} */ const groups = new Map();
  const planned = prod(), done = prod(), remaining = prod();
  let knownKmHours = 0;
  /** @type {Map<string, { fuel: string, departures: number, hours: number, km: number, seatKm: number | null }>} */ const fuels = new Map();
  const unknownKm = { departures: 0, hours: 0 };
  let lowFloorKm = 0, booked = 0;
  /** @type {Record<DayType, { dates: Set<string>, departures: number, hours: number, first: number | null, last: number | null }>} */
  const types = { weekday: { dates: new Set(), departures: 0, hours: 0, first: null, last: null }, saturday: { dates: new Set(), departures: 0, hours: 0, first: null, last: null },
    sunday: { dates: new Set(), departures: 0, hours: 0, first: null, last: null }, holiday: { dates: new Set(), departures: 0, hours: 0, first: null, last: null } };
  /** @type {Set<string>} */ const allStops = new Set();

  /** @type {Map<string, DayType>} each date's day type once, however many trips run on it (final review I3) */
  const typeOf = new Map();
  const dayType = (/** @type {string} */ d) => { let x = typeOf.get(d); if (!x) { x = dayTypeOf(d); typeOf.set(d, x); } return x; };
  for (const { f, days } of live) {
    const n = days.length, h = f.runMin / 60;
    for (const d of days) allDates.add(d);
    const m = modes.get(f.mode) ?? { mode: f.mode, lines: new Set(), trips: 0, departures: 0, stops: new Set() };
    m.lines.add(f.line); m.trips++; m.departures += n;
    for (const s of f.stopPlaces) { m.stops.add(s); allStops.add(s); }
    modes.set(f.mode, m);
    const g = groups.get(f.profile ?? '') ?? { profile: f.profile ?? '', keys: new Map() };
    for (const l of f.legs) if (l.km != null || !g.keys.has(l.key)) g.keys.set(l.key, l.km ?? g.keys.get(l.key) ?? null);
    groups.set(f.profile ?? '', g);
    let before = 0;
    for (const d of days) if (d < today) before++;
    for (const [p, k] of /** @type {[Prod, number][]} */ ([[planned, n], [done, before], [remaining, n - before]])) {
      p.departures += k; p.hours += k * h;
      if (f.km != null) p.km += k * f.km; else p.unknownKmDepartures += k;
    }
    if (f.km != null) knownKmHours += n * h;
    const fu = fuels.get(f.fuel) ?? { fuel: f.fuel, departures: 0, hours: 0, km: 0, seatKm: null };
    fu.departures += n; fu.hours += n * h;
    if (f.km != null) {
      fu.km += n * f.km;
      if (f.fuel && f.seats != null) fu.seatKm = (fu.seatKm ?? 0) + n * f.km * f.seats;
      if (f.lowFloor) lowFloorKm += n * f.km;
    } else { unknownKm.departures += n; unknownKm.hours += n * h; }
    fuels.set(f.fuel, fu);
    if (f.booked) booked++;
    for (const d of days) {
      const t = types[dayType(d)];
      t.dates.add(d); t.departures++; t.hours += h;
      t.first = t.first == null ? f.start : Math.min(t.first, f.start);
      t.last = t.last == null ? f.end : Math.max(t.last, f.end);
    }
  }

  const dates = [...allDates].sort();
  const groupRows = [...groups.values()].map((g) => {
    const known = [...g.keys.values()].filter((km) => km != null);
    return { profile: g.profile, routed: { stretches: known.length, km: known.reduce((a, b) => a + /** @type {number} */ (b), 0) }, unknown: g.keys.size - known.length };
  }).sort((a, b) => (a.profile === '' ? 1 : 0) - (b.profile === '' ? 1 : 0) || (b.routed.stretches + b.unknown) - (a.routed.stretches + a.unknown));
  const fuelRows = ordered([...fuels.entries()]);
  return {
    dates: { first: dates[0] ?? '', last: dates[dates.length - 1] ?? '', count: dates.length },
    scope: {
      rows: ordered([...modes.entries()].map(([k, m]) => [k, { mode: m.mode, lines: m.lines.size, trips: m.trips, departures: m.departures, stops: m.stops.size }])),
      sum: { lines: new Set(live.map((x) => x.f.line)).size, trips: live.length, departures: planned.departures, stops: allStops.size },
    },
    network: { groups: groupRows, sum: { stretches: groupRows.reduce((n, g) => n + g.routed.stretches, 0), km: groupRows.reduce((n, g) => n + g.routed.km, 0) } },
    production: { planned, done, remaining, avgKmh: knownKmHours ? planned.km / knownKmHours : null },
    fuel: {
      rows: fuelRows,
      sum: { departures: planned.departures, hours: planned.hours, km: planned.km, seatKm: fuelRows.reduce((n, r) => n + (r.seatKm ?? 0), 0) },
      unknownKm, lowFloorShare: planned.km ? lowFloorKm / planned.km : null, bookedShare: live.length ? booked / live.length : null,
    },
    dayTypes: /** @type {DayType[]} */ (['weekday', 'saturday', 'sunday', 'holiday']).map((type) => {
      const t = types[type], n = t.dates.size;
      return { type, dates: n, departures: n ? t.departures / n : 0, hours: n ? t.hours / n : 0, first: t.first, last: t.last };
    }),
  };
}
