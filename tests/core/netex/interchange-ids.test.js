// Known issue from a review: "duplicate interchange IDs when one trip has two interchanges to the same trip".
import { describe, it, expect } from 'vitest';
import { parseERN } from '../../../src/core/ern/parse.js';
import { buildNeTExFiles } from '../../../src/core/netex/export.js';

describe('interchange IDs', () => {
  it('are unique when one trip has two interchanges to the same trip', () => {
    const t = ['#LEV;T;TST', '#RUT;-1;1;Linje;;6;', '#SEK;TST:Authority:1;F;1;0;0;0', '#SEK;TST:Operator:1;B;0;1;0;0', '#DST;1;C;',
      '#TRA;Fram', '#PER;;;;;;', '#KAL;h1', '#TAB;0;;;;', '#TUR;0;D;0;0;0;0', '#TUR;1;D;0;0;0;0',
      '#TRL;0;NSR:Quay:1;A;0;-1;-1;-1;0;-1', '#TRC;0;0700;0;0;1;0;1024', '#TRC;1;0705;0;0;0;0;0',
      '#TRL;1;NSR:Quay:2;B;0;-1;-1;-1;0;-1', '#TRC;0;0710;0;0;1;0;2048', '#TRC;1;0715;0;0;0;0;0',
      '#TRL;2;NSR:Quay:3;C;0;-1;-1;-1;0;-1', '#TRC;0;0720;0;0;0;0;0', '#TRC;1;0725;0;0;0;0;0', '#DSK;0;0;;1', '#DSK;1;0;;1'].join('\r\n') + '\r\n';
    const xml = buildNeTExFiles({ codespace: 'TST', deliveryName: 'T', routes: [{ code: 'r1', rs: parseERN(t) }], orgs: [], brandings: [], calendars: [{ id: 'h1', name: 'V', ranges: [['20260101', '20260630']] }], timestamp: 'x' })[1].xml;
    const ids = [...xml.matchAll(/<ServiceJourneyInterchange id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });
});
