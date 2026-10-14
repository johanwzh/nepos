import { describe, it, expect } from 'vitest';
import { cellToMins, minsToCell, interpolateTime, extrapolateTime, speedUnit, toKmh } from '../../src/core/interpolate.js';

const stop = (/** @type {string} */ id, extra = {}) => ({ name: id, stopId: id, bold: false, sep: false, isDwellArr: false, price: null, ...extra });
const cell = (/** @type {string} */ time, dayOffset = 0) => ({ time, dayOffset, suffix: '', interchange: null, footnoteId: null });
// Stops on a north-south line; 0.09° latitude ≈ 10 km.
const POS = { A: [10, 60], B: [10, 60.09], C: [10, 60.27], D: [10, 60.36] };
const posOf = (/** @type {any} */ s) => /** @type {any} */ (POS)[s.stopId] ?? null;

describe('time helpers', () => {
  it('converts cells to minutes and back, across midnight', () => {
    expect(cellToMins(cell('0130', 1))).toBe(1530);
    expect(cellToMins(cell('|'))).toBe(null);
    expect(minsToCell(1530)).toEqual(cell('0130', 1));
  });
});

describe('interpolateTime', () => {
  it('spreads the time by distance between the known times', () => {
    // A 0700, B ?, C ?, D 0730 — B is 10 km of 40 km, C is 30 km of 40 km
    const grid = { stops: [stop('A'), stop('B'), stop('C'), stop('D')], cols: [{ cells: [cell('0700'), null, null, cell('0730')] }] };
    expect(interpolateTime(grid, 0, 1, posOf)?.time).toBe('0708');
    expect(interpolateTime(grid, 0, 2, posOf)?.time).toBe('0723');
  });

  it('goes forwards across midnight', () => {
    const grid = { stops: [stop('A'), stop('B'), stop('C')], cols: [{ cells: [cell('2350'), null, cell('0020')] }] };
    // A→B is 10 km of A→C's 30 km: a third of the 30 minutes after 2350
    expect(interpolateTime(grid, 0, 1, posOf)).toEqual(cell('0000', 1));
    const later = { stops: [stop('A'), stop('B'), stop('C')], cols: [{ cells: [cell('2350'), null, cell('0110', 1)] }] };
    expect(cellToMins(/** @type {any} */ (interpolateTime(later, 0, 1, posOf)))).toBeGreaterThan(1430);
  });

  it('is not possible without positions or without times on both sides', () => {
    const noPos = { stops: [stop('A'), stop('X'), stop('C')], cols: [{ cells: [cell('0700'), null, cell('0730')] }] };
    expect(interpolateTime(noPos, 0, 1, posOf)).toBe(null);
    const oneSide = { stops: [stop('A'), stop('B'), stop('C')], cols: [{ cells: [cell('0700'), null, null] }] };
    expect(interpolateTime(oneSide, 0, 1, posOf)).toBe(null);
  });

  it('treats a dwell pair as one place', () => {
    // B arrives and departs (two rows, same stop): the dwell arrival row is skipped
    const grid = {
      stops: [stop('A'), stop('B', { isDwellArr: true }), stop('B'), stop('C')],
      cols: [{ cells: [cell('0700'), cell('0710'), null, cell('0730')] }],
    };
    expect(interpolateTime(grid, 0, 2, posOf)?.time).toBe('0710');
  });
});

describe('extrapolateTime', () => {
  const grid = () => ({ stops: [stop('A'), stop('B'), stop('C')], cols: [{ cells: [null, cell('0700'), null] }] });

  it('adds the travel time at a speed forwards and backwards', () => {
    // B → C is 20 km; at 60 km/h that is 20 minutes
    expect(extrapolateTime(grid(), 0, 2, 'fwd', 60, posOf)?.time).toBe('0720');
    // A → B is 10 km; at 60 km/h that is 10 minutes before
    expect(extrapolateTime(grid(), 0, 0, 'bwd', 60, posOf)?.time).toBe('0650');
  });

  it('is not possible without an anchor, a position or a speed', () => {
    expect(extrapolateTime(grid(), 0, 0, 'fwd', 60, posOf)).toBe(null);
    expect(extrapolateTime(grid(), 0, 2, 'fwd', 0, posOf)).toBe(null);
    const noPos = { stops: [stop('A'), stop('B'), stop('X')], cols: [{ cells: [null, cell('0700'), null] }] };
    expect(extrapolateTime(noPos, 0, 2, 'fwd', 60, posOf)).toBe(null);
  });
});

describe('speed units', () => {
  it('uses knots for boats and km/h for everything else', () => {
    expect(speedUnit(5)).toBe('knots'); // express boat
    expect(speedUnit(6)).toBe('knots'); // ship
    expect(speedUnit(7)).toBe('knots'); // car ferry
    expect(speedUnit(1)).toBe('kmh');   // bus
    expect(speedUnit(3)).toBe('kmh');   // train
    expect(toKmh(10, 'knots')).toBeCloseTo(18.52);
    expect(toKmh(50, 'kmh')).toBe(50);
  });
});
