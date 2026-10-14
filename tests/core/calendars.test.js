import { describe, it, expect } from 'vitest';
import { easterSunday, norwegianHolidays } from '../../src/core/holidays.js';
import { parseDayCode, isAllowedDayCode } from '../../src/core/day-codes.js';
import { addDays, weekdayOf, isoDate, normalizeRanges, calendarDays, unionDays, columnDays } from '../../src/core/calendars.js';
import { uuid5, NEPOS_NAMESPACE } from '../../src/core/uuid5.js';
import { isValidDayCode } from '../../src/core/ern/validate.js';

describe('holidays', () => {
  it('finds Easter and the Norwegian public holidays', () => {
    expect(easterSunday(2026)).toBe('20260405');
    expect(easterSunday(2027)).toBe('20270328');
    const h = norwegianHolidays(2027);
    expect([...h.keys()]).toEqual(['20270101', '20270325', '20270326', '20270328', '20270329', '20270501',
      '20270506', '20270516', '20270517', '20271225', '20271226']);
    expect(h.get('20270517')).toBe('Grunnlovsdag');
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
