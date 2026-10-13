import { describe, it, expect } from 'vitest';
import { routeSummary } from '../../src/ui/route-summary.js';

describe('routeSummary', () => {
  it('reads the route name and public code', () => {
    expect(routeSummary('#LEV;X;ABC\r\n#RUT;-1;10;Sentrum - Flyplass;;1;\r\n#TRA;10E\r\n')).toEqual({ name: 'Sentrum - Flyplass', publicCode: '10E' });
  });

  it('copes with missing records', () => {
    expect(routeSummary('')).toEqual({ name: '', publicCode: '' });
  });
});
