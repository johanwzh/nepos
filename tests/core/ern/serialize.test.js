import { describe, it, expect } from 'vitest';
import { sample } from '../../fixtures/sample-project.js';
import { parseERN } from '../../../src/core/ern/parse.js';
import { serializeERN } from '../../../src/core/ern/serialize.js';

const opts = { delivery: sample.delivery, orgs: sample.orgs };

describe('serializeERN', () => {
  it('replaces semicolons in names so records stay intact', () => {
    const rs = parseERN(sample.routes[0].text);
    rs.routeName = 'Bergen; Florø';
    const firstStop = rs.grids[`${rs.periods[0].id}:${rs.directions[0].id}`].stops[0];
    firstStop.name = 'Bergen; kai 2';
    const out = serializeERN(rs, '10', opts);
    expect(out).toContain('#RUT;-1;10;Bergen, Florø;;6;');
    expect(out).toContain('#TRL;0;101;Bergen, kai 2;');
  });

  it('writes the price back unchanged', () => {
    const out = serializeERN(parseERN(sample.routes[0].text), '10', opts);
    expect(out).toContain('#TRL;1;102;Askvoll;34;0;12.500000;-1;34;-1');
  });

  it('is stable: parse → write → parse → write gives the same text', () => {
    const once = serializeERN(parseERN(sample.routes[0].text), '10', opts);
    const twice = serializeERN(parseERN(once), '10', opts);
    expect(twice).toBe(once);
  });

  it('uses CRLF line endings', () => {
    const out = serializeERN(parseERN(sample.routes[1].text), '20', opts);
    expect(out.endsWith('\r\n')).toBe(true);
    expect(out.replace(/\r\n/g, '')).not.toContain('\n');
  });
});
