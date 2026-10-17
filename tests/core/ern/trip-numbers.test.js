// The trip-number row (spreadsheet tools spec, 2026-10-17): ERN #TTL (the row, once per table) and
// #TTC (a column's number; flags bit 6 = train number for rail, bit 7 = trip number otherwise).
// NeTEx: the ServiceJourney's PrivateCode.
import { describe, it, expect } from 'vitest';
import { parseERN } from '../../../src/core/ern/parse.js';
import { serializeERN } from '../../../src/core/ern/serialize.js';
import { buildNeTExFiles } from '../../../src/core/netex/export.js';
import { checkRouteFile } from '../../../src/core/integrity/check.js';

const U = ['5f0c2e1a-1111-4aaa-8bbb-000000000001', '5f0c2e1a-1111-4aaa-8bbb-000000000002'];
const ERN = (/** @type {string} */ mode, /** @type {string[]} */ extra = []) => [
  '#LEV;Test;TST', '#RUT;-1;X1;A - B;;1;', `#MOD;${mode};`, '#SEK;TST:Operator:1;Buss AS;0;1;0;0', '#CUR;neposcoin;1', '#TRA;A - B', '#PER;;;;;;', '#KAL;h1', '#TAB;0;;;;',
  '#TUR;0;D;0;0;0;0', `#UID;${U[0]}`, '#TUR;1;D;0;0;0;0', `#UID;${U[1]}`, ...extra,
  '#TRL;0;NSR:Quay:1;A;34;0;-1;-1;34;-1', '#TRC;0;0700;0;0;0;0;0', '#TRC;1;0800;0;0;0;0;0',
  '#TRL;1;NSR:Quay:2;B;34;0;-1;-1;34;-1', '#TRC;0;0715;0;0;0;0;0', '#TRC;1;0815;0;0;0;0;0',
].join('\r\n') + '\r\n';
const OPTS = { delivery: { name: 'T', codespace: 'TST' }, orgs: [] };
const gridOf = (/** @type {any} */ rs) => /** @type {any} */ (Object.values(rs.grids)[0]);

describe('trip numbers', () => {
  it('reads #TTL/#TTC into the row and each column\'s number, and writes them back', () => {
    const rs = parseERN(ERN('bus', ['#TTL;-1;0;;10;Turnummer;0', '#TTC;0;;10;101;128']));
    expect(gridOf(rs).tripRow).toBe(true);
    expect(gridOf(rs).cols.map((/** @type {any} */ c) => c.tripNo)).toEqual(['101', '']);
    const text = serializeERN(rs, 'r', OPTS);
    expect(text).toContain('#TTL;-1;0;;10;Turnummer;0');
    expect(text).toContain('#TTC;0;;10;101;128');
    expect(checkRouteFile(text).status).toBe('ok');
  });

  it('calls it a train number for rail (bit 6)', () => {
    const rs = parseERN(ERN('rail'));
    gridOf(rs).tripRow = true;
    gridOf(rs).cols[1].tripNo = '4401';
    const text = serializeERN(rs, 'r', OPTS);
    expect(text).toContain('#TTL;-1;0;;10;Tognummer;0');
    expect(text).toContain('#TTC;1;;10;4401;64');
  });

  it('writes nothing when the row is not shown', () => {
    expect(serializeERN(parseERN(ERN('bus')), 'r', OPTS)).not.toContain('#TTL');
  });

  it('exports the number as the ServiceJourney\'s PrivateCode, before TransportMode', () => {
    const rs = parseERN(ERN('bus', ['#TTL;-1;0;;10;Turnummer;0', '#TTC;0;;10;101;128']));
    const line = buildNeTExFiles({ codespace: 'TST', deliveryName: 'T', routes: [{ code: 'r1', rs }], orgs: [], brandings: [],
      calendars: [{ id: 'h1', name: 'Vår', ranges: [['20260101', '20260630']] }], timestamp: '2026-10-14T00:00:00' })[1].xml;
    const sj = line.slice(line.indexOf(`<ServiceJourney id="TST:ServiceJourney:${U[0]}"`));
    expect(sj.slice(0, sj.indexOf('</ServiceJourney>'))).toMatch(/<PrivateCode>101<\/PrivateCode>\s*<TransportMode>/);
    const other = line.slice(line.indexOf(`<ServiceJourney id="TST:ServiceJourney:${U[1]}"`));
    expect(other.slice(0, other.indexOf('</ServiceJourney>'))).not.toContain('<PrivateCode>');
  });
});

describe('train numbers (rail): the NeTEx TrainNumber, not PrivateCode (user test 2026-10-17)', () => {
  it('writes a TrainNumber in the TimetableFrame and a TrainNumberRef on the ServiceJourney', () => {
    const rs = parseERN(ERN('rail', ['#TTL;-1;0;;10;Tognummer;0', '#TTC;0;;10;4401;64']));
    const line = buildNeTExFiles({ codespace: 'TST', deliveryName: 'T', routes: [{ code: 'r1', rs }], orgs: [], brandings: [],
      calendars: [{ id: 'h1', name: 'Vår', ranges: [['20260101', '20260630']] }], timestamp: '2026-10-14T00:00:00' })[1].xml;
    const sj = line.slice(line.indexOf(`<ServiceJourney id="TST:ServiceJourney:${U[0]}"`));
    const body = sj.slice(0, sj.indexOf('</ServiceJourney>'));
    expect(body).not.toContain('<PrivateCode>');
    const ref = /<TrainNumberRef ref="([^"]+)"/.exec(body)?.[1];
    expect(ref).toMatch(/^TST:TrainNumber:/);
    expect(body.indexOf('<trainNumbers>')).toBeLessThan(body.indexOf('<passingTimes>'));
    expect(line).toMatch(new RegExp(`<TrainNumber id="${ref}" version="1">\\s*<ForAdvertisement>4401</ForAdvertisement>`));
    expect(line.indexOf('<trainNumbers>', line.indexOf('</vehicleJourneys>'))).toBeGreaterThan(0); // in the TimetableFrame, after the journeys
  });
});

describe('loose ends (2026-10-17)', () => {
  it('reads only the trip-number row\'s cells, not those of other info rows', () => {
    const rs = parseERN(ERN('bus', ['#TTL;3;0;;10;Info;0', '#TTC;0;;10;x;0', '#TTL;-1;0;;10;Turnummer;0', '#TTC;1;;10;202;128']));
    expect(gridOf(rs).cols.map((/** @type {any} */ c) => c.tripNo)).toEqual(['', '202']);
  });
});
