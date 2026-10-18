import { describe, it, expect } from 'vitest';
import { easterSunday, norwegianHolidays } from '../../src/core/holidays.js';
import { parseDayCode, isAllowedDayCode } from '../../src/core/day-codes.js';
import { addDays, weekdayOf, isoDate, normalizeRanges, calendarDays, unionDays, columnDays } from '../../src/core/calendars.js';
import { byDate } from '../../src/core/calendars.js';
import { uuid5, NEPOS_NAMESPACE } from '../../src/core/uuid5.js';
import { isValidDayCode } from '../../src/core/ern/validate.js';
import { isoWeek, daysToRanges, setDays, shiftRanges } from '../../src/core/calendars.js';

describe('holidays', () => {
  it('finds Easter and the Norwegian public holidays', () => {
    expect(easterSunday(2026)).toBe('20260405');
    expect(easterSunday(2027)).toBe('20270328');
    const h = norwegianHolidays(2027);
    expect([...h.keys()]).toEqual(['20270101', '20270325', '20270326', '20270328', '20270329', '20270501',
      '20270506', '20270516', '20270517', '20271225', '20271226']);
    expect(h.get('20270517')).toBe('2. pinsedag, Grunnlovsdag'); // both holidays fall on 17 May 2027
  });
});

describe('day codes', () => {
  it('reads the allowed forms', () => {
    expect(parseDayCode('D')).toEqual({ weekdays: [1, 2, 3, 4, 5, 6, 7], holidays: 'normal' });
    expect(parseDayCode('DX67')).toEqual({ weekdays: [1, 2, 3, 4, 5], holidays: 'normal' });
    expect(parseDayCode('135')).toEqual({ weekdays: [1, 3, 5], holidays: 'normal' });
    expect(parseDayCode('DXH')).toEqual({ weekdays: [1, 2, 3, 4, 5, 6, 7], holidays: 'exclude' });
    expect(parseDayCode('DX67H')).toEqual({ weekdays: [1, 2, 3, 4, 5], holidays: 'exclude' });
    expect(parseDayCode('H')).toEqual({ weekdays: [], holidays: 'only' });
  });

  it('refuses S, empty, repeated or out-of-range digits', () => {
    for (const c of ['S', '', 'DX66', '8', '11', 'DX1234', 'X', 'DH']) expect(isAllowedDayCode(c), c).toBe(false);
  });

  it('lets the ERN validator accept the H forms too', () => {
    for (const c of ['H', 'DXH', 'DX67H']) expect(isValidDayCode(c), c).toBe(true);
  });
});

describe('calendars', () => {
  it('has date helpers', () => {
    expect(addDays('20261231', 1)).toBe('20270101');
    expect(addDays('20270301', -1)).toBe('20270228');
    expect(weekdayOf('20261014')).toBe(3); // a Wednesday
    expect(isoDate('20261014')).toBe('2026-10-14');
  });

  it('normalises ranges: inclusive, sorted, merged, invalid ones dropped', () => {
    expect(normalizeRanges([['20260110', '20260115'], ['20260101', '20260105'], ['20260106', '20260108'], ['20260301', '20260201'], ['2026', '20260101']]))
      .toEqual([['20260101', '20260108'], ['20260110', '20260115']]);
  });

  it('counts both ends of a range: 17–18 August is two days', () => {
    expect(calendarDays({ id: 'a', name: 'A', ranges: [['20260817', '20260818']] })).toEqual(['20260817', '20260818']);
  });

  it('unites calendars', () => {
    const a = { id: 'a', name: 'A', ranges: /** @type {[string, string][]} */ ([['20260101', '20260102']]) };
    const b = { id: 'b', name: 'B', ranges: /** @type {[string, string][]} */ ([['20260102', '20260103']]) };
    expect(unionDays([a, b])).toEqual(['20260101', '20260102', '20260103']);
  });

  it('applies a day code, holidays included', () => {
    const may = calendarDays({ id: 'm', name: 'M', ranges: [['20270510', '20270523']] }); // Mon 10 – Sun 23 May 2027
    expect(columnDays(may, 'DX67')).toEqual(['20270510', '20270511', '20270512', '20270513', '20270514', '20270517', '20270518', '20270519', '20270520', '20270521']);
    expect(columnDays(may, 'DX67H')).toEqual(['20270510', '20270511', '20270512', '20270513', '20270514', '20270518', '20270519', '20270520', '20270521']);
    expect(columnDays(may, 'H')).toEqual(['20270516', '20270517']);
    expect(columnDays(may, 'S')).toEqual([]);
  });
});

