// The export probe (tools/probe-export): clean on Nepos's own export, and it catches what a broken export would get wrong.
import { describe, it, expect } from 'vitest';
import { probeExport } from '../../tools/probe-export/checks.js';
import { unzip } from '../../tools/probe-export/unzip.js';
import { buildNeTExFiles } from '../../src/core/netex/export.js';
import { buildZipCompressed } from '../../src/core/zip.js';
import { parseERN } from '../../src/core/ern/parse.js';
import { encodePolyline } from '../../src/routing/geometry.js';

// A trip from 23:00 that passes midnight, every hour for three hours (an interval block), a note, and an interchange
const text = [
  '#LEV;Test;TST', '#RUT;-1;50;A - C;;1;', '#SEK;NOG:Authority:aaaaaaaaaa1;F;1;0;0;0', '#SEK;NOG:Operator:bbbbbbbbbb2;B;0;1;0;0',
  '#DST;1;C;', '#TRA;A - C', '#PER;;;;;;', '#KAL;cal-1', '#TAB;0;;;;', '#TUR;0;D;0;0;0;0', '#INT;0;60;180', '#TUR;1;6;0;0;0;0',
  '#TRL;0;NSR:Quay:1;A;34;0;-1;-1;34;-1', '#TRC;0;2300;0;0;0;0;0', '#TRC;1;0700;0;0;0;0;0',
  '#TRL;1;NSR:Quay:2;B;34;0;-1;-1;34;-1', '#TRC;0;2340;0;0;1;0;1024', '#TRC;1;0710;0;0;0;0;0',
  '#TRL;2;NSR:Quay:3;C;34;0;-1;-1;34;-1', '#TRC;0;0010;1;0;0;0;0', '#TRC;1;0720;0;0;0;0;0',
  '#FOT;0;1;Stops on signal;nob', '#DSK;0;0;;1',
].join('\r\n') + '\r\n';
/** @type {import('../../src/core/calendars.js').Calendar[]} */
const calendars = [{ id: 'cal-1', name: 'November', ranges: [['20261102', '20261115']] }];
const project = { codespace: 'TST', routes: [{ code: '50', text }], calendars };
const exported = () => new Map(buildNeTExFiles({ codespace: 'TST', deliveryName: 'Test', routes: [{ code: '50', rs: parseERN(text) }], orgs: [], calendars }).map((f) => [f.name, f.xml]));
/** The export with one replacement in the line file. @param {RegExp | string} a @param {string} b */
const broken = (a, b) => {
  const files = exported();
  const name = /** @type {string} */ ([...files.keys()].find((n) => n.includes('-Line-')));
  const xml = /** @type {string} */ (files.get(name));
  const out = xml.replace(a, b);
  expect(out).not.toBe(xml);
  files.set(name, out);
  return files;
};

