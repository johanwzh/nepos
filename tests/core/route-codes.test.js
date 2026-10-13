import { describe, it, expect } from 'vitest';
import { nextRouteCode, compareRouteCodes } from '../../src/core/route-codes.js';

describe('route codes', () => {
  it('sorts numbers first, numerically, then the rest alphabetically', () => {
    expect(['A1', '10', '9', 'B', '100'].sort(compareRouteCodes)).toEqual(['9', '10', '100', 'A1', 'B']);
  });

  it('gives the next number after the highest numeric code', () => {
    expect(nextRouteCode(['9', '10', 'A1'])).toBe('11');
    expect(nextRouteCode(['A1'])).toBe('1');
    expect(nextRouteCode([])).toBe('1');
  });
});
