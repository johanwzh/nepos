// Analyse at the regional customer's size (final review I3): a date's day type is worked out once per date, not once
// per trip and date (150 lines × 100 trips × 250 days took 1.4 s).
import { describe, it, expect, vi } from 'vitest';

const calls = { n: 0 };
vi.mock('../../src/core/calendars.js', async (orig) => {
  const real = /** @type {any} */ (await orig());
  return { ...real, weekdayOf: (/** @type {string} */ d) => { calls.n++; return real.weekdayOf(d); } };
});
const { receipt } = await import('../../src/core/analysis/receipt.js');

describe('receipt speed', () => {
  it('works out each date\'s day type once, however many trips run on it', () => {
    const days = Array.from({ length: 20 }, (_, i) => `202601${String(i + 5).padStart(2, '0')}`);
    const facts = Array.from({ length: 50 }, () => ({ line: 'L', mode: 'bus', profile: 'bus', days, start: 420, end: 450, runMin: 30, calls: [], legs: [], km: null, stopPlaces: [], fuel: '', seats: null, lowFloor: false, booked: false }));
    calls.n = 0;
    receipt(/** @type {any} */ (facts), { period: null, today: '20260101' });
    expect(calls.n).toBeLessThanOrEqual(days.length);
  });
});
