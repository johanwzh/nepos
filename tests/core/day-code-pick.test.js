import { describe, it, expect } from 'vitest';
import { dayCodeFor, dayCodePick, shiftDayCode } from '../../src/core/day-codes.js';

const days = (/** @type {string} */ s) => new Set([...s].map(Number));

describe('dayCodeFor: clicked days → the shortest allowed day code', () => {
  it('every day is D; up to four days are digits; five or six days are DX', () => {
    expect(dayCodeFor(days('1234567'), true)).toBe('D');
    expect(dayCodeFor(days('135'), true)).toBe('135');
    expect(dayCodeFor(days('12345'), true)).toBe('DX67');
    expect(dayCodeFor(days('123456'), true)).toBe('DX7');
  });

  it('with holidays off: the DX…H forms; holidays only: H', () => {
    expect(dayCodeFor(days('1234567'), false)).toBe('DXH');
    expect(dayCodeFor(days('12345'), false)).toBe('DX67H');
    expect(dayCodeFor(days(''), true)).toBe('H');
  });

  it('says so (null) when the day codes cannot express it', () => {
    expect(dayCodeFor(days('135'), false)).toBe(null); // three weekdays, not on holidays
    expect(dayCodeFor(days(''), false)).toBe(null);
  });

  it('reads a code back into days and the holiday choice', () => {
    expect(dayCodePick('DX67H')).toEqual({ days: [1, 2, 3, 4, 5], holidays: false });
    expect(dayCodePick('H')).toEqual({ days: [], holidays: true });
    expect(dayCodePick('6')).toEqual({ days: [6], holidays: true });
  });
});

describe('shiftDayCode: a copy that starts after midnight runs a day later', () => {
  it('moves weekday digits on (7 → 1), keeps D, H and the H of DX…H', () => {
    expect(shiftDayCode('12345', 1)).toBe('23456');
    expect(shiftDayCode('67', 1)).toBe('17');
    expect(shiftDayCode('DX67', 1)).toBe('DX17');
    expect(shiftDayCode('DX67H', 1)).toBe('DX17H');
    expect(shiftDayCode('D', 1)).toBe('D');
    expect(shiftDayCode('H', 1)).toBe('H');
    expect(shiftDayCode('7', 0)).toBe('7');
  });
});
