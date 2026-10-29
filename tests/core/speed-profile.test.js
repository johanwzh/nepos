import { describe, it, expect } from 'vitest';
import { speedProfile, SPEED_LIMITS, speedLimit, HIGH_LIMIT } from '../../src/core/speed-profile.js';

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

describe("the project's own speed limits (customer 2026-10-19)", () => {
  it("uses the project's level for a mode, else the default; nonsense is ignored", () => {
    expect(speedLimit('bus')).toBe(SPEED_LIMITS.bus);
    expect(speedLimit('bus', { bus: 120 })).toBe(120);
    expect(speedLimit('bus', { bus: 0 })).toBe(SPEED_LIMITS.bus);
    expect(speedLimit('bus', { bus: /** @type {any} */ ('fast') })).toBe(SPEED_LIMITS.bus);
    expect(speedLimit('tram', { bus: 120 })).toBe(SPEED_LIMITS.tram);
    expect(HIGH_LIMIT).toBe(1.5);
  });
});

describe("the trip's average and each leg's possible speed (2.5)", () => {
  // 0.054° of latitude ≈ 6 km
  const six = new Map([['A', at(60, 10)], ['B', at(60.054, 10)], ['C', at(60.108, 10)], ['D', at(60.162, 10)]]);
  // A 0700 → B 0706, B waits 0706/0710, B 0710 → C 0722, C 0722 → D 0730
  const grid = { stops: [stop('A', 'A'), stop('B', 'B', { isDwellArr: true }), stop('B', 'B'), stop('C', 'C'), stop('D', 'D')],
    cols: [{ cells: [cell('0700'), cell('0706'), cell('0710'), cell('0722'), cell('0730')] }] };
  const p = speedProfile(grid, grid.cols[0], six, 'bus');
  const km = p.legs[0].km;

  it("the trip's own average: km over running minutes, layovers left out", () => {
    const total = p.legs.reduce((n, l) => n + l.km, 0);
    expect(p.avg).toBeCloseTo(total / (26 / 60), 6);
    const lay = { stops: [stop('A', 'A'), stop('B', 'B'), stop('B', 'B'), stop('C', 'C')], cols: [{ cells: [cell('0700'), cell('0706'), cell('0716'), cell('0722')] }] };
    const q = speedProfile(lay, lay.cols[0], six, 'bus');
    expect(q.avg).toBeCloseTo((q.legs[0].km + q.legs[2].km) / (12 / 60), 6);
  });

  it('a speed range from the minute windows: the first departure is pinned at :00', () => {
    expect(p.legs[0].kmhMin).toBeCloseTo(km / (419 / 3600), 6);
    expect(p.legs[0].kmhMax).toBeCloseTo(km / (360 / 3600), 6);
  });

  it('a departure after a wait is pinned; one inside a run is a window', () => {
    // B departs 0710 after waiting from 0706: pinned. 12 min: 720 … 779 s
    expect(p.legs[1].kmhMax).toBeCloseTo(p.legs[1].km / (720 / 3600), 6);
    expect(p.legs[1].kmhMin).toBeCloseTo(p.legs[1].km / (779 / 3600), 6);
    // C departs 0722 inside the run: a window. 8 min: 421 … 539 s
    expect(p.legs[2].kmhMax).toBeCloseTo(p.legs[2].km / (421 / 3600), 6);
    expect(p.legs[2].kmhMin).toBeCloseTo(p.legs[2].km / (539 / 3600), 6);
  });

  it('a departure after a layover leg is pinned; layovers have no range', () => {
    const lay = { stops: [stop('A', 'A'), stop('B', 'B'), stop('B', 'B'), stop('C', 'C')], cols: [{ cells: [cell('0700'), cell('0706'), cell('0716'), cell('0722')] }] };
    const q = speedProfile(lay, lay.cols[0], six, 'bus');
    expect(q.legs[1]).toMatchObject({ kind: 'layover', kmhMin: null, kmhMax: null });
    expect(q.legs[2].kmhMax).toBeCloseTo(q.legs[2].km / (360 / 3600), 6);
  });

  it('a 0-minute leg has a range but no exact speed; no average when there is no running time', () => {
    const zero = { stops: [stop('A', 'A'), stop('B', 'B')], cols: [{ cells: [cell('0700'), cell('0700')] }] };
    const q = speedProfile(zero, zero.cols[0], six, 'bus');
    expect(q.legs[0].kmh).toBe(null);
    expect(q.legs[0].kmhMin).toBeCloseTo(q.legs[0].km / (59 / 3600), 6);
    expect(q.legs[0].kmhMax).toBeCloseTo(q.legs[0].km / (1 / 3600), 6);
    expect(q.avg).toBe(null);
  });

  it('past midnight: 2358 → 0003+1 is 5 minutes, and the range follows', () => {
    const night = { stops: [stop('A', 'A'), stop('B', 'B')], cols: [{ cells: [cell('2358'), cell('0003', 1)] }] };
    const q = speedProfile(night, night.cols[0], six, 'bus');
    expect(q.legs[0].minutes).toBe(5);
    expect(q.legs[0].kmhMax).toBeCloseTo(q.legs[0].km / (300 / 3600), 6);
  });
});