describe('the export probe', () => {
  it("finds nothing wrong in Nepos's own export, generated trips past midnight included", () => {
    const { errors, stats } = probeExport({ files: exported(), project });
    expect(errors).toEqual([]);
    expect(stats.journeys).toBe(5); // the parent, its three generated trips, the 07:00
    expect(stats.expected).toBe(5);
    expect(stats.startAfterMidnight).toBe(3); // 00:00, 01:00 and 02:00, on +1
    expect(stats.maxDayOffset).toBe(1);
    expect(stats.interchanges).toBe(1);
  });

  it('catches a wrong day offset', () => {
    const { errors } = probeExport({ files: broken('<DepartureDayOffset>1</DepartureDayOffset>', '<DepartureDayOffset>2</DepartureDayOffset>'), project });
    expect(errors.some((e) => /departs .*\+2 in the export/.test(e))).toBe(true);
  });

  it('catches a trip missing a day', () => {
    const { errors } = probeExport({ files: broken(/<DatedServiceJourney [\s\S]*?<\/DatedServiceJourney>/, ''), project });
    expect(errors.some((e) => e.includes('operating days differ — 1 missing'))).toBe(true);
  });

  it('catches a reference to nothing', () => {
    const { errors } = probeExport({ files: broken(/<JourneyPatternRef ref="TST:JourneyPattern:/, '<JourneyPatternRef ref="TST:JourneyPattern:x'), project });
    expect(errors.some((e) => e.startsWith('reference to nothing: TST:JourneyPattern:x'))).toBe(true);
  });

  it('catches a lost note and a lost interchange', () => {
    const { errors } = probeExport({ files: broken(/<NoticeAssignment [\s\S]*?<\/NoticeAssignment>/, ''), project });
    expect(errors.some((e) => e.includes('notes "" in the export, "Stops on signal" in the timetable'))).toBe(true);
    const lost = probeExport({ files: broken(/<ServiceJourneyInterchange [\s\S]*?<\/ServiceJourneyInterchange>/, ''), project });
    expect(lost.errors).toContain('0 interchanges in the export, 1 in the timetables');
  });

  it('reads the zip the app writes', async () => {
    const files = exported();
    const zip = await buildZipCompressed([...files].map(([name, xml]) => ({ name, data: new TextEncoder().encode(xml) })));
    const back = unzip(zip);
    expect([...back.keys()]).toEqual([...files.keys()]);
    expect(new TextDecoder().decode(back.get([...files.keys()][1]))).toBe([...files.values()][1]);
  });
});

describe('the export probe on routed links (2.6)', () => {
  const POS = { 'NSR:Quay:1': [10.75, 59.91], 'NSR:Quay:2': [10.76, 59.912], 'NSR:Quay:3': [10.77, 59.915] };
  const quayInfo = new Map(Object.entries(POS).map(([id, [lon, lat]]) => [id, { lon, lat }]));
  /** @param {string} a @param {string} b */
  const link = (a, b) => {
    const from = POS[/** @type {keyof typeof POS} */ (`NSR:Quay:${a}`)], to = POS[/** @type {keyof typeof POS} */ (`NSR:Quay:${b}`)];
    return [`NSR:Quay:${a}|NSR:Quay:${b}|bus`, { polyline: encodePolyline(/** @type {any} */ ([from, [(from[0] + to[0]) / 2, from[1] + 0.001], to]), 6), precision: 6, distanceM: 812.4, status: 'OK', from, to }];
  };
  const links = new Map([['50', { version: 1, line: '50', links: Object.fromEntries([link('1', '2'), link('2', '3')]), snaps: {} }]]);
  const withLinks = { ...project, links };
  const routed = () => new Map(buildNeTExFiles({ codespace: 'TST', deliveryName: 'Test', routes: [{ code: '50', rs: parseERN(text) }], orgs: [], calendars, links: /** @type {any} */ (links), quayInfo }).map((f) => [f.name, f.xml]));
  /** One replacement in the file whose name matches. @param {RegExp} file @param {RegExp | string} a @param {string} b */
  const edit = (file, a, b) => {
    const files = routed();
    const name = /** @type {string} */ ([...files.keys()].find((n) => file.test(n)));
    const xml = /** @type {string} */ (files.get(name)), out = xml.replace(a, b);
    expect(out).not.toBe(xml);
    files.set(name, out);
    return files;
  };

  it('a routed export is clean, with the links counted', () => {
    const { errors, stats } = probeExport({ files: routed(), project: withLinks });
    expect(errors).toEqual([]);
    expect(stats.links).toBe(2);
    expect(stats.linkKm).toBeCloseTo(1.6, 1);
  });

  it('catches a link that does not start at its stop', () => {
    const { errors } = probeExport({ files: edit(/-shared\.xml$/, /count="3">59\.910000 10\.750000/, 'count="3">59.920000 10.750000'), project: withLinks });
    expect(errors.some((e) => /starts \d+ m from its stop/.test(e))).toBe(true);
  });

  it('catches a Distance that is not the saved one', () => {
    const { errors } = probeExport({ files: edit(/-shared\.xml$/, '<Distance>812</Distance>', '<Distance>900</Distance>'), project: withLinks });
    expect(errors.some((e) => e.includes('Distance 900, saved 812'))).toBe(true);
  });

  it('catches a journey pattern with a gap in its links', () => {
    const { errors } = probeExport({ files: edit(/-Line-/, /<ServiceLinkInJourneyPattern [\s\S]*?<\/ServiceLinkInJourneyPattern>/, ''), project: withLinks });
    expect(errors.some((e) => e.includes('links do not follow its stops'))).toBe(true);
  });
});
