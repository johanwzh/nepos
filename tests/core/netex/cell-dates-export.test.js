// Dates on a single time (user 2026-10-17, answer a): a time can be switched off on some of the trip's
// days. The export splits the trip: days with the same stops are one ServiceJourney (the usual one
// keeps the column's ID), and a different set of stops gets its own JourneyPattern.
import { describe, it, expect } from 'vitest';
import { parseERN } from '../../../src/core/ern/parse.js';
import { buildNeTExFiles } from '../../../src/core/netex/export.js';
import { tripVariants } from '../../../src/core/netex/journeys.js';

const U = '5f0c2e1a-1111-4aaa-8bbb-000000000001';
// Monday 5 to Sunday 11 January 2026; the trip runs every day (D)
const CAL = [{ id: 'h1', name: 'Uke', ranges: /** @type {[string, string][]} */ ([['20260105', '20260111']]) }];
const t = (/** @type {string[]} */ extra = []) => [
  '#LEV;T;TST', '#RUT;-1;1;Linje;;6;', '#SEK;TST:Authority:1;F;1;0;0;0', '#SEK;TST:Operator:1;B;0;1;0;0', '#DST;1;Ceta;;2', '#DST;2;Beta;', '#DST;3;Ceta;',
  '#TRA;Fram', '#PER;;;;;;', '#KAL;h1', '#TAB;0;;;;', '#TUR;0;D;0;0;0;0', `#UID;${U}`,
  '#TRL;0;NSR:Quay:1;Alfa;0;-1;-1;-1;0;-1', '#TRC;0;0700;0;0;0;0;0', '#TRL;1;NSR:Quay:2;Beta;0;-1;-1;-1;0;-1', '#TRC;0;0710;0;0;0;0;0',
  '#TRL;2;NSR:Quay:3;Ceta S;0;-1;-1;-1;0;-1', '#TRC;0;0720;0;0;0;0;0', '#DSK;0;0;;1', '#DSK;0;1;;3', ...extra,
].join('\r\n') + '\r\n';
const build = (/** @type {string[]} */ extra = []) => buildNeTExFiles({ codespace: 'TST', deliveryName: 'T', routes: [{ code: 'r1', rs: { ...parseERN(t(extra)), dsj: true } }], orgs: [], brandings: [], calendars: CAL, timestamp: 'x' })[1].xml;
const WEEKEND_OFF = ['#UNT;0;1;20260110;16384;20260111;16384;0;0;'];
const count = (/** @type {string} */ xml, /** @type {string} */ s) => xml.split(s).length - 1;
/** The ServiceJourney with this ID, and the days it runs. */
const sj = (/** @type {string} */ xml, /** @type {string} */ id) => {
  const el = xml.slice(xml.indexOf(`<ServiceJourney id="${id}"`), xml.indexOf('</ServiceJourney>', xml.indexOf(`<ServiceJourney id="${id}"`)));
  return { el, days: [...xml.matchAll(new RegExp(`<ServiceJourneyRef ref="${id}"[^>]*/>\\s*<OperatingDayRef ref="TST:OperatingDay:([^"]+)"`, 'g'))].map((m) => m[1]) };
};
const sjIds = (/** @type {string} */ xml) => [...xml.matchAll(/<ServiceJourney id="([^"]+)"/g)].map((m) => m[1]);

describe('a time switched off on some days', () => {
  it('splits the trip: the usual days keep the column\'s ID, the others get their own journey without that stop', () => {
    const xml = build(WEEKEND_OFF);
    const ids = sjIds(xml);
    expect(ids).toHaveLength(2);
    const main = sj(xml, `TST:ServiceJourney:${U}`);
    expect(main.days).toEqual(['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09']);
    expect(count(main.el, '<TimetabledPassingTime ')).toBe(3);
    const other = sj(xml, /** @type {string} */ (ids.find((i) => !i.endsWith(U))));
    expect(other.days).toEqual(['2026-01-10', '2026-01-11']);
    expect(count(other.el, '<TimetabledPassingTime ')).toBe(2);
    expect(count(xml, '<JourneyPattern ')).toBe(2);
  });

  it('gives the other journey the same ID on every export', () => {
    expect(sjIds(build(WEEKEND_OFF))).toEqual(sjIds(build(WEEKEND_OFF)));
  });

  it('keeps one journey when no time is switched off', () => {
    expect(sjIds(build())).toEqual([`TST:ServiceJourney:${U}`]);
  });

  it('drops the days on which only one stop would be left', () => {
    const xml = build(['#UNT;0;1;20260110;16384;20260110;16384;0;0;', '#UNT;0;2;20260110;16384;20260110;16384;0;0;']);
    const all = sjIds(xml).flatMap((id) => sj(xml, id).days);
    expect(all).not.toContain('2026-01-10');
    expect(all).toContain('2026-01-11');
  });

  it('starts the shorter journey with the destination in effect, and refers to no destination on its last stop', () => {
    const xml = build(WEEKEND_OFF);
    const jps = [...xml.matchAll(/<JourneyPattern id="[^"]+"[\s\S]*?<\/JourneyPattern>/g)].map((m) => m[0]);
    const short = /** @type {string} */ (jps.find((j) => count(j, '<StopPointInJourneyPattern ') === 2));
    const points = short.split('<StopPointInJourneyPattern ').slice(1);
    expect(points[0]).toContain('DestinationDisplayRef');
    expect(points[1]).not.toContain('DestinationDisplayRef');
  });
});

describe('tripVariants', () => {
  it('groups the days by the stops served, the full set first', () => {
    const rs = parseERN(t(WEEKEND_OFF));
    const grid = /** @type {any} */ (Object.values(rs.grids)[0]);
    const v = tripVariants(grid, grid.cols[0], ['20260105', '20260110', '20260111']);
    expect(v.map((x) => [x.main, x.calls.map((c) => c.ri), x.days])).toEqual([
      [true, [0, 1, 2], ['20260105']],
      [false, [0, 2], ['20260110', '20260111']],
    ]);
  });
});
