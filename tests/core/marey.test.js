// The visual timetable (Marey chart, design 2026-10-27): rows, days, trip lines, passes, pattern bands.
import { describe, it, expect } from 'vitest';
import { rowOffsets, periodDays, tripLines, tribes } from '../../src/core/marey.js';

const stop = (name, stopId, isDwellArr = false) => ({ name, stopId, isDwellArr });
const c = (t) => (t === '|' ? { time: '|', dayOffset: 0, suffix: '' } : t ? { time: t, dayOffset: 0, suffix: '' } : null);
const col = (times, more = {}) => ({ uid: Math.random().toString(36).slice(2), dayCode: 'D', cells: times.map(c), ...more });
const D = ['20270104', '20270105', '20270106', '20270107', '20270108', '20270109', '20270110']; // Mon–Sun

describe('rows', () => {
  const rows = [stop('A', 'q1'), stop('B', 'q2', true), stop('B', 'q2'), stop('C', 'q3')];
  it('evenly: one step a row, a waiting stop\'s two rows on one line', () => {
    expect(rowOffsets(rows, () => null, 'even')).toEqual([0, 1, 1, 2]);
  });
  it('by distance between the stops, falling back to one step where a position is missing', () => {
    const pos = { q1: { lat: 59, lon: 10 }, q2: { lat: 59.01, lon: 10 } };
    const y = rowOffsets(rows, (id) => /** @type {any} */ (pos)[id] ?? null, 'dist');
    expect(y[1]).toBeCloseTo(1.11, 1);
    expect(y[2]).toBe(y[1]);
    expect(y[3]).toBeCloseTo(y[2] + 1, 5);
  });
});

describe('the period', () => {
  it('a day, its Monday–Sunday week, or its month', () => {
    expect(periodDays('20270106', 'day')).toEqual(['20270106']);
    expect(periodDays('20270106', 'week')).toEqual(D);
    expect(periodDays('20270215', 'month')).toHaveLength(28);
  });
});

describe('trip lines', () => {
  const rows = [stop('A', 'q1'), stop('B', 'q2'), stop('C', 'q3'), stop('D', 'q4')];
  const grid = { stops: rows, cols: [col(['0700', '0710', '0720', '0730']), col(['0800', '|', '0820', '0830']), col(['', '0910', '0920', '']), col(['1000', '1010', '1020', '1030'], { dayCode: '6' })] };
  const y = [0, 1, 2, 3];

  it('draws a trip when it runs on a day of the period', () => {
    expect(tripLines(grid, D, ['20270106'], y).map((l) => l.n)).toEqual([0, 1, 2]);
    expect(tripLines(grid, D, D, y).map((l) => l.n)).toEqual([0, 1, 2, 3]);
  });

  it('a pass: the segment over it is a skip, with a tick where it crosses the row', () => {
    const l = tripLines(grid, D, ['20270106'], y).find((x) => x.n === 1);
    expect(l?.segs.map((s) => s.skip)).toEqual([true, false]);
    expect(l?.passes).toEqual([{ r: 1, m: 490 }]);
  });

  it('a stop carries its boarding restriction: a = alighting only, p = boarding only', () => {
    const g = { stops: rows, cols: [col(['0700', '0710', '0720', '0730'])] };
    g.cols[0].cells[1].suffix = 'a';
    g.cols[0].cells[2].suffix = 'p';
    expect(tripLines(g, D, ['20270106'], y)[0].stops.map((s) => s.use)).toEqual(['', 'a', 'p', '']);
  });

  it('starts at its first time and ends at its last', () => {
    expect(tripLines(grid, D, ['20270106'], y).find((x) => x.n === 2)?.stops.map((s) => s.r)).toEqual([1, 2]);
  });
});

describe('pattern bands', () => {
  const rows = [stop('A', 'q1'), stop('B', 'q2')];
  it('runs of trips with the same relative times share a band; one colour per pattern; a different trip breaks it', () => {
    const grid = { stops: rows, cols: [col(['0700', '0710']), col(['0730', '0740']), col(['0800', '0815']), col(['0830', '0840']), col(['0900', '0910']), col(['0930', '0945']), col(['1000', '1015'])] };
    const bands = tribes(tripLines(grid, D, ['20270106'], [0, 1]));
    expect(bands.map((b) => [b.members, b.colour])).toEqual([[[0, 1], 0], [[3, 4], 0], [[5, 6], 1]]);
  });

  it('a trip over other stops (a short trip) does not break a run; only a trip over the same stops with other times does (user 2026-10-27)', () => {
    const three = [stop('A', 'q1'), stop('B', 'q2'), stop('C', 'q3')];
    const grid = { stops: three, cols: [
      col(['0235', '0300', '0347']), col(['0305', '0330', '0417']), col(['', '0308', '0323']), // a short trip starting in between
      col(['0335', '0400', '0447']), col(['0405', '0430', '0517']),
    ] };
    expect(tribes(tripLines(grid, D, ['20270106'], [0, 1, 2])).map((b) => b.members)).toEqual([[0, 1, 3, 4]]);
  });
});
