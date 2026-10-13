import { describe, it, expect } from 'vitest';
import { isValidDayCode, isValidCellTime, isValidDate } from '../../../src/core/ern/validate.js';

describe('ERN value rules', () => {
  it('accepts the day codes the 1.5.7 grid accepted', () => {
    for (const ok of ['', 'D', 'DX67', 'DX1', 'DX123', '6', '135', '1234']) expect(isValidDayCode(ok)).toBe(true);
    for (const bad of ['X', 'DX', 'DX1234', 'DX66', '12345', '0', '8', '11', 'd', 'S']) expect(isValidDayCode(bad)).toBe(false);
  });

  it('accepts HHMM up to 29:59 and the pass-through pipe', () => {
    for (const ok of ['0000', '0745', '2359', '2930', '|']) expect(isValidCellTime(ok)).toBe(true);
    for (const bad of ['', '745', '07:45', '3000', '0760', 'abcd', '07450']) expect(isValidCellTime(bad)).toBe(false);
  });

  it('accepts empty, 0 and real YYYYMMDD dates', () => {
    for (const ok of ['', '0', '20260601', '20240229']) expect(isValidDate(ok)).toBe(true);
    for (const bad of ['2026-06-01', '20260231', '20250229', '2026061', '202606011']) expect(isValidDate(bad)).toBe(false);
  });
});
