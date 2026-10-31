// Analyse (spec 2026-10-31): vehicles on the road at once (trips in motion per 15 minutes) and production per date.
import { describe, it, expect } from 'vitest';
import { inMotion, perDate, busiestDate } from '../../src/core/analysis/time.js';

/** @param {Partial<import('../../src/core/analysis/facts.js').TripFact>} o @returns {import('../../src/core/analysis/facts.js').TripFact} */
const fact = (o = {}) => ({ line: 'L1', mode: 'bus', profile: 'bus', days: ['20260105'], start: 430, end: 460, runMin: 30,
  calls: [], legs: [], km: 10, stopPlaces: [], fuel: '', seats: null, lowFloor: false, booked: false, ...o });

describe('trips in motion', () => {
  it('a trip running 07:10–07:40 is in motion in the 07:00, 07:15 and 07:30 slots; the peak names its slot', () => {
    const r = inMotion([fact()], '20260105');
    expect(r.slots.slice(28, 31)).toEqual([1, 1, 1]);
    expect(r.slots[27]).toBe(0);
    expect(r.slots).toHaveLength(31);
    expect(r.peak).toEqual({ count: 1, slot: 28 });
  });

  it('the previous evening\'s trip still running after midnight counts on the next date, and a late trip extends the day past 24:00', () => {
    const evening = fact({ days: ['20260104'], start: 1420, end: 1470, runMin: 50 }); // 23:40 → 00:30
    const r = inMotion([evening], '20260105');
    expect(r.slots.slice(0, 2)).toEqual([1, 1]);
    expect(r.slots).toHaveLength(2);
    const late = inMotion([evening], '20260104');
    expect(late.slots).toHaveLength(98); // up to the 00:15–00:30 slot of the next day
    expect(late.slots[94]).toBe(1);
    expect(late.slots[97]).toBe(1);
  });

  it('nothing on the date: no slots and no peak', () => {
    expect(inMotion([fact()], '20260106')).toEqual({ slots: [], peak: { count: 0, slot: 0 } });
  });
});

describe('production per date', () => {
  it('perDate has a row for every date in the period, zeros where nothing runs; busiestDate picks the earliest on a tie', () => {
    const facts = [fact({ days: ['20260105', '20260107'] }), fact({ days: ['20260107'], km: null }), fact({ days: ['20260105'] })];
    expect(perDate(facts, null)).toEqual([
      { date: '20260105', departures: 2, km: 20 },
      { date: '20260106', departures: 0, km: 0 },
      { date: '20260107', departures: 2, km: 10 },
    ]);
    expect(perDate(facts, { from: '20260106', to: '20260108' }).map((d) => d.date)).toEqual(['20260106', '20260107', '20260108']);
    expect(busiestDate(facts, null)).toBe('20260105');
    expect(busiestDate([], null)).toBeNull();
  });
});