describe('UUID v5', () => {
  it('is the RFC 4122 value and stable', () => {
    // RFC 4122 example namespace (DNS) and name "www.example.com"
    expect(uuid5('www.example.com', '6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe('2ed6657d-e927-568b-95e1-2665a8aea6a2');
    expect(uuid5('x')).toBe(uuid5('x', NEPOS_NAMESPACE));
    expect(uuid5('x')).not.toBe(uuid5('y'));
  });
});


describe('calendar editing helpers', () => {
  it('numbers ISO weeks, also week 53 and around New Year', () => {
    expect(isoWeek('20261231')).toBe(53);
    expect(isoWeek('20270101')).toBe(53);
    expect(isoWeek('20270104')).toBe(1);
    expect(isoWeek('20260101')).toBe(1);
    expect(isoWeek('20280229')).toBe(9);
  });

  it('turns days into ranges and back', () => {
    expect(daysToRanges(['20260103', '20260101', '20260102', '20260105'])).toEqual([['20260101', '20260103'], ['20260105', '20260105']]);
  });

  it('switches days on and off', () => {
    const cal = { id: 'a', name: 'A', ranges: /** @type {[string, string][]} */ ([['20260101', '20260110']]) };
    expect(setDays(cal, ['20260105'], false).ranges).toEqual([['20260101', '20260104'], ['20260106', '20260110']]);
    expect(setDays(cal, ['20260111', '20260112'], true).ranges).toEqual([['20260101', '20260112']]);
    expect(cal.ranges).toEqual([['20260101', '20260110']]); // unchanged
  });

  it('shifts ranges by whole weeks, keeping weekdays', () => {
    expect(shiftRanges([['20260817', '20261220']], 364)).toEqual([['20270816', '20271219']]);
  });

  it('keeps both names when two holidays fall on one date', () => {
    expect(norwegianHolidays(2027).get('20270517')).toBe('2. pinsedag, Grunnlovsdag');
  });
});

describe('tripDays: the day code, then the trip\'s own dates (spreadsheet tools spec)', () => {
  it('adds days (even ones the day code leaves out) and removes days (removing always wins)', async () => {
    const { tripDays } = await import('../../src/core/calendars.js');
    // 2026-03-02 is a Monday; the period is that week
    const period = ['20260302', '20260303', '20260304', '20260305', '20260306', '20260307', '20260308'];
    const col = { dayCode: 'DX67', dates: [
      { from: '20260307', to: '20260307', on: true },   // Saturday: added
      { from: '20260303', to: '20260304', on: false },  // Tue–Wed: removed
      { from: '20260304', to: '20260304', on: true },   // added again, but removing wins
      { from: '20260401', to: '20260401', on: true },   // outside the period: added as well
    ] };
    expect(tripDays(period, col)).toEqual(['20260302', '20260305', '20260306', '20260307', '20260401']);
    expect(tripDays(period, { dayCode: '6' })).toEqual(['20260307']); // no dates: just the day code
  });
});

describe('tripDays with "no date" values (code review 2026-10-17)', () => {
  it('ignores a range end that is not a date ("0" or empty) instead of counting from 1899', async () => {
    const { tripDays } = await import('../../src/core/calendars.js');
    expect(tripDays([], { dayCode: 'D', dates: [{ from: '0', to: '20261005', on: true }] })).toEqual(['20261005']);
    expect(tripDays([], { dayCode: 'D', dates: [{ from: '20261003', to: '0', on: true }] })).toEqual(['20261003']);
    expect(tripDays([], { dayCode: 'D', dates: [{ from: '0', to: '0', on: true }] })).toEqual([]);
  });
});

describe('byDate (43)', () => {
  it('sorts calendars by their first day, then by name; calendars without days last', () => {
    const cals = [
      { id: 'c', name: 'Vår', ranges: /** @type {[string, string][]} */ ([['20270101', '20270331']]) },
      { id: 'e', name: 'Tom', ranges: [] },
      { id: 'a', name: 'Høst', ranges: /** @type {[string, string][]} */ ([['20261001', '20261231']]) },
      { id: 'b', name: 'Helligdager', ranges: /** @type {[string, string][]} */ ([['20261001', '20261001']]) },
    ];
    expect(byDate(cals).map((c) => c.id)).toEqual(['b', 'a', 'c', 'e']);
  });
});
