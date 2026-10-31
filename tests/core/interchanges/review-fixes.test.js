// Knutepunkt, final review 2026-10-31: the exported references never dangle, every variant keeps its promise, a feeder
// moving quay is a change, copies carry no approved link, past midnight both ways, a trip ending at the hub waits for
// nothing, and a line's trips are read once while it does not change.
import { describe, it, expect } from 'vitest';
import { parseERN } from '../../../src/core/ern/parse.js';
import { buildNeTExFiles } from '../../../src/core/netex/export.js';
import { lineTrips } from '../../../src/core/interchanges/trips.js';
import { candidates } from '../../../src/core/interchanges/match.js';
import { proposals } from '../../../src/core/interchanges/proposals.js';
import { newHub } from '../../../src/core/interchanges/hub.js';
import { addPeriod, duplicateTableSet, newRouteState } from '../../../src/ui/route-state.js';

const CAL = [{ id: 'h1', name: 'Uke', ranges: /** @type {[string, string][]} */ ([['20260105', '20260111']]) }];
const OUR = '5f0c2e1a-1111-4aaa-8bbb-00000000000a', FEED = '5f0c2e1a-1111-4aaa-8bbb-00000000000f';
const ours = (/** @type {string[]} */ extra = []) => parseERN(['#LEV;Test;TST', '#RUT;-1;1;Hub - C;;6;', '#TRA;Fram', '#PER;;;;;;', '#KAL;h1', '#TAB;0;;;;',
  '#TUR;0;D;0;0;0;0', `#UID;${OUR}`, '#TRL;0;NSR:Quay:2;Hub;0;-1;-1;-1;0;-1', '#TRC;0;1000;0;0;0;0;0', '#TRL;1;NSR:Quay:3;C;0;-1;-1;-1;0;-1', '#TRC;0;1030;0;0;0;0;0',
  '#KNP;0;NSR:Quay:2;NSR:StopPlace:2;;2;15;5;0;;;;;;', `#KNL;0;0;F;${FEED};NSR:Quay:2;592;x`, ...extra].join('\r\n') + '\r\n');
const feeder = (/** @type {string} */ day = 'D', /** @type {string[]} */ extra = []) => parseERN(['#LEV;Test;TST', '#RUT;-1;2;A - Hub;;6;', '#TRA;Fram', '#PER;;;;;;', '#KAL;h1', '#TAB;0;;;;',
  `#TUR;0;${day};0;0;0;0`, `#UID;${FEED}`, '#TRL;0;NSR:Quay:1;A;0;-1;-1;-1;0;-1', '#TRC;0;0900;0;0;0;0;0', '#TRL;1;NSR:Quay:2;Hub;0;-1;-1;-1;0;-1', '#TRC;0;0952;0;0;0;0;0',
  '#TRL;2;NSR:Quay:4;D;0;-1;-1;-1;0;-1', '#TRC;0;1010;0;0;0;0;0', ...extra].join('\r\n') + '\r\n');
