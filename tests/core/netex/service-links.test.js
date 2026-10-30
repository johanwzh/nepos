// Routed links in the NeTEx export (2.3's writer, kept for the new routing; off while ROUTING is false).
import { describe, it, expect } from 'vitest';
import { parseERN } from '../../../src/core/ern/parse.js';
import { buildNeTExFiles } from '../../../src/core/netex/export.js';
import { encodePolyline } from '../../../src/routing/geometry.js';

const POS = { 'NSR:Quay:1': [10.75, 59.91], 'NSR:Quay:2': [10.76, 59.912], 'NSR:Quay:3': [10.77, 59.915] };
/** A bus line through the stops given (Quay numbers). */
const route = (/** @type {string} */ code, /** @type {number[]} */ stops) => parseERN(['#LEV;T;TST', `#RUT;-1;${code};Linje ${code};;1;`, '#SEK;TST:Authority:1;F;1;0;0;0', '#SEK;TST:Operator:1;B;0;1;0;0', '#DST;1;C;',
  '#TRA;Fram', '#PER;;;;;;', '#KAL;h1', '#TAB;0;;;;', '#TUR;0;D;0;0;0;0',
  ...stops.flatMap((q, i) => [`#TRL;${i};NSR:Quay:${q};Stopp ${q};0;-1;-1;-1;0;-1`, `#TRC;0;07${String(10 + i * 10)};0;0;0;0;0`]), '#DSK;0;0;;1'].join('\r\n') + '\r\n');
/** A saved link between two Quays (numbers), routed through a bend. @returns {[string, import('../../../src/core/link-state.js').SavedLink]} */
const shape = (/** @type {number} */ a, /** @type {number} */ b, status = 'OK') => {
  const from = /** @type {[number, number]} */ (POS[/** @type {keyof typeof POS} */ (`NSR:Quay:${a}`)]), to = /** @type {[number, number]} */ (POS[/** @type {keyof typeof POS} */ (`NSR:Quay:${b}`)]);
  return [`NSR:Quay:${a}|NSR:Quay:${b}|bus`, { polyline: encodePolyline([from, [(from[0] + to[0]) / 2, from[1] + 0.001], to], 6), precision: 6, distanceM: 812.4, status, from, to }];
};
const quayInfo = new Map(Object.entries(POS).map(([id, [lon, lat]]) => [id, { lon, lat }]));
/** @param {{ code: string, rs: any }[]} routes @param {Map<string, any> | undefined} links */
const build = (routes, links) => buildNeTExFiles({ codespace: 'TST', deliveryName: 'T', routes, orgs: [], brandings: [], calendars: [{ id: 'h1', name: 'V', ranges: [['20260101', '20260630']] }], timestamp: 'x', links, quayInfo });

describe('ServiceLinks in the export', () => {
  it('a pattern whose pairs are all routed gets linksInSequence, and the shared file one ServiceLink per pair', () => {
    const [shared, line] = build([{ code: 'r1', rs: route('r1', [1, 2, 3]) }], new Map([shape(1, 2), shape(2, 3)]));
    expect([...shared.xml.matchAll(/<ServiceLink id=/g)]).toHaveLength(2);
    expect(line.xml).toContain('<linksInSequence>');
    expect([...line.xml.matchAll(/<ServiceLinkInJourneyPattern /g)]).toHaveLength(2);
    // A reference into the shared file has no version (as ScheduledStopPointRef): the XSD checks versioned refs within one file
    expect(line.xml).toMatch(/<ServiceLinkRef ref="TST:ServiceLink:[0-9a-f-]+"\/>/);
    expect(line.xml.indexOf('</pointsInSequence>')).toBeLessThan(line.xml.indexOf('<linksInSequence>'));
    expect(shared.xml.indexOf('</scheduledStopPoints>')).toBeLessThan(shared.xml.indexOf('<serviceLinks>'));
    expect(shared.xml.indexOf('</serviceLinks>')).toBeLessThan(shared.xml.indexOf('<stopAssignments>'));
    expect(shared.xml).toContain('<Distance>812</Distance>');
    expect(shared.xml).toContain('<FromPointRef ref="TST:ScheduledStopPoint:NSR-Quay-1" version="1"/>');
  });

  it('a pattern with one missing, unrouted or out-of-date pair gets no links at all', () => {
    const moved = shape(2, 3);
    moved[1] = { ...moved[1], to: [10.78, 59.915] }; // Quay 3 has moved since the link was routed
    for (const links of [new Map([shape(1, 2)]), new Map([shape(1, 2), shape(2, 3, 'NO_PATH')]), new Map([shape(1, 2), moved])]) {
      const [shared, line] = build([{ code: 'r1', rs: route('r1', [1, 2, 3]) }], /** @type {any} */ (links));
      expect(line.xml).not.toContain('linksInSequence');
      expect(shared.xml).not.toContain('<serviceLinks>');
    }
  });

  it('writes a pair shared by two lines once, with the same ID in every export', () => {
    const routes = [{ code: 'r1', rs: route('r1', [1, 2]) }, { code: 'r2', rs: route('r2', [1, 2]) }];
    const a = build(routes, new Map([shape(1, 2)]))[0].xml, b = build(routes, new Map([shape(1, 2)]))[0].xml;
    expect([...a.matchAll(/<ServiceLink id="([^"]+)"/g)]).toHaveLength(1);
    expect(a.match(/<ServiceLink id="([^"]+)"/)?.[1]).toBe(b.match(/<ServiceLink id="([^"]+)"/)?.[1]);
  });

  it('writes the shape as lat lon pairs from Quay to Quay, with a matching count', () => {
    const shared = build([{ code: 'r1', rs: route('r1', [1, 2]) }], new Map([shape(1, 2)]))[0].xml;
    const m = /** @type {RegExpMatchArray} */ (shared.match(/<gml:posList srsDimension="2" count="(\d+)">([^<]+)<\/gml:posList>/));
    const nums = m[2].trim().split(/\s+/).map(Number);
    expect(Number(m[1])).toBe(nums.length / 2);
    expect(nums.slice(0, 2)).toEqual([59.91, 10.75]);
    expect(nums.slice(-2)).toEqual([59.912, 10.76]);
    expect(shared).toMatch(/<gml:LineString gml:id="TST_LinkSequenceProjection_[0-9a-f-]+" srsName="WGS84">/);
  });

  it('without saved links the export is as before: no ServiceLinks, no linksInSequence', () => {
    for (const links of [undefined, new Map()]) {
      const [shared, line] = build([{ code: 'r1', rs: route('r1', [1, 2]) }], links);
      expect(shared.xml).not.toContain('serviceLinks');
      expect(line.xml).not.toContain('linksInSequence');
    }
  });
});
