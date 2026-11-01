// Knutepunkt links in the export (interchanges spec 2026-10-31): a guaranteed ServiceJourneyInterchange in our line's
// file, the feeder (another line of the delivery) as From, our trip as To, written only when both journeys are there.
import { describe, it, expect } from 'vitest';
import { parseERN } from '../../../src/core/ern/parse.js';
import { buildNeTExFiles } from '../../../src/core/netex/export.js';

const CAL = [{ id: 'h1', name: 'Vår', ranges: /** @type {[string, string][]} */ ([['20260105', '20260111']]) }];
const OUR_TRIP = '5f0c2e1a-1111-4aaa-8bbb-00000000000a';
const FEED_TRIP = '5f0c2e1a-1111-4aaa-8bbb-00000000000f';

/** Our line: Hub (NSR:Quay:2) 10:00 → C 10:30, a hub on row 0 and the trip's approved link to F's trip. */
function ours({ walk = 0, link = `F;${FEED_TRIP};NSR:Quay:2;592;2026-10-31T20:00:00.000Z`, hubStop = 'NSR:Quay:2', ourCell = '#TRC;0;1000;0;0;0;0;0' } = {}) {
  return parseERN(['#LEV;Test;TST', '#RUT;-1;1;Hub - C;;6;', '#TRA;Fram', '#PER;;;;;;', '#KAL;h1', '#TAB;0;;;;',
    '#TUR;0;D;0;0;0;0', `#UID;${OUR_TRIP}`,
    '#TRL;0;NSR:Quay:2;Hub;0;-1;-1;-1;0;-1', ourCell,
    '#TRL;1;NSR:Quay:3;C;0;-1;-1;-1;0;-1', '#TRC;0;1030;0;0;0;0;0',
    `#KNP;0;${hubStop};NSR:StopPlace:2;;2;15;5;${walk};;;;;;`, `#KNL;0;0;${link}`].join('\r\n') + '\r\n');
}
/** The feeder: A 09:00 → Hub 09:52 (→ D 10:10 when `on`). */
function feeder(extra = /** @type {string[]} */ ([])) {
  return parseERN(['#LEV;Test;TST', '#RUT;-1;2;A - Hub;;6;', '#TRA;Fram', '#PER;;;;;;', '#KAL;h1', '#TAB;0;;;;',
    '#TUR;0;D;0;0;0;0', `#UID;${FEED_TRIP}`,
    '#TRL;0;NSR:Quay:1;A;0;-1;-1;-1;0;-1', '#TRC;0;0900;0;0;0;0;0',
    '#TRL;1;NSR:Quay:2;Hub;0;-1;-1;-1;0;-1', '#TRC;0;0952;0;0;0;0;0',
    '#TRL;2;NSR:Quay:4;D;0;-1;-1;-1;0;-1', '#TRC;0;1010;0;0;0;0;0', ...extra].join('\r\n') + '\r\n');
}
/** @param {{ code: string, rs: any }[]} routes */
const build = (routes) => {
  const files = buildNeTExFiles({ codespace: 'TST', deliveryName: 'T', routes, orgs: [], brandings: [], calendars: CAL, timestamp: '2026-10-31T00:00:00' });
  return { our: files.find((f) => f.name === 'TST-Line-OUR.xml')?.xml ?? '', all: files.map((f) => f.xml).join('\n') };
};
const ixs = (/** @type {string} */ xml) => xml.match(/<ServiceJourneyInterchange [\s\S]*?<\/ServiceJourneyInterchange>/g) ?? [];

