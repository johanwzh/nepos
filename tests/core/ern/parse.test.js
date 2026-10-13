import { describe, it, expect } from 'vitest';
import { sample } from '../../fixtures/sample-project.js';
import { parseERN } from '../../../src/core/ern/parse.js';

const route10 = sample.routes[0].text;
const plain = (v) => JSON.parse(JSON.stringify(v));

describe('parseERN', () => {
  it('parses LF-only files the same as CRLF files', () => {
    expect(plain(parseERN(route10.replace(/\r\n/g, '\n')))).toEqual(plain(parseERN(route10)));
  });

  it('ignores blank lines and // comment lines', () => {
    const noisy = route10.replace('#TRA;10\r\n', '#TRA;10\r\n\r\n// a comment\r\n   \r\n');
    expect(plain(parseERN(noisy))).toEqual(plain(parseERN(route10)));
  });

  it('reads bold, separator and price from the Nepos #TRL layout', () => {
    const rs = parseERN(route10);
    const stops = rs.grids[`${rs.periods[0].id}:${rs.directions[0].id}`].stops;
    expect(stops[0]).toMatchObject({ name: 'Bergen', bold: true, sep: false, price: null });
    expect(stops[1]).toMatchObject({ name: 'Askvoll', bold: false, price: 12.5 });
    expect(stops[2]).toMatchObject({ name: 'Florø', sep: true, isDwellArr: true });
  });

  it('names directions in the requested language', () => {
    expect(parseERN(route10, { lang: 'no' }).directions.map((d) => d.name)).toEqual(['Tur', 'Retur']);
    expect(parseERN(route10).directions.map((d) => d.name)).toEqual(['Outbound', 'Return']);
  });

  it('keeps the route currency id', () => {
    expect(parseERN(route10).currency).toBe('spd');
  });
});
