import { describe, it, expect } from 'vitest';
import { parseERN } from '../../../src/core/ern/parse.js';
import { serializeERN, UUID_PATTERN } from '../../../src/core/ern/serialize.js';
import { checkRouteFile } from '../../../src/core/integrity/check.js';
import { routeSummary } from '../../../src/ui/route-summary.js';

const U1 = '5f0c2e1a-1111-4aaa-8bbb-000000000001';
const file = (extra = {}) => [
  '#LEV;Test;TST',
  `#RUT;${extra.priv ?? '1008'};X20;Oslo - Gol;;${extra.ern ?? '13'};`,
  ...(extra.mod === null ? [] : [extra.mod ?? '#MOD;bus;expressBus']),
  '#BRA;TST:Branding:aaaa',
  '#SEK;NOG:Operator:x;Buss AS;0;1;0;0', '#CUR;neposcoin;1', '#TRA;gammel', '#PER;P;20260101;20260630;;;', '#TAB;0;;;;',
  '#TUR;0;D;0;0;0;0', `#UID;${U1}`, '#TUR;1;D;0;0;0;0',
  '#TRL;0;NSR:Quay:1;A;34;0;-1;-1;34;-1', '#TRC;0;0700;0;0;0;0;0', '#TRC;1;0800;0;0;0;0;0',
  '#TRL;1;NSR:Quay:2;B;34;0;-1;-1;34;-1', '#TRC;0;0715;0;0;0;0;0', '#TRC;1;0815;0;0;0;0;0',
].join('\r\n') + '\r\n';
const save = (/** @type {any} */ rs) => serializeERN(rs, 'r1', { delivery: { name: 'Test', codespace: 'TST' } });
const grid0 = (/** @type {any} */ rs) => rs.grids[`${rs.periods[0].id}:${rs.directions[0].id}`];

describe('line details in ERN', () => {
  it('reads private code, public code, mode, branding and column IDs', () => {
    const rs = parseERN(file());
    expect([rs.privateCode, rs.publicCode, rs.routeName, rs.mode, rs.submode, rs.brandingId, rs.tra])
      .toEqual(['1008', 'X20', 'Oslo - Gol', 'bus', 'expressBus', 'TST:Branding:aaaa', 'gammel']);
    expect(grid0(rs).cols.map((/** @type {any} */ c) => c.uid)).toEqual([U1, null]);
  });

  it('writes them back, giving a column without an ID a new UUID', () => {
    const out = save(parseERN(file()));
    expect(out).toContain('#RUT;1008;X20;Oslo - Gol;;13;');
    expect(out).toContain('#MOD;bus;expressBus\r\n#BRA;TST:Branding:aaaa\r\n');
    expect(out).toContain('#TRA;gammel\r\n');
    expect(out).toContain(`#TUR;0;D;0;0;0;0\r\n#UID;${U1}\r\n`);
    const second = /#TUR;1;D;0;0;0;0\r\n#UID;([^\r\n]+)\r\n/.exec(out)?.[1];
    expect(second && UUID_PATTERN.test(second)).toBe(true);
    expect(checkRouteFile(out).status).toBe('ok');
  });

  it('writes -1 for an empty private code and no #BRA without a branding', () => {
    const rs = parseERN(file({ priv: '-1' }));
    rs.brandingId = '';
    const out = save(rs);
    expect(out).toContain('#RUT;-1;X20;');
    expect(out).not.toContain('#BRA');
  });

  it('derives the mode from the ERN code when there is no #MOD, and keeps that code', () => {
    const rs = parseERN(file({ mod: null, ern: '15' }));
    expect([rs.mode, rs.submode, rs.transportMode]).toEqual(['bus', 'airportLinkBus', 15]);
    const out = save(rs);
    expect(out).toContain(';;15;');
    expect(out).toContain('#MOD;bus;airportLinkBus');
    expect(checkRouteFile(file({ mod: null, ern: '15' })).status).toBe('ok');
  });

  it('keeps the ERN code in step when the mode changes, also for modes without an ERN code', () => {
    const rs = parseERN(file());
    rs.mode = 'cableway'; rs.submode = 'telecabin';
    const out = save(rs);
    expect(out).toContain('#RUT;1008;X20;Oslo - Gol;;0;');
    const back = parseERN(out);
    expect([back.mode, back.submode, back.transportMode]).toEqual(['cableway', 'telecabin', 0]);
  });

  it('gives a copied column (same UUID twice) a new UUID on save', () => {
    const rs = parseERN(file());
    grid0(rs).cols[1].uid = U1;
    const ids = [...save(rs).matchAll(/#UID;([^\r\n]+)/g)].map((m) => m[1]);
    expect(ids[0]).toBe(U1);
    expect(ids[1]).not.toBe(U1);
  });

  it('reports a #UID that does not follow a #TUR as out of order', () => {
    const bad = file().replace('#TRA;gammel\r\n', `#TRA;gammel\r\n#UID;${U1}\r\n`);
    expect(checkRouteFile(bad).status).toBe('damaged');
  });

  it('summarises a route for the list without a full parse', () => {
    expect(routeSummary(file())).toEqual({ name: 'Oslo - Gol', publicCode: 'X20', mode: 'bus', submode: 'expressBus', brandingId: 'TST:Branding:aaaa' });
  });
});

describe('an invalid column ID', () => {
  it('is replaced on save without the file counting as damaged', () => {
    const text = file().replace(`#UID;${U1}`, '#UID;not-a-uuid');
    expect(checkRouteFile(text).status).toBe('ok');
    expect(save(parseERN(text))).not.toContain('not-a-uuid');
  });
});
