import { describe, it, expect } from 'vitest';
import { dayCodeToWeekdayNums, generateRecurring, fnToText, fnSummary, yyyymmddToDisplay, yyyymmddToInput, inputToYyyymmdd } from '../../src/core/footnotes.js';

describe('footnote helpers', () => {
  it('turns day codes into weekdays', () => {
    expect(dayCodeToWeekdayNums('D')).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(dayCodeToWeekdayNums('DX67')).toEqual([1, 2, 3, 4, 5]);
    expect(dayCodeToWeekdayNums('135')).toEqual([1, 3, 5]);
  });

  it('generates every-N-weeks dates on a weekday', () => {
    // 2026-06-01 is a Monday
    expect(generateRecurring('2026-06-01', '2026-06-30', 2, 3)).toEqual(['20260603', '20260617']);
    expect(generateRecurring('', '2026-06-30', 2, 3)).toEqual([]);
  });

  it('converts between date formats', () => {
    expect(yyyymmddToDisplay('20260603')).toBe('3/6/26');
    expect(yyyymmddToInput('20260603')).toBe('2026-06-03');
    expect(inputToYyyymmdd('2026-06-03')).toBe('20260603');
  });

  it('writes the footnote as a sentence in either language', () => {
    const fn = { id: 1, text: 'Via Hamrebakkene', exceptions: [{ runsOnly: false, from: '20260706', to: '20260802' }] };
    expect(fnToText(fn, 'no')).toBe('Via Hamrebakkene. Ikke 6/7-2/8 26.');
    expect(fnToText(fn, 'en')).toBe('Via Hamrebakkene. Not 6/7-2/8 26.');
    expect(fnSummary(fn, 'en')).toBe('Via Hamrebakkene · Not 20260706 → 20260802');
  });
});
