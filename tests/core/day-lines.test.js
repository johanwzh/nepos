import { describe, it, expect } from 'vitest';
import { dayLines } from '../../src/core/day-lines.js';
const c = (time, dayOffset = 0) => ({ time, dayOffset });

describe('day lines', () => {
  it('a daytime trip: none', () => {
    expect([...dayLines([c('0700'), c('0710')])]).toEqual([]);
  });
  it('a line on the first time after midnight, one day', () => {
    expect([...dayLines([c('2350'), c('2359'), c('0004', 1), c('0010', 1)])]).toEqual([[2, 1]]);
  });
  it('the jump, not the total: +1 to +3 is 2', () => {
    expect([...dayLines([c('2359'), c('0004', 1), c('0004', 3)])]).toEqual([[1, 1], [2, 2]]);
  });
  it('a ferry 2350 → 0150+2: one line, 2', () => {
    expect([...dayLines([c('2350'), c('0150', 2)])]).toEqual([[1, 2]]);
  });
  it('above the first time when the trip starts after the day code\'s midnight', () => {
    expect([...dayLines([c('0010', 1), c('0020', 1)])]).toEqual([[0, 1]]);
  });
  it('passes and empty rows carry no line: it goes on the next time', () => {
    expect([...dayLines([c('2355'), { time: '|', dayOffset: 0 }, null, c('0005', 1)])]).toEqual([[3, 1]]);
  });
});
