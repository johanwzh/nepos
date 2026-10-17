import { describe, it, expect } from 'vitest';
import { shiftTimes } from '../../src/core/time-shift.js';

const cell = (/** @type {string} */ time, dayOffset = 0) => ({ time, dayOffset, suffix: '', interchange: null, footnoteId: null });
const times = (/** @type {any} */ col) => col.cells.map((/** @type {any} */ c) => (c ? `${c.time}${c.dayOffset ? '+' + c.dayOffset : ''}` : null));

describe('shiftTimes (the mini-jog)', () => {
  it('moves the given rows by whole minutes, leaving | and empty cells alone', () => {
    const col = { dayCode: 'D', cells: [cell('0700'), cell('|'), null, cell('0730')] };
    shiftTimes(col, [0, 1, 2, 3], 3);
    expect(times(col)).toEqual(['0703', '|', null, '0733']);
    shiftTimes(col, [3], -10);
    expect(times(col)).toEqual(['0703', '|', null, '0723']);
  });

  it('carries over midnight within the trip (a later stop gets the next day)', () => {
    const col = { dayCode: 'D', cells: [cell('2350'), cell('2358')] };
    shiftTimes(col, [0, 1], 5);
    expect(times(col)).toEqual(['2355', '0003+1']);
  });

  it('wraps round the clock on the same day code when the trip itself crosses midnight', () => {
    const late = { dayCode: '12345', cells: [cell('2358'), cell('0010', 1)] };
    shiftTimes(late, [0, 1], 5);
    expect(times(late)).toEqual(['0003', '0015']);
    expect(late.dayCode).toBe('12345');
    const early = { dayCode: '6', cells: [cell('0002'), cell('0010')] };
    shiftTimes(early, [0, 1], -5);
    expect(times(early)).toEqual(['2357', '0005+1']);
    expect(early.dayCode).toBe('6');
  });
});

describe('review fixes', () => {
  it('a trip that starts after midnight (+1) stays on that day when nudged', () => {
    const col = { dayCode: '5', cells: [cell('0030', 1), cell('0045', 1)] };
    shiftTimes(col, [0, 1], 1);
    expect(times(col)).toEqual(['0031+1', '0046+1']);
    shiftTimes(col, [0, 1], -40); // past the start of that day: wraps round within it
    expect(times(col)).toEqual(['2351+1', '0006+2']);
  });
});

describe('only the selected cells (user test 2026-10-17)', () => {
  it('never moves a time that is not in the given rows, even when the first time wraps', () => {
    const col = { dayCode: '6', cells: [cell('0002'), cell('0010'), cell('0020')] };
    shiftTimes(col, [1], 5);
    expect(times(col)).toEqual(['0002', '0015', '0020']);
    shiftTimes(col, [0], -5);
    expect(times(col)).toEqual(['2357', '0015', '0020']); // the first time wrapped round on its own day
  });
});

describe('loose ends (2026-10-17)', () => {
  it('changes the cells in place, so a note box holding a cell still holds the right one', () => {
    const col = { dayCode: 'D', cells: [cell('0700')] };
    const before = col.cells[0];
    shiftTimes(col, [0], 2);
    expect(col.cells[0]).toBe(before);
    expect(before.time).toBe('0702');
  });
});
