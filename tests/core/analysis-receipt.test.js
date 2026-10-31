// Analyse (spec 2026-10-31): the receipt adds the trip facts up — scope per mode, the routed network per routing
// profile, production split at today, per fuel, per day type. Missing data is an Ukjent row, never a warning.
import { describe, it, expect } from 'vitest';
import { receipt, inPeriod } from '../../src/core/analysis/receipt.js';

/** Consecutive dates from `from`, `n` of them (YYYYMMDD). */
function daysFrom(/** @type {string} */ from, /** @type {number} */ n) {
  const d = new Date(Date.UTC(+from.slice(0, 4), +from.slice(4, 6) - 1, +from.slice(6, 8)));
  return Array.from({ length: n }, (_, i) => { const x = new Date(d); x.setUTCDate(d.getUTCDate() + i); return x.toISOString().slice(0, 10).replace(/-/g, ''); });
}
/** @param {Partial<import('../../src/core/analysis/facts.js').TripFact>} o @returns {import('../../src/core/analysis/facts.js').TripFact} */
const fact = (o = {}) => ({ line: 'L1', mode: 'bus', profile: 'bus', days: daysFrom('20260105', 1), start: 420, end: 450, runMin: 30,
  calls: [], legs: [{ key: 'A|B|bus', km: 12 }], km: 12, stopPlaces: ['SP:A', 'SP:B'], fuel: 'diesel', seats: 50, lowFloor: false, booked: false, ...o });
const ALL = { period: null, today: '20250101' };

