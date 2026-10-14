import { describe, it, expect } from 'vitest';
import { parseERN } from '../../../src/core/ern/parse.js';
import { buildNeTExFiles } from '../../../src/core/netex/export.js';

const CAL = 'cccccccc-0000-4000-8000-0000000000c1';
const calendars = [{ id: CAL, name: 'Uke 20', ranges: /** @type {[string, string][]} */ ([['20270517', '20270523']]) }]; // Mon 17 (holiday) – Sun 23 May 2027
const U = ['5f0c2e1a-1111-4aaa-8bbb-000000000001', '5f0c2e1a-1111-4aaa-8bbb-000000000002'];
const route = (/** @type {string} */ dayCode, extraPeriod = '') => [
  '#LEV;T;TST', '#RUT;-1;7;A - B;;1;', '#MOD;bus;localBus', '#SEK;TST:Authority:1;F;1;0;0;0', '#SEK;TST:Operator:1;B;0;1;0;0', '#CUR;neposcoin;1',
  '#TRA;A - B', '#UID;aaaaaaaa-0000-4000-8000-0000000000a1', '#PER;;;;;;', `#KAL;${CAL}`, '#TAB;0;;;;',
  `#TUR;0;${dayCode};0;0;0;0`, `#UID;${U[0]}`,
  '#TRL;0;NSR:Quay:1;A;34;0;-1;-1;34;-1', '#TRC;0;2350;0;0;0;0;0',
  '#TRL;1;NSR:Quay:2;B;34;0;-1;-1;34;-1', '#TRC;0;0010;1;0;0;0;0',
  extraPeriod,
].filter(Boolean).join('\r\n') + '\r\n';
const build = (/** @type {string} */ text) => buildNeTExFiles({ codespace: 'TST', deliveryName: 'T', routes: [{ code: 'r', rs: parseERN(text) }], orgs: [], brandings: [], calendars, timestamp: '2026-10-14T00:00:00' });

describe('dated service journeys', () => {
  it('writes one DSJ per operating day of the column, on the day the trip starts', () => {
    const [shared, line] = build(route('DX67')).map((f) => f.xml);
    const days = [...line.matchAll(/<OperatingDayRef ref="TST:OperatingDay:([0-9-]+)"\/>/g)].map((m) => m[1]);
    expect(days).toEqual(['2027-05-17', '2027-05-18', '2027-05-19', '2027-05-20', '2027-05-21']);
    expect(line).toContain(`<ServiceJourneyRef ref="TST:ServiceJourney:${U[0]}" version="1"/>`);
    expect(line).not.toContain('<dayTypes>');
    expect(shared).toContain('<OperatingDay id="TST:OperatingDay:2027-05-17" version="1">\n        <CalendarDate>2027-05-17</CalendarDate>\n      </OperatingDay>');
    expect(shared).not.toContain('<DayType ');
    expect(shared).not.toContain('<OperatingPeriod ');
    expect(shared).not.toContain('<DayTypeAssignment ');
  });

  it('leaves holidays out for DXH and gives only holidays for H', () => {
    const dxh = build(route('DX67H'))[1].xml;
    expect(dxh).not.toContain('OperatingDay:2027-05-17');
    expect(build(route('H'))[1].xml.match(/<DatedServiceJourney /g)).toHaveLength(1);
  });

  it('names Route and JourneyPattern after the table set, without DirectionType', () => {
    const line = build(route('D'))[1].xml;
    expect(line).toContain('<Route id="TST:Route:aaaaaaaa-0000-4000-8000-0000000000a1" version="1">');
    expect(line).toMatch(/<JourneyPattern id="TST:JourneyPattern:[0-9a-f-]{36}" version="1">\n        <Name>A - B-1<\/Name>/);
    expect(line).not.toContain('DirectionType');
  });

  it('gives the same IDs in every export, and different IDs to trips in two periods on one calendar', () => {
    expect(build(route('D'))[1].xml).toBe(build(route('D'))[1].xml);
    const two = route('D', ['#PER;;;;;;', `#KAL;${CAL}`, '#TAB;0;;;;', '#TUR;0;D;0;0;0;0', `#UID;${U[1]}`,
      '#TRL;0;NSR:Quay:1;A;34;0;-1;-1;34;-1', '#TRC;0;1200;0;0;0;0;0', '#TRL;1;NSR:Quay:2;B;34;0;-1;-1;34;-1', '#TRC;0;1230;0;0;0;0;0'].join('\r\n'));
    const ids = [...build(two)[1].xml.matchAll(/<DatedServiceJourney id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toHaveLength(14);
    expect(new Set(ids).size).toBe(14);
  });

  it('leaves out a trip with no operating days', () => {
    const line = build(route('S'))[1]?.xml ?? '';
    expect(line).not.toContain('<ServiceJourney ');
  });
});
