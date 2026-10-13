import { describe, it, expect } from 'vitest';
import { expandDayCode } from '../../../src/core/netex/daycodes.js';

// 2026-06-01 is a Monday.
describe('expandDayCode', () => {
  it('returns 8-character YYYYMMDD strings (regression)', () => {
    for (const d of expandDayCode('D', '20260601', '20260607')) expect(d).toMatch(/^\d{8}$/);
  });

  it('D runs every day, inclusive of both ends', () => {
    expect(expandDayCode('D', '20260601', '20260607')).toHaveLength(7);
  });

  it('DX67 excludes Saturday and Sunday', () => {
    expect(expandDayCode('DX67', '20260601', '20260607'))
      .toEqual(['20260601', '20260602', '20260603', '20260604', '20260605']);
  });

  it('135 gives Monday, Wednesday, Friday', () => {
    expect(expandDayCode('135', '20260601', '20260607')).toEqual(['20260601', '20260603', '20260605']);
  });

  it('is unaffected by the daylight-saving change (29 March 2026)', () => {
    expect(expandDayCode('D', '20260328', '20260330')).toEqual(['20260328', '20260329', '20260330']);
  });
});
