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

  it('writes the #CUR rate back exactly as read, even for unknown currencies', () => {
    const text = sample.routes[0].text.replace('#CUR;spd;9', '#CUR;custom_1;2.50');
    expect(serializeERN(parseERN(text), '10', opts)).toContain('#CUR;custom_1;2.50\r\n');
    const spd = sample.routes[0].text.replace('#CUR;spd;9', '#CUR;spd;10');
    expect(serializeERN(parseERN(spd), '10', opts)).toContain('#CUR;spd;10\r\n');
  });
});

describe('serializeERN keeps what it read', () => {
  it('keeps the organisation name from the file when the organisation list does not have it', () => {
    const out = serializeERN(parseERN(sample.routes[1].text), '20', { delivery: sample.delivery, orgs: [] });
    expect(out).toContain('#SEK;3;Kystbuss AS;0;1;0;0\r\n');
  });

  it('writes a price of 0 as 0, not as "no price"', () => {
    const text = sample.routes[1].text.replace('#TRL;1;105;Eikefjord;34;0;-1;', '#TRL;1;105;Eikefjord;34;0;0.000000;');
    expect(serializeERN(parseERN(text), '20', opts)).toContain('#TRL;1;105;Eikefjord;34;0;0.000000;-1;34;-1');
  });
});
