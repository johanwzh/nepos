import { describe, it, expect } from 'vitest';
import { parseERN } from '../../src/core/ern/parse.js';
import { serializeERN } from '../../src/core/ern/serialize.js';
import { checkRouteFile } from '../../src/core/integrity/check.js';
import { routeSummary } from '../../src/ui/route-summary.js';
import { buildNeTExFiles } from '../../src/core/netex/export.js';

const CAL = 'cccccccc-0000-4000-8000-0000000000c1';
const calendars = [{ id: CAL, name: 'Uke 20', ranges: /** @type {[string, string][]} */ ([['20270517', '20270523']]) }];
const file = (/** @type {string[]} */ extra = []) => [
  '#LEV;T;TST', '#RUT;-1;7;A - B;;1;', '#MOD;bus;localBus', '#BRA;brand-1', ...extra,
  '#SEK;TST:Authority:1;F;1;0;0;0', '#SEK;TST:Operator:1;B;0;1;0;0', '#CUR;neposcoin;1',
  '#TRA;A - B', '#UID;aaaaaaaa-0000-4000-8000-0000000000a1', '#PER;;;;;;', `#KAL;${CAL}`, '#TAB;0;;;;',
  '#TUR;0;D;0;0;0;0', '#UID;5f0c2e1a-1111-4aaa-8bbb-000000000001',
  '#TRL;0;NSR:Quay:1;A;34;0;-1;-1;34;-1', '#TRC;0;0800;0;0;0;0;0',
  '#TRL;1;NSR:Quay:2;B;34;0;-1;-1;34;-1', '#TRC;0;0810;0;0;0;0;0',
].join('\r\n') + '\r\n';
const save = (/** @type {any} */ rs) => serializeERN(rs, 'r', { delivery: { name: 'T', codespace: 'TST' } });

describe('line flags #EKS and #OFF', () => {
  it('defaults to exported and public when the records are missing', () => {
    const rs = parseERN(file());
    expect(rs.exported).toBe(true);
    expect(rs.isPublic).toBe(true);
    expect(checkRouteFile(file()).status).not.toBe('damaged');
  });

  it('reads 0 as no', () => {
    const rs = parseERN(file(['#EKS;0', '#OFF;0']));
    expect(rs.exported).toBe(false);
    expect(rs.isPublic).toBe(false);
  });

  it('always writes both records right after #BRA, and keeps 0 on a round trip', () => {
    const lines = save(parseERN(file())).split('\r\n');
    const at = lines.indexOf('#BRA;brand-1');
    expect(lines.slice(at + 1, at + 3)).toEqual(['#EKS;1', '#OFF;1']);
    expect(save(parseERN(file(['#EKS;0', '#OFF;1'])))).toContain('#EKS;0\r\n#OFF;1');
  });

  it('marks other values as damaged', () => {
    const r = checkRouteFile(file(['#EKS;ja']));
    expect(r.status).toBe('damaged');
    expect(r.issues.map((/** @type {any} */ i) => i.code)).toContain('invalid-flag');
  });

  it('gives the flags, calendars and organisations in the summary', () => {
    const s = routeSummary(file(['#EKS;0']));
    expect(s.exported).toBe(false);
    expect(s.isPublic).toBe(true);
    expect(s.calendarIds).toEqual([CAL]);
    expect(s.orgIds).toEqual(['TST:Authority:1', 'TST:Operator:1']);
  });

  it('marks a line that is not public as restricted in NeTEx', () => {
    const build = (/** @type {string} */ text) => buildNeTExFiles({ codespace: 'TST', deliveryName: 'T', routes: [{ code: 'r', rs: parseERN(text) }], orgs: [], brandings: [], calendars, timestamp: '2026-10-14T00:00:00' })[1].xml;
    const restricted = build(file(['#OFF;0']));
    expect(restricted).toMatch(/<Line [^>]*publication="restricted"/);
    expect(restricted.match(/<ServiceJourney [^>]*publication="restricted"/g)).toHaveLength(1);
    expect(restricted).toMatch(/<DatedServiceJourney [^>]*publication="restricted"/);
    expect(build(file())).not.toContain('publication=');
  });
});
