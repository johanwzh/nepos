// Fixes from the user's NeTEx test export (2026-10-18): note assignments before interchanges, destinations
// on a waiting stop's departure row, Routes from all patterns, and a ZIP with dates and compression.
import { describe, it, expect } from 'vitest';
import { parseERN } from '../../src/core/ern/parse.js';
import { serializeERN } from '../../src/core/ern/serialize.js';
import { buildNeTExFiles } from '../../src/core/netex/export.js';
import { buildZip, buildZipCompressed } from '../../src/core/zip.js';

const CAL = [{ id: 'h1', name: 'V', ranges: /** @type {[string, string][]} */ ([['20260105', '20260111']]) }];
const head = ['#LEV;T;TST', '#RUT;-1;1;Linje;;6;', '#SEK;TST:Authority:1;F;1;0;0;0', '#SEK;TST:Operator:1;B;0;1;0;0', '#DST;1;Ceta;', '#DST;2;Beta;', '#TRA;Fram', '#PER;;;;;;', '#KAL;h1', '#TAB;0;;;;'];
const trl = (/** @type {number} */ ri, /** @type {string} */ id, /** @type {string} */ name) => `#TRL;${ri};NSR:Quay:${id};${name};0;-1;-1;-1;0;-1`;
const build = (/** @type {string[]} */ lines) => buildNeTExFiles({ codespace: 'TST', deliveryName: 'T', routes: [{ code: 'r1', rs: parseERN([...head, ...lines].join('\r\n') + '\r\n') }], orgs: [], brandings: [], calendars: CAL, timestamp: 'x' })[1].xml;

describe('note assignments in the TimetableFrame', () => {
  it('come before the interchanges (NeTEx XSD: notices, then interchanges)', () => {
    const xml = build(['#TUR;0;D;0;0;0;0', '#TUR;1;D;0;0;0;0',
      trl(0, '1', 'A'), '#TRC;0;0700;0;0;0;0;0', '#TRC;1;0800;0;0;0;0;0',
      trl(1, '2', 'Beta'), '#TRC;0;0710;0;0;1;0;1024', '#TRC;1;0815;0;0;0;0;0',
      trl(2, '3', 'Ceta'), '#TRC;0;0720;0;0;0;0;0', '#TRC;1;0820;0;0;0;0;0',
      '#FOT;0;-1;Merknad;nob', '#DSK;0;0;;1', '#DSK;1;0;;1']);
    expect(xml).toContain('<journeyInterchanges>');
    expect(xml.indexOf('<noticeAssignments>', xml.indexOf('<TimetableFrame'))).toBeLessThan(xml.indexOf('<journeyInterchanges>'));
  });
});

describe('a destination on a waiting stop (arrival and departure rows)', () => {
  // Rows: A, Beta arrival, Beta departure, Ceta. The change was written on Beta's arrival row.
  const lines = ['#TUR;0;D;0;0;0;0', trl(0, '1', 'A'), '#TRC;0;0700;0;0;0;0;0', trl(1, '2', 'Beta'), '#TRC;0;0710;0;0;0;0;0',
    trl(2, '2', 'Beta'), '#TRC;0;0715;0;0;0;0;0', trl(3, '3', 'Ceta'), '#TRC;0;0720;0;0;0;0;0', '#DSK;0;0;;2', '#DSK;0;1;;1'];

  it('is read onto the departure row', () => {
    const grid = /** @type {any} */ (Object.values(parseERN([...head, ...lines].join('\r\n') + '\r\n').grids)[0]);
    expect(grid.cols[0].dests[1]).toBe(null);
    expect(grid.cols[0].dests[2]).toEqual({ text: 'Ceta', vias: [] });
  });

  it('is saved on the departure row', () => {
    const text = serializeERN(parseERN([...head, ...lines].join('\r\n') + '\r\n'), 'r1', { delivery: { name: 'T', codespace: 'TST' }, orgs: [] });
    expect(text).toContain('#DSK;0;2;;');
    expect(text).not.toContain('#DSK;0;1;;');
  });

  it('is exported on that stop\'s call', () => {
    const xml = build(lines);
    const points = xml.slice(xml.indexOf('<JourneyPattern '), xml.indexOf('</JourneyPattern>')).split('<StopPointInJourneyPattern ').slice(1);
    expect(points.map((p) => p.includes('DestinationDisplayRef'))).toEqual([true, true, false]);
  });
});

describe('a Route\'s points', () => {
  it('cover the stops of all its patterns, in order', () => {
    // Trip 0: Tangen → Horn. Trip 1: Horn → Tangen → Horn (rows: Horn, Tangen, Horn).
    const xml = build(['#TUR;0;D;0;0;0;0', '#TUR;1;D;0;0;0;0',
      trl(0, '7', 'Horn'), '#TRC;1;0800;0;0;0;0;0',
      trl(1, '8', 'Tangen'), '#TRC;0;0700;0;0;0;0;0', '#TRC;1;0815;0;0;0;0;0',
      trl(2, '7', 'Horn'), '#TRC;0;0715;0;0;0;0;0', '#TRC;1;0830;0;0;0;0;0',
      '#DSK;0;1;;1', '#DSK;1;0;;1']);
    const route = xml.slice(xml.indexOf('<Route '), xml.indexOf('</Route>'));
    expect([...route.matchAll(/RoutePoint:([^"]+)"/g)].map((m) => m[1])).toEqual(['NSR-Quay-7', 'NSR-Quay-8', 'NSR-Quay-7']);
  });
});

describe('the ZIP', () => {
  const files = [{ name: 'a.xml', data: new TextEncoder().encode('<x>' + 'abc'.repeat(2000) + '</x>') }];
  const date = new Date(2026, 9, 18, 16, 46, 22); // local time, as DOS stores it

  it('stores the date and time of the export (DOS format)', () => {
    const zip = buildZip(files, { date });
    const time = zip[10] | (zip[11] << 8), day = zip[12] | (zip[13] << 8);
    expect([time >> 11, (time >> 5) & 63, (time & 31) * 2]).toEqual([16, 46, 22]);
    expect([(day >> 9) + 1980, (day >> 5) & 15, day & 31]).toEqual([2026, 10, 18]);
  });

  it('compresses with deflate, and the data comes back the same', async () => {
    const zip = await buildZipCompressed(files, { date });
    expect(zip[8]).toBe(8); // method 8 = deflate
    const size = zip[18] | (zip[19] << 8) | (zip[20] << 16);
    expect(size).toBeLessThan(files[0].data.length / 10);
    const nameLen = zip[26] | (zip[27] << 8);
    const body = zip.slice(30 + nameLen, 30 + nameLen + size);
    const back = new Uint8Array(await new Response(new Blob([body]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    expect(new TextDecoder().decode(back)).toBe(new TextDecoder().decode(files[0].data));
  });
});