const build = (/** @type {any} */ o, /** @type {any} */ f) => {
  const files = buildNeTExFiles({ codespace: 'TST', deliveryName: 'T', routes: [{ code: 'OUR', rs: o }, { code: 'F', rs: f }], orgs: [], brandings: [], calendars: CAL, timestamp: '2026-10-31T00:00:00' });
  const our = files.find((x) => x.name === 'TST-Line-OUR.xml')?.xml ?? '';
  return { ixs: our.match(/<ServiceJourneyInterchange [\s\S]*?<\/ServiceJourneyInterchange>/g) ?? [], all: files.map((x) => x.xml).join('\n') };
};
const written = (/** @type {string} */ all) => new Set([...all.matchAll(/<ServiceJourney id="([^"]+)"/g)].map((m) => m[1]));
const refs = (/** @type {string} */ ix) => [...ix.matchAll(/(?:From|To)JourneyRef ref="([^"]+)"/g)].map((m) => m[1]);

describe('final review fixes', () => {
  it('I1: a feeder trip that runs on no day is not referred to (it is not in the delivery)', () => {
    const { ixs, all } = build(ours(), feeder('')); // no day code: no days
    const sj = written(all);
    for (const ix of ixs) for (const r of refs(ix)) expect(sj.has(r)).toBe(true);
    expect(ixs).toEqual([]);
  });

  it('I2: every variant that calls at the hub gets the interchange, on the days the two share', () => {
    // The feeder does not call at D on the 7th: two ServiceJourneys, both arrive at the hub
    const { ixs, all } = build(ours(), feeder('D', ['#UNT;0;2;20260107;16384;20260107;16384;0;0;']));
    expect(ixs).toHaveLength(2);
    const sj = written(all);
    const to = new Set(ixs.map((ix) => refs(ix)[0]));
    expect(to.size).toBe(2);
    for (const ix of ixs) for (const r of refs(ix)) expect(sj.has(r)).toBe(true);
  });

  it('I3: a feeder now at another quay of the same StopPlace is changed, not unchanged', () => {
    const QI = new Map([['NSR:Quay:2', { stopPlaceId: 'NSR:StopPlace:2' }], ['NSR:Quay:22', { stopPlaceId: 'NSR:StopPlace:2' }]]);
    const o = ours();
    const f = parseERN(feeder().constructor ? ['#LEV;Test;TST', '#RUT;-1;2;A - Hub;;6;', '#TRA;Fram', '#PER;;;;;;', '#KAL;h1', '#TAB;0;;;;', '#TUR;0;D;0;0;0;0', `#UID;${FEED}`,
      '#TRL;0;NSR:Quay:1;A;0;-1;-1;-1;0;-1', '#TRC;0;0900;0;0;0;0;0', '#TRL;1;NSR:Quay:22;Hub;0;-1;-1;-1;0;-1', '#TRC;0;0952;0;0;0;0;0'].join('\r\n') + '\r\n' : '');
    const grid = /** @type {any} */ (Object.values(o.grids)[0]);
    const [p] = proposals(grid, 0, [{ code: 'OUR', rs: o }, { code: 'F', rs: f }], { calendars: CAL, quayInfo: QI, ownCode: 'OUR' });
    expect(p.state).toBe('changed');
    expect(p.pick?.stopId).toBe('NSR:Quay:22');
  });

  it('I4: a period or table set copied with its trips carries no approved link', () => {
    const rs = newRouteState('no');
    const key = Object.keys(rs.grids)[0];
    rs.grids[key] = { stops: [{ name: 'Hub', stopId: 'NSR:Quay:2', hub: newHub('NSR:Quay:2', new Map()) }], cols: [{ uid: OUR, dayCode: 'D', cells: [{ time: '1000', dayOffset: 0, hubLink: { line: 'F', trip: FEED } }] }] };
    const per = addPeriod(rs, true);
    const copied = rs.grids[`${per}:${rs.activeSet}`];
    expect(copied.cols[0].cells[0].hubLink).toBeUndefined();
    const set = duplicateTableSet(rs, rs.activeSet, 'Kopi');
    for (const [k, g] of Object.entries(rs.grids)) if (k.endsWith(`:${set}`)) for (const c of /** @type {any} */ (g).cols) expect(c.cells[0].hubLink).toBeUndefined();
  });

  it('I5: our trip past midnight (00:10 +1) meets a feeder whose own day starts after midnight (00:02)', () => {
    const o = parseERN(['#LEV;Test;TST', '#RUT;-1;1;Hub - C;;6;', '#TRA;Fram', '#PER;;;;;;', '#KAL;h1', '#TAB;0;;;;', '#TUR;0;D;0;0;0;0', `#UID;${OUR}`,
      '#TRL;0;NSR:Quay:9;Z;0;-1;-1;-1;0;-1', '#TRC;0;2350;0;0;0;0;0', '#TRL;1;NSR:Quay:2;Hub;0;-1;-1;-1;0;-1', '#TRC;0;0010;1;0;0;0;0', '#TRL;2;NSR:Quay:3;C;0;-1;-1;-1;0;-1', '#TRC;0;0030;1;0;0;0;0'].join('\r\n') + '\r\n');
    const f = parseERN(['#LEV;Test;TST', '#RUT;-1;2;A - Hub;;6;', '#TRA;Fram', '#PER;;;;;;', '#KAL;h1', '#TAB;0;;;;', '#TUR;0;D;0;0;0;0', `#UID;${FEED}`,
      '#TRL;0;NSR:Quay:1;A;0;-1;-1;-1;0;-1', '#TRC;0;2350;0;0;0;0;0', '#TRL;1;NSR:Quay:2;Hub;0;-1;-1;-1;0;-1', '#TRC;0;0002;1;0;0;0;0'].join('\r\n') + '\r\n');
    const early = parseERN(['#LEV;Test;TST', '#RUT;-1;3;B - Hub;;6;', '#TRA;Fram', '#PER;;;;;;', '#KAL;h1', '#TAB;0;;;;', '#TUR;0;D;0;0;0;0', '#UID;5f0c2e1a-1111-4aaa-8bbb-0000000000e1',
      '#TRL;0;NSR:Quay:1;B;0;-1;-1;-1;0;-1', '#TRC;0;0000;0;0;0;0;0', '#TRL;1;NSR:Quay:2;Hub;0;-1;-1;-1;0;-1', '#TRC;0;0004;0;0;0;0;0'].join('\r\n') + '\r\n');
    const trip = lineTrips(o, { calendars: CAL }).find((t) => t.uid === OUR);
    const ctx = { calendars: CAL, quayInfo: new Map(), ownCode: 'OUR' };
    const got = candidates({ ...newHub('NSR:Quay:2', new Map()), stops: ['NSR:Quay:2'] }, 1, /** @type {any} */ (trip), [{ code: 'F', rs: f }, { code: 'E', rs: early }], ctx);
    expect(got.map((c) => [c.line, c.transfer, c.commonDays])).toEqual([['E', 6, 6], ['F', 8, 7]]);
  });

  it('I7: a trip that ends at the hub waits for nobody', () => {
    const o = parseERN(['#LEV;Test;TST', '#RUT;-1;1;C - Hub;;6;', '#TRA;Fram', '#PER;;;;;;', '#KAL;h1', '#TAB;0;;;;', '#TUR;0;D;0;0;0;0', `#UID;${OUR}`,
      '#TRL;0;NSR:Quay:3;C;0;-1;-1;-1;0;-1', '#TRC;0;0950;0;0;0;0;0', '#TRL;1;NSR:Quay:2;Hub;0;-1;-1;-1;0;-1', '#TRC;0;1000;0;0;0;0;0'].join('\r\n') + '\r\n');
    const trip = lineTrips(o, { calendars: CAL }).find((t) => t.uid === OUR);
    expect(candidates({ ...newHub('NSR:Quay:2', new Map()), stops: ['NSR:Quay:2'] }, 1, /** @type {any} */ (trip), [{ code: 'F', rs: feeder() }], { calendars: CAL, quayInfo: new Map(), ownCode: 'OUR' })).toEqual([]);
  });

  it('I6: a line\'s trips are read once while neither it nor the calendars change', () => {
    const f = feeder();
    const a = lineTrips(f, { calendars: CAL });
    expect(lineTrips(f, { calendars: CAL })).toBe(a);
    expect(lineTrips(f, { calendars: [...CAL] })).not.toBe(a);
  });
});
