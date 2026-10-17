// The line's note (backlog 32): ERN 2.0 has #KOM as the table's description, which Nepos does not use,
// and #FOT at -1;-1 as a note on the whole table. Nepos writes its line note as #FOT -1;-1 in the
// first table; older files' #KOM is read as the line note and rewritten.
import { describe, it, expect } from 'vitest';
import { parseERN } from '../../../src/core/ern/parse.js';
import { serializeERN } from '../../../src/core/ern/serialize.js';
import { checkRouteFile } from '../../../src/core/integrity/check.js';
import { buildNeTExFiles } from '../../../src/core/netex/export.js';

const OPTS = { delivery: { name: 'T', codespace: 'TST' }, orgs: [] };
const file = (/** @type {string[]} */ extra, /** @type {string[]} */ inTable = []) => [
  '#LEV;T;TST', '#RUT;-1;1;Linje;;6;', '#SEK;-1;;0;0;0;0', '#TRA;Fram', '#UID;5f0c2e1a-1111-4aaa-8bbb-0000000000a1', '#PER;;;;;;', '#KAL;c1', ...extra, '#TAB;0;;;;', '#TUR;0;D;0;0;0;0',
  '#UID;5f0c2e1a-1111-4aaa-8bbb-0000000000b1', '#TRL;0;NSR:Quay:1;A;0;-1;-1;-1;0;-1', '#TRC;0;0700;0;0;0;0;0', '#TRL;1;NSR:Quay:2;B;0;-1;-1;-1;0;-1', '#TRC;0;0710;0;0;0;0;0', ...inTable,
].join('\r\n') + '\r\n';

describe('the line note', () => {
  it('is written as #FOT on the whole table, with its language, and no #KOM', () => {
    const rs = parseERN(file([]));
    rs.kom = 'Bytt i Florø';
    rs.komOther = [{ text: 'Change in Florø', lang: 'eng' }];
    const text = serializeERN(rs, 'r', OPTS);
    expect(text).toContain('#FOT;-1;-1;Bytt i Florø;nob\r\n');
    expect(text).toContain('#FOT;-1;-1;Change in Florø;eng\r\n');
    expect(text).not.toContain('#KOM');
  });

  it('is read back from #FOT -1;-1', () => {
    const rs = parseERN(file([], ['#FOT;-1;-1;Bytt i Florø;nob', '#FOT;-1;-1;Change in Florø;eng']));
    expect(rs.kom).toBe('Bytt i Florø');
    expect(rs.komOther).toEqual([{ text: 'Change in Florø', lang: 'eng' }]);
  });

  it('is read from an older #KOM, which the check marks as outdated, and the save keeps it', () => {
    const old = file(['#KOM;Bytt i Florø']);
    expect(parseERN(old).kom).toBe('Bytt i Florø');
    const r = checkRouteFile(old);
    expect(r.status).toBe('outdated');
    expect(r.issues.map((i) => i.code)).toContain('old-line-note');
    expect(checkRouteFile(serializeERN(parseERN(old), '1', OPTS)).status).toBe('ok');
  });

  it('still becomes the Line\'s Notice in NeTEx', () => {
    const files = buildNeTExFiles({ codespace: 'TST', deliveryName: 'T', routes: [{ code: 'r1', rs: parseERN(file([], ['#FOT;-1;-1;Bytt i Florø;nob'])) }], orgs: [], brandings: [], calendars: [{ id: 'c1', name: 'V', ranges: [['20260101', '20260630']] }], timestamp: 'x' });
    expect(files[1].xml).toContain('<Text>Bytt i Florø</Text>');
  });
});

describe('ScheduledStopPoint', () => {
  it('has no TimingPointStatus', () => {
    const files = buildNeTExFiles({ codespace: 'TST', deliveryName: 'T', routes: [{ code: 'r1', rs: parseERN(file([])) }], orgs: [], brandings: [], calendars: [{ id: 'c1', name: 'V', ranges: [['20260101', '20260630']] }], timestamp: 'x' });
    expect(files[0].xml).toContain('<ScheduledStopPoint ');
    expect(files[0].xml).not.toContain('TimingPointStatus');
  });
});
