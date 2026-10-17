// Code review 2026-10-17: export faults found in the whole codebase.
import { describe, it, expect } from 'vitest';
import { parseERN } from '../../../src/core/ern/parse.js';
import { buildNeTExFiles } from '../../../src/core/netex/export.js';

const U = ['5f0c2e1a-1111-4aaa-8bbb-000000000001', '5f0c2e1a-1111-4aaa-8bbb-000000000002', '5f0c2e1a-1111-4aaa-8bbb-000000000003'];
/** @param {string[]} rows the #TRL/#TRC part */
const ern = (rows, cols = 2) => [
  '#LEV;Test;TST', '#RUT;-1;X1;A - B;;1;', '#MOD;bus;', '#SEK;TST:Operator:1;Buss AS;0;1;0;0', '#CUR;neposcoin;1', '#TRA;A - B', '#PER;;;;;;', '#KAL;h1', '#TAB;0;;;;',
  ...Array.from({ length: cols }, (_, i) => [`#TUR;${i};D;0;0;0;0`, `#UID;${U[i]}`]).flat(), ...rows,
].join('\r\n') + '\r\n';
const line = (/** @type {string} */ text) => buildNeTExFiles({ codespace: 'TST', deliveryName: 'T', routes: [{ code: 'r1', rs: parseERN(text) }], orgs: [], brandings: [],
  calendars: [{ id: 'h1', name: 'Vår', ranges: [['20260101', '20260630']] }], timestamp: '2026-10-14T00:00:00' })[1].xml;
/** The ServiceJourney of a column. @param {string} xml @param {number} i */
const sj = (xml, i) => { const s = xml.slice(xml.indexOf(`<ServiceJourney id="TST:ServiceJourney:${U[i]}"`)); return s.slice(0, s.indexOf('</ServiceJourney>')); };

describe('export (code review 2026-10-17)', () => {
  it('gives every trip its own passing times, also when trips share a journey pattern', () => {
    const xml = line(ern(['#TRL;0;NSR:Quay:1;A;34;0;-1;-1;34;-1', '#TRC;0;0800;0;0;0;0;0', '#TRC;1;0900;0;0;0;0;0',
      '#TRL;1;NSR:Quay:2;B;34;0;-1;-1;34;-1', '#TRC;0;0830;0;0;0;0;0', '#TRC;1;0930;0;0;0;0;0']));
    expect([...sj(xml, 1).matchAll(/<DepartureTime>([^<]+)</g)].map((m) => m[1])).toEqual(['09:00:00', '09:30:00']);
  });

  it('gives trips with different boarding rules on the same stops their own journey pattern', () => {
    // column 1 is alighting only at B (mask 1 = a)
    const xml = line(ern(['#TRL;0;NSR:Quay:1;A;34;0;-1;-1;34;-1', '#TRC;0;0800;0;0;0;0;0', '#TRC;1;0900;0;0;0;0;0',
      '#TRL;1;NSR:Quay:2;B;34;0;-1;-1;34;-1', '#TRC;0;0830;0;0;0;0;0', '#TRC;1;0930;0;0;0;0;1']));
    const jp = (/** @type {string} */ s) => /<JourneyPatternRef ref="([^"]+)"/.exec(s)?.[1];
    expect(jp(sj(xml, 0))).not.toBe(jp(sj(xml, 1)));
  });

  it('gives two interchanges between the same two trips at different stops different IDs', () => {
    // column 0 → column 1 at A (row 0) and at B (row 1): mask 0x400 = guaranteed, dx = 1, dy = 0
    const xml = line(ern(['#TRL;0;NSR:Quay:1;A;34;0;-1;-1;34;-1', '#TRC;0;0800;0;0;1;0;1024', '#TRC;1;0805;0;0;0;0;0',
      '#TRL;1;NSR:Quay:2;B;34;0;-1;-1;34;-1', '#TRC;0;0830;0;0;1;0;1024', '#TRC;1;0835;0;0;0;0;0']));
    const ids = [...xml.matchAll(/<ServiceJourneyInterchange id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });
});
