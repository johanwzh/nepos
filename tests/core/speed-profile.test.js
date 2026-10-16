import { describe, it, expect } from 'vitest';
import { speedProfile, SPEED_LIMITS } from '../../src/core/speed-profile.js';

const stop = (/** @type {string} */ name, /** @type {string | null} */ stopId, extra = {}) => ({ name, stopId, bold: false, sep: false, isDwellArr: false, price: null, ...extra });
const cell = (/** @type {string} */ time, dayOffset = 0) => ({ time, dayOffset, suffix: '', interchange: null, footnoteId: null });
const at = (/** @type {number} */ lat, /** @type {number} */ lon) => ({ quayId: '', publicCode: '', stopPlaceId: '', stopPlaceName: '', mode: 'bus', lat, lon });
// 0.01° of latitude ≈ 1.112 km
const info = new Map([['A', at(60, 10)], ['B', at(60.01, 10)], ['C', at(60.02, 10)], ['D', at(60.5, 10)]]);

describe('speedProfile', () => {
  it('gives each leg its straight-line speed and places the stops by their share of the running time', () => {
    const grid = { stops: [stop('A', 'A'), stop('B', 'B'), stop('C', 'C')], cols: [{ cells: [cell('1000'), cell('1002'), cell('1010')] }] };
    const p = speedProfile(grid, grid.cols[0], info, 'bus');
    expect(p.limit).toBe(SPEED_LIMITS.bus);
    expect(p.points.map((x) => x.ri)).toEqual([0, 1, 2]);
    expect(p.points.map((x) => Math.round(x.x * 100))).toEqual([0, 20, 100]);
    expect(p.legs.map((l) => [l.from, l.to, l.minutes, Math.round(/** @type {number} */ (l.kmh))])).toEqual([[0, 1, 2, 33], [1, 2, 8, 8]]);
    expect(p.legs.map((l) => l.kind)).toEqual(['ok', 'ok']);
  });

  it('warns near the limit and over it; the same minute counts as a warning', () => {
    const grid = { stops: [stop('A', 'A'), stop('D', 'D'), stop('C', 'C'), stop('B', 'B')], cols: [{ cells: [cell('1000'), cell('1030'), cell('1040'), cell('1040')] }] };
    const legs = speedProfile(grid, grid.cols[0], info, 'bus').legs;
    expect(legs.map((l) => l.kind)).toEqual(['over', 'over', 'zero']); // 55.6 km in 30 min; 53 km in 10 min; 0 min
    expect(legs[2].kmh).toBe(null);
    const near = { stops: [stop('A', 'A'), stop('D', 'D')], cols: [{ cells: [cell('1000'), cell('1043')] }] }; // 55.6 km in 43 min ≈ 78 km/h
    expect(speedProfile(near, near.cols[0], info, 'bus').legs[0].kind).toBe('warn');
  });

  it('treats the same stop twice in a row as a layover: no speed, never negative', () => {
    const grid = { stops: [stop('A', 'A'), stop('B', 'B'), stop('B', 'B'), stop('C', 'C')], cols: [{ cells: [cell('1000'), cell('1005'), cell('1015'), cell('1020')] }] };
    const p = speedProfile(grid, grid.cols[0], info, 'bus');
    expect(p.legs.map((l) => l.kind)).toEqual(['ok', 'layover', 'ok']);
    expect(p.legs[1].kmh).toBe(null);
    expect(p.legs[1].minutes).toBe(10);
    // a layover whose times are typed the wrong way round is still a layover, kept in order on the line
    const back = { stops: [stop('A', 'A'), stop('B', 'B'), stop('B', 'B')], cols: [{ cells: [cell('1000'), cell('1010'), cell('1005')] }] };
    const q = speedProfile(back, back.cols[0], info, 'bus');
    expect(q.legs.map((l) => l.kind)).toEqual(['ok', 'layover']);
    expect(q.points.map((x) => x.x)).toEqual([...q.points.map((x) => x.x)].sort((a, b) => a - b));
  });

  it('reads times past midnight (a later day, or the clock wrapping) and flags a time going backwards', () => {
    const night = { stops: [stop('A', 'A'), stop('B', 'B'), stop('C', 'C')], cols: [{ cells: [cell('2355'), cell('0001', 1), cell('0005')] }] };
    expect(speedProfile(night, night.cols[0], info, 'bus').legs.map((l) => l.minutes)).toEqual([6, 4]);
    const back = { stops: [stop('A', 'A'), stop('B', 'B')], cols: [{ cells: [cell('1010'), cell('1000')] }] };
    expect(speedProfile(back, back.cols[0], info, 'bus').legs[0].kind).toBe('negative');
  });

  it('leaves out stops without a position and | rows, joining the stops on each side', () => {
    const grid = { stops: [stop('A', 'A'), stop('X', 'X'), stop('Pass', 'C'), stop('B', 'B')], cols: [{ cells: [cell('1000'), cell('1004'), cell('|'), cell('1010')] }] };
    const p = speedProfile(grid, grid.cols[0], info, 'bus');
    expect(p.points.map((x) => x.ri)).toEqual([0, 3]);
    expect(p.legs).toHaveLength(1);
    expect(p.legs[0].minutes).toBe(10);
  });

  it('has a sensible limit per mode', () => {
    expect([SPEED_LIMITS.bus, SPEED_LIMITS.coach, SPEED_LIMITS.tram, SPEED_LIMITS.rail, SPEED_LIMITS.water, SPEED_LIMITS.air]).toEqual([80, 100, 60, 200, 60, 900]);
    const grid = { stops: [stop('A', 'A'), stop('B', 'B')], cols: [{ cells: [cell('1000'), cell('1002')] }] };
    expect(speedProfile(grid, grid.cols[0], info, 'unknownmode').limit).toBe(100);
  });
});