describe('Knutepunkt links in the export', () => {
  it('the interchange is written in our line file with the feeder as From', () => {
    const { our } = build([{ code: 'OUR', rs: ours() }, { code: 'F', rs: feeder() }]);
    const [ix] = ixs(our);
    expect(ixs(our)).toHaveLength(1);
    // the feeder's journey is in another line's file: no version, so the XSD's Journey_KeyRef (ref + version, within
    // one file) does not apply to it (Antu, user 2026-11-01); our own journey is in this file and keeps its version
    expect(ix).toContain(`<FromJourneyRef ref="TST:ServiceJourney:${FEED_TRIP}"/>`);
    expect(ix).toContain(`<ToJourneyRef ref="TST:ServiceJourney:${OUR_TRIP}" version="1"/>`);
    expect(ix).toContain('<FromPointRef ref="TST:ScheduledStopPoint:NSR-Quay-2"/>');
    expect(ix).toContain('<Guaranteed>true</Guaranteed>');
    expect(ix).toContain('<MaximumWaitTime>PT5M</MaximumWaitTime>');
  });

  it('its IDs match the ServiceJourneys both line files write', () => {
    const { our, all } = build([{ code: 'OUR', rs: ours() }, { code: 'F', rs: feeder() }]);
    const written = new Set([...all.matchAll(/<ServiceJourney id="([^"]+)"/g)].map((m) => m[1]));
    const refs = [...ixs(our)[0].matchAll(/(?:From|To)JourneyRef ref="([^"]+)"/g)].map((m) => m[1]);
    expect(refs).toHaveLength(2);
    for (const r of refs) expect(written.has(r)).toBe(true);
    const points = new Set([...all.matchAll(/<ScheduledStopPoint id="([^"]+)"/g)].map((m) => m[1]));
    for (const p of [...ixs(our)[0].matchAll(/PointRef ref="([^"]+)"/g)].map((m) => m[1])) expect(points.has(p)).toBe(true);
  });

  it('element order follows the XSD', () => {
    const ix = ixs(build([{ code: 'OUR', rs: ours({ walk: 3 }) }, { code: 'F', rs: feeder() }]).our)[0];
    const order = [...ix.matchAll(/<(\w+)[ >/]/g)].map((m) => m[1]).slice(1);
    expect(order).toEqual(['Guaranteed', 'MinimumTransferTime', 'MaximumWaitTime', 'FromPointRef', 'ToPointRef', 'FromJourneyRef', 'ToJourneyRef']);
  });

  it('MinimumTransferTime only when walk > 0', () => {
    expect(ixs(build([{ code: 'OUR', rs: ours() }, { code: 'F', rs: feeder() }]).our)[0]).not.toContain('MinimumTransferTime');
    expect(ixs(build([{ code: 'OUR', rs: ours({ walk: 3 }) }, { code: 'F', rs: feeder() }]).our)[0]).toContain('<MinimumTransferTime>PT3M</MinimumTransferTime>');
  });

  it('a variant split by a switched-off time: the link refers to the variant that calls at the stop', () => {
    // D is off on the 7th: that day's trip is another ServiceJourney, but it still calls at the hub; the usual one is referred to
    const split = feeder(['#UNT;0;2;20260107;16384;20260107;16384;0;0;']);
    const { our, all } = build([{ code: 'OUR', rs: ours() }, { code: 'F', rs: split }]);
    expect([...all.matchAll(/<ServiceJourney id="([^"]+)"/g)].length).toBe(3);
    expect(ixs(our)[0]).toContain(`<FromJourneyRef ref="TST:ServiceJourney:${FEED_TRIP}"/>`);
    // Off at the hub itself: only the variant that calls there can be referred to, and on that day there is none
    const offAtHub = feeder(['#UNT;0;1;20260105;16384;20260111;16384;0;0;']);
    expect(ixs(build([{ code: 'OUR', rs: ours() }, { code: 'F', rs: offAtHub }]).our)).toEqual([]);
  });

  it('nothing is written when the feeder line is not exported', () => {
    expect(ixs(build([{ code: 'OUR', rs: ours() }]).our)).toEqual([]);
  });

  it('nothing is written for a lost hub or a deleted feeder trip', () => {
    expect(ixs(build([{ code: 'OUR', rs: ours({ hubStop: 'NSR:Quay:99' }) }, { code: 'F', rs: feeder() }]).our)).toEqual([]);
    expect(ixs(build([{ code: 'OUR', rs: ours({ link: `F;5f0c2e1a-1111-4aaa-8bbb-000000000999;NSR:Quay:2;592;x` }) }, { code: 'F', rs: feeder() }]).our)).toEqual([]);
  });

  it('a picked trip without a link writes nothing', () => {
    expect(ixs(build([{ code: 'OUR', rs: ours({ link: ';;;;' }) }, { code: 'F', rs: feeder() }]).our)).toEqual([]);
  });

  it('a feeder that calls at the stop twice: FromVisitNumber says which visit it arrives at (Antu, user 2026-11-01)', () => {
    const loop = parseERN(['#LEV;Test;TST', '#RUT;-1;2;Hub - Hub;;6;', '#TRA;Fram', '#PER;;;;;;', '#KAL;h1', '#TAB;0;;;;',
      '#TUR;0;D;0;0;0;0', `#UID;${FEED_TRIP}`,
      '#TRL;0;NSR:Quay:2;Hub;0;-1;-1;-1;0;-1', '#TRC;0;0850;0;0;0;0;0',
      '#TRL;1;NSR:Quay:1;A;0;-1;-1;-1;0;-1', '#TRC;0;0900;0;0;0;0;0',
      '#TRL;2;NSR:Quay:2;Hub;0;-1;-1;-1;0;-1', '#TRC;0;0952;0;0;0;0;0',
      '#TRL;3;NSR:Quay:4;D;0;-1;-1;-1;0;-1', '#TRC;0;1010;0;0;0;0;0'].join('\r\n') + '\r\n');
    const [ix] = ixs(build([{ code: 'OUR', rs: ours() }, { code: 'F', rs: loop }]).our);
    expect(ix).toMatch(/<FromPointRef ref="TST:ScheduledStopPoint:NSR-Quay-2"\/>\s*<FromVisitNumber>2<\/FromVisitNumber>\s*<ToPointRef /);
    expect(ix).not.toContain('ToVisitNumber');
    // a feeder that calls there once needs no number
    expect(ixs(build([{ code: 'OUR', rs: ours() }, { code: 'F', rs: feeder() }]).our)[0]).not.toContain('VisitNumber');
  });
});
