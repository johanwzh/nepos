import { describe, it, expect } from 'vitest';
import { routeSummary } from '../../src/ui/route-summary.js';

describe('routeSummary', () => {
  it('reads the route name and public code', () => {
    // The public code is #RUT field 1 (line header spec §5); without #MOD the mode comes from the ERN code.
    expect(routeSummary('#LEV;X;ABC\r\n#RUT;-1;10E;Sentrum - Flyplass;;1;\r\n#TRA;\r\n')).toEqual({ name: 'Sentrum - Flyplass', publicCode: '10E', mode: 'bus', submode: 'localBus', brandingId: '' });
  });

  it('copes with missing records', () => {
    expect(routeSummary('')).toEqual({ name: '', publicCode: '', mode: '', submode: '', brandingId: '' });
  });
});
