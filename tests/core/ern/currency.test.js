import { describe, it, expect } from 'vitest';
import { currencyRate } from '../../../src/core/ern/currency.js';

describe('currencyRate', () => {
  it('returns the 1.5.7 table rate', () => {
    expect(currencyRate('spd')).toBe(9);
    expect(currencyRate('riksdaler')).toBe(6.9);
  });

  it('falls back to neposcoin (1) for unknown ids, like 1.5.7', () => {
    expect(currencyRate('unknown')).toBe(1);
  });
});