describe('the receipt', () => {
  it('departures, hours and km add up; a trip with unknown km counts its departures and hours but no km', () => {
    const r = receipt([fact({ days: daysFrom('20260105', 10) }), fact({ days: daysFrom('20260105', 5), runMin: 60, end: 480, km: null, legs: [{ key: 'A|B|bus', km: null }] })], ALL);
    expect(r.production.planned).toEqual({ departures: 15, hours: 10, km: 120, unknownKmDepartures: 5 });
    expect(r.production.avgKmh).toBe(24);
    expect(r.scope.sum).toEqual({ lines: 1, trips: 2, departures: 15, stops: 2 });
  });

  it('a fact with no day in the period disappears from every block, Linjer included', () => {
    const r = receipt([fact({ days: daysFrom('20260105', 10) })], { period: { from: '20260201', to: '20260228' }, today: '20250101' });
    expect(r.scope.sum).toEqual({ lines: 0, trips: 0, departures: 0, stops: 0 });
    expect(r.scope.rows).toEqual([]);
    expect(r.dates.count).toBe(0);
    expect(r.fuel.rows).toEqual([]);
    expect(r.network.groups).toEqual([]);
    expect(r.production.avgKmh).toBeNull();
  });

  it('inPeriod keeps the days inside the period; null means everything', () => {
    const f = fact({ days: daysFrom('20260130', 4) });
    expect(inPeriod(f, { from: '20260201', to: '20260228' })).toEqual(['20260201', '20260202']);
    expect(inPeriod(f, null)).toHaveLength(4);
  });

  it('done and remaining split at today; today counts as remaining', () => {
    const r = receipt([fact({ days: daysFrom('20260110', 3) })], { period: null, today: '20260111' });
    expect(r.production.done.departures).toBe(1);
    expect(r.production.remaining.departures).toBe(2);
    expect(r.dates).toEqual({ first: '20260110', last: '20260112', count: 3 });
  });

  it('the same stop pair on two lines is one stretch, while each trip still counts its km', () => {
    const r = receipt([fact({ line: 'L1', km: 3, legs: [{ key: 'A|B|bus', km: 3 }], days: daysFrom('20260105', 2) }), fact({ line: 'L2', km: 3, legs: [{ key: 'A|B|bus', km: 3 }], days: daysFrom('20260105', 3) })], ALL);
    expect(r.network.sum).toEqual({ stretches: 1, km: 3 });
    expect(r.production.planned.km).toBe(15);
  });

  it('the network: a stretch is routed when any trip knows it; unrouted stretches are ukjent; no profile is its own group', () => {
    const r = receipt([fact({ legs: [{ key: 'A|B|bus', km: 3 }, { key: 'B|C|bus', km: null }], km: null }),
      fact({ mode: 'water', profile: 'ferry', legs: [{ key: 'X|Y|ferry', km: null }], km: null }), fact({ mode: '', profile: null, legs: [{ key: 'P|Q|none', km: null }], km: null })], ALL);
    expect(r.network.groups).toEqual([
      { profile: 'bus', routed: { stretches: 1, km: 3 }, unknown: 1 },
      { profile: 'ferry', routed: { stretches: 0, km: 0 }, unknown: 1 },
      { profile: '', routed: { stretches: 0, km: 0 }, unknown: 1 },
    ]);
    expect(r.network.sum).toEqual({ stretches: 1, km: 3 });
  });

  it('a stop place used by two modes counts under both and once in the sum', () => {
    const r = receipt([fact({ mode: 'bus', stopPlaces: ['SP:A', 'SP:B'] }), fact({ line: 'L2', mode: 'water', profile: 'ferry', stopPlaces: ['SP:B', 'SP:C'] })], ALL);
    expect(r.scope.rows.map((x) => [x.mode, x.stops])).toEqual([['bus', 2], ['water', 2]]);
    expect(r.scope.sum.stops).toBe(3);
  });

  it('scope rows by departures, the Ukjent mode last', () => {
    const r = receipt([fact({ mode: '', profile: null, days: daysFrom('20260105', 9) }), fact({ mode: 'bus', days: daysFrom('20260105', 2) }), fact({ line: 'L2', mode: 'water', days: daysFrom('20260105', 5) })], ALL);
    expect(r.scope.rows.map((x) => x.mode)).toEqual(['water', 'bus', '']);
  });

  it('every trip in exactly one fuel row; Ukjent last; seat-km unknown without seats', () => {
    const r = receipt([
      fact({ fuel: 'battery', seats: 40, days: daysFrom('20260105', 4) }),
      fact({ fuel: 'diesel', seats: null, days: daysFrom('20260105', 6) }),
      fact({ fuel: '', seats: null, days: daysFrom('20260105', 8) }),
      fact({ fuel: 'battery', seats: 40, km: null, legs: [{ key: 'A|B|bus', km: null }], days: daysFrom('20260105', 1), lowFloor: true, booked: true }),
    ], ALL);
    expect(r.fuel.rows.map((x) => x.fuel)).toEqual(['diesel', 'battery', '']);
    expect(r.fuel.rows.reduce((n, x) => n + x.departures, 0)).toBe(r.production.planned.departures);
    const battery = /** @type {any} */ (r.fuel.rows.find((x) => x.fuel === 'battery'));
    expect(battery).toEqual({ fuel: 'battery', departures: 5, hours: 2.5, km: 48, seatKm: 1920 });
    expect(r.fuel.rows.find((x) => x.fuel === 'diesel')?.seatKm).toBeNull();
    expect(r.fuel.rows.find((x) => x.fuel === '')?.seatKm).toBeNull();
    expect(r.fuel.sum).toEqual({ departures: 19, hours: 9.5, km: 216, seatKm: 1920 });
    expect(r.fuel.unknownKm).toEqual({ departures: 1, hours: 0.5 });
    expect(r.fuel.lowFloorShare).toBe(0);
    expect(r.fuel.bookedShare).toBe(0.25);
  });

  it('day types: 1 January is a holiday, not a Thursday; per-date figures; a time past midnight stays above 1440', () => {
    // 1–4 January 2026: Thu (holiday), Fri, Sat, Sun
    const r = receipt([fact({ days: daysFrom('20260101', 4), start: 300, end: 1460, runMin: 1160 }), fact({ days: ['20260102'], start: 360, end: 390, runMin: 30 })], ALL);
    const by = Object.fromEntries(r.dayTypes.map((d) => [d.type, d]));
    expect(r.dayTypes.map((d) => d.type)).toEqual(['weekday', 'saturday', 'sunday', 'holiday']);
    expect(by.holiday).toMatchObject({ dates: 1, departures: 1, first: 300, last: 1460 });
    expect(by.weekday).toMatchObject({ dates: 1, departures: 2, first: 300, last: 1460 });
    expect(by.weekday.hours).toBeCloseTo((1160 + 30) / 60);
    expect(by.saturday).toMatchObject({ dates: 1, departures: 1 });
    const empty = receipt([fact({ days: ['20260105'] })], ALL).dayTypes.find((d) => d.type === 'sunday');
    expect(empty).toEqual({ type: 'sunday', dates: 0, departures: 0, hours: 0, first: null, last: null });
  });
});
