import { describe, it, expect } from 'vitest';
import { copiesAtInterval } from '../../src/core/column-copy.js';

const cell = (/** @type {string} */ time, dayOffset = 0, extra = {}) => ({ time, dayOffset, suffix: '', interchange: null, footnoteId: null, ...extra });
const col = (/** @type {string} */ dayCode, /** @type {any[]} */ cells) => ({ dayCode, uid: 'src', footnote: '', footnoteId: null, cells });
const starts = (/** @type {any[]} */ cols) => cols.map((c) => `${c.dayCode} ${c.cells.find(Boolean).time}`);

describe('copiesAtInterval', () => {
  it('copies every interval up to and including the last start time (08:00, hourly, until 15:30 → 09:00 … 15:00)', () => {
    const copies = copiesAtInterval(col('D', [cell('0800'), cell('0815')]), 60, 15 * 60 + 30);
    expect(starts(copies)).toEqual(['D 0900', 'D 1000', 'D 1100', 'D 1200', 'D 1300', 'D 1400', 'D 1500']);
    expect(copies[0].cells[1].time).toBe('0915');
    expect(new Set(copies.map((c) => c.uid)).size).toBe(7);
    expect(copies.every((c) => c.uid !== 'src')).toBe(true);
  });

  it('runs past midnight: the day code moves on for copies that start the next day, and times are on that day', () => {
    const copies = copiesAtInterval(col('12345', [cell('2200'), cell('2330')]), 60, 1 * 60); // until 01:00 (next day)
    expect(starts(copies)).toEqual(['12345 2300', '23456 0000', '23456 0100']);
    expect(copies[0].cells[1]).toMatchObject({ time: '0030', dayOffset: 1 }); // 23:00 trip ends after midnight
    expect(copies[1].cells[0]).toMatchObject({ time: '0000', dayOffset: 0 });
  });

  it('never makes a copy 24 hours or more after the start', () => {
    const copies = copiesAtInterval(col('D', [cell('0800')]), 7 * 60, 7 * 60 + 59); // until 07:59 the next morning
    expect(starts(copies)).toEqual(['D 1500', 'D 2200', 'D 0500']);
  });

  it('keeps marks and notes, drops interchanges', () => {
    const copies = copiesAtInterval(col('D', [cell('0800', 0, { suffix: 'p', interchange: { targetR: 0, targetC: 3, type: 'guaranteed' } })]), 30, 9 * 60);
    expect(copies[0].cells[0]).toMatchObject({ time: '0830', suffix: 'p', interchange: null });
  });
});

describe('review fixes', () => {
  it('a trip that starts after midnight (+1) keeps its day: copies on the same day stay +1 with the same day code', () => {
    const copies = copiesAtInterval(col('5', [cell('0030', 1), cell('0050', 1)]), 60, 2 * 60 + 30); // Saturday morning trips
    expect(copies.map((c) => `${c.dayCode} ${c.cells[0].time}+${c.cells[0].dayOffset}`)).toEqual(['5 0130+1', '5 0230+1']);
  });

  it('copies do not take the trip number with them', () => {
    const copies = copiesAtInterval({ ...col('D', [cell('0800')]), tripNo: '101' }, 60, 10 * 60);
    expect(copies.map((c) => c.tripNo)).toEqual(['', '']);
  });
});

describe('code review 2026-10-17', () => {
  it('moves a copy\'s own dates with it when it runs a day later', () => {
    const src = { ...col('D', [cell('2330'), { ...cell('2345'), dates: [{ from: '20261224', to: '20261224', on: false }] }]), dates: [{ from: '20261224', to: '20261224', on: false }] };
    const copies = copiesAtInterval(src, 60, 30); // 00:30 the next day
    expect(copies[0].dates).toEqual([{ from: '20261225', to: '20261225', on: false }]);
    expect(copies[0].cells[1].dates).toEqual([{ from: '20261225', to: '20261225', on: false }]);
  });
});
