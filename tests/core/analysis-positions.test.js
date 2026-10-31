// Analyse's Nettverkskart (spec 2026-10-31, part 2): where each trip is at a moment — along its leg's routed line by the
// share of the leg's time gone, on the straight line where a leg is not routed, standing at a stop while it waits.
import { describe, it, expect } from 'vitest';
import { tripsAt } from '../../src/core/analysis/positions.js';

/** @param {Partial<import('../../src/core/analysis/facts.js').TripFact>} o @returns {import('../../src/core/analysis/facts.js').TripFact} */
const fact = (o = {}) => ({ line: 'L1', mode: 'bus', profile: 'bus', days: ['20260105'], start: 600, end: 620, runMin: 20,
  calls: [{ stopId: 'A', arr: 600, dep: 600 }, { stopId: 'B', arr: 610, dep: 612 }, { stopId: 'C', arr: 620, dep: 620 }],
  legs: [{ key: 'A|B|bus', km: 2 }, { key: 'B|C|bus', km: null }], km: null, stopPlaces: [], fuel: '', seats: null, lowFloor: false, booked: false, ...o });
// A at (10, 60); B 1 km east then 1 km north (an L); C further north
const A = [10, 60], CORNER = [10 + 1 / (111.32 * Math.cos((60 * Math.PI) / 180)), 60], B = [CORNER[0], 60 + 1 / 111.2], C = [CORNER[0], 60 + 3 / 111.2];
/** @type {Record<string, number[]>} */ const POS = { A, B, C };
const opts = { legLine: (/** @type {string} */ k) => (k === 'A|B|bus' ? /** @type {[number, number][]} */ ([A, CORNER, B]) : null), stopPos: (/** @type {string} */ s) => /** @type {[number, number] | null} */ (POS[s] ?? null) };
const near = (/** @type {number[]} */ a, /** @type {number[]} */ b) => Math.abs(a[0] - b[0]) < 1e-4 && Math.abs(a[1] - b[1]) < 1e-4;

describe('trip positions', () => {
  it('halfway in time is halfway along the leg\'s line by distance', () => {
    const [p] = tripsAt([fact()], '20260105', 605, opts);
    expect(p.waiting).toBe(false);
    expect(near([p.lon, p.lat], CORNER)).toBe(true);
  });

  it('a trip waiting at a stop sits on the stop, waiting', () => {
    const [p] = tripsAt([fact()], '20260105', 611, opts);
    expect(p).toMatchObject({ line: 'L1', waiting: true });
    expect(near([p.lon, p.lat], B)).toBe(true);
  });

  it('without a routed line the trip moves on the straight line', () => {
    const [p] = tripsAt([fact()], '20260105', 616, opts);
    expect(near([p.lon, p.lat], [B[0], (B[1] + C[1]) / 2])).toBe(true);
  });

  it('the previous evening\'s trip after midnight is placed on the next date', () => {
    const late = fact({ days: ['20260104'], start: 1435, end: 1455, calls: [{ stopId: 'A', arr: 1435, dep: 1435 }, { stopId: 'B', arr: 1445, dep: 1447 }, { stopId: 'C', arr: 1455, dep: 1455 }] });
    const [p] = tripsAt([late], '20260105', 6, opts); // 00:06 = 1446 the day before: waiting at B
    expect(p.waiting).toBe(true);
    expect(tripsAt([late], '20260105', 30, opts)).toEqual([]);
  });

  it('before its first departure and after its last arrival a trip is not on the map', () => {
    expect(tripsAt([fact()], '20260105', 599, opts)).toEqual([]);
    expect(tripsAt([fact()], '20260105', 621, opts)).toEqual([]);
    expect(tripsAt([fact()], '20260106', 605, opts)).toEqual([]);
  });

  it('a trip whose stop has no position is left out', () => {
    expect(tripsAt([fact()], '20260105', 616, { ...opts, stopPos: (s) => (s === 'C' ? null : /** @type {any} */ (POS[s])) })).toEqual([]);
  });
});
