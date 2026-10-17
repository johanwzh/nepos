import { describe, it, expect } from 'vitest';
import { sample } from '../../fixtures/sample-project.js';
import { parseERN } from '../../../src/core/ern/parse.js';
import { serializeERN } from '../../../src/core/ern/serialize.js';
import { checkRouteFile } from '../../../src/core/integrity/check.js';

// Each case is a file Nepos would change or lose data from on save. All must be "damaged",
// with the line of the record that would be lost.
const nepos2 = serializeERN(parseERN(sample.routes[1].text), '20', { delivery: { name: 'Test', codespace: 'TST' }, orgs: sample.orgs });
const lost = (text) => checkRouteFile(text).issues.filter((i) => i.code === 'lost-on-save');

describe('integrity check: data a save would lose', () => {
  it('keeps passing a file Nepos 2 wrote', () => {
    expect(checkRouteFile(nepos2).status).toBe('ok');
  });

  it('flags a return table (#TAB;1): Nepos 2 writes one #TAB;0 per period', () => {
    const text = nepos2.replace('#TAB;0;;;;\r\n#TUR;0;DX67', '#TAB;1;;;;\r\n#TUR;0;DX67');
    expect(lost(text).map((i) => i.line)).toContain(11);
  });

  it('flags a second outbound table in the same period (save would drop one)', () => {
    const text = nepos2.replace('#TAB;0;;;;\r\n', '#TAB;0;;;;\r\n#TUR;0;D;0;0;0;0\r\n#TAB;0;;;;\r\n');
    expect(checkRouteFile(text).status).toBe('damaged');
  });

  it('flags a comment with no period to hold it', () => {
    expect(lost('#LEV;X;TST\r\n#RUT;-1;30;Ny;;1;\r\n#KOM;Behold meg\r\n').map((i) => i.line)).toEqual([3]);
  });

  it('flags fields Nepos rewrites as constants', () => {
    // (#PER fields are not kept on purpose: the period's days come from #KAL — structure spec §4)
    expect(lost(nepos2.replace('#TAB;0;;;;', '#TAB;0;Km;Sone;Kr')).length).toBe(1);
    expect(lost(nepos2.replace('#TUR;0;DX67;0;0;0;0', '#TUR;0;DX67;1;0;0;0')).length).toBe(1);
    expect(lost(nepos2.replace('#TRL;0;104;Florø skysstasjon;0;-1;-1;-1;0;-1', '#TRL;0;104;Florø skysstasjon;0;-1;-1;-1;0;B')).length).toBe(1);
    expect(lost(nepos2.replace('#TRL;0;104;Florø skysstasjon;0;-1;-1;-1;0;-1', '#TRL;0;104;Florø skysstasjon;0;3.5;-1;-1;0;-1')).length).toBe(1);
    expect(lost(nepos2.replace('#SEK;3;Kystbuss AS;0;1;0;0', '#SEK;3;Kystbuss AS;0;1;100;0')).length).toBe(1);
  });

  it('keeps an NSR Quay stop ID', () => {
    expect(lost(nepos2.replace('#TRL;0;104;', '#TRL;0;NSR:Quay:7203;'))).toEqual([]);
  });

  it('flags a stop ID the parser cannot keep', () => {
    // 0 means "no stop ID" and is written back as -1
    expect(lost(nepos2.replace('#TRL;0;104;', '#TRL;0;0;')).length).toBe(1);
  });

  it('flags a cell in a column that has no #TUR', () => {
    expect(lost(nepos2.replace('#TRC;0;0700;0;0;0;0;0', '#TRC;0;0700;0;0;0;0;0\r\n#TRC;5;0705;0;0;0;0;0')).length).toBe(1);
  });

  it('flags comment lines, which a save drops', () => {
    expect(lost(nepos2.replace('#TRA;Florø - Eikefjord\r\n', '#TRA;Florø - Eikefjord\r\n// husk dette\r\n')).map((i) => i.line)).toEqual([8]);
  });

  it('does not flag a price written with fewer decimals', () => {
    const text = nepos2.replace('#TRL;1;105;Eikefjord;0;-1;-1;-1;', '#TRL;1;105;Eikefjord;0;-1;-1;12.5;');
    expect(checkRouteFile(text).status).toBe('ok');
  });

  it('does not flag footnotes and exceptions written in a different order', () => {
    const r10 = serializeERN(parseERN(sample.routes[0].text), '10', { delivery: { name: 'Test', codespace: 'TST' }, orgs: sample.orgs });
    const lines = r10.split('\r\n');
    const i = lines.findIndex((l) => l.startsWith('#UNT;1;'));
    const j = lines.findIndex((l) => l.startsWith('#FOT;2;'));
    [lines[i], lines[j]] = [lines[j], lines[i]];
    expect(checkRouteFile(lines.join('\r\n')).status).toBe('ok');
  });
});
