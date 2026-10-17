// Destinations in NeTEx (destination displays spec): one DestinationDisplay per distinct destination,
// vias as their own displays, a DestinationDisplayRef where a trip's destination starts or changes.
import { describe, it, expect } from 'vitest';
import { parseERN } from '../../../src/core/ern/parse.js';
import { buildNeTExFiles } from '../../../src/core/netex/export.js';

const U = ['5f0c2e1a-1111-4aaa-8bbb-000000000001', '5f0c2e1a-1111-4aaa-8bbb-000000000002', '5f0c2e1a-1111-4aaa-8bbb-000000000003'];
/** Three columns over Alfa, Beta, Delta; the destination lines are given. */
const ern = (/** @type {string[]} */ dests) => [
  '#LEV;Test;TST', '#RUT;-1;1;Alfa - Delta;;6;', '#SEK;TST:Authority:1;Fylket;1;0;0;0', '#SEK;TST:Operator:1;Buss AS;0;1;0;0',
  '#DST;1;Delta;', '#DST;2;Beta;', '#DST;3;Delta;;2',
  '#TRA;Fram', '#PER;;;;;;', '#KAL;h1', '#TAB;0;;;;',
  '#TUR;0;D;0;0;0;0', `#UID;${U[0]}`, '#TUR;1;D;0;0;0;0', `#UID;${U[1]}`, '#TUR;2;D;0;0;0;0', `#UID;${U[2]}`,
  '#TRL;0;NSR:Quay:1;Alfa;0;-1;-1;-1;0;-1', '#TRC;0;0700;0;0;0;0;0', '#TRC;1;0800;0;0;0;0;0', '#TRC;2;0900;0;0;0;0;0',
  '#TRL;1;NSR:Quay:2;Beta;0;-1;-1;-1;0;-1', '#TRC;0;0710;0;0;0;0;0', '#TRC;1;0810;0;0;0;0;0', '#TRC;2;0910;0;0;0;0;0',
  '#TRL;2;NSR:Quay:3;Delta S;0;-1;-1;-1;0;-1', '#TRC;0;0720;0;0;0;0;0', '#TRC;1;0820;0;0;0;0;0', '#TRC;2;0920;0;0;0;0;0',
  ...dests,
].join('\r\n') + '\r\n';
const build = (/** @type {string[]} */ dests) => {
  const files = buildNeTExFiles({ codespace: 'TST', deliveryName: 'T', routes: [{ code: 'r1', rs: parseERN(ern(dests)) }], orgs: [], brandings: [], calendars: [{ id: 'h1', name: 'Vår', ranges: [['20260101', '20260630']] }], timestamp: '2026-10-14T00:00:00' });
  return { shared: files[0].xml, line: files[1].xml };
};
const count = (/** @type {string} */ xml, /** @type {string} */ s) => xml.split(s).length - 1;
/** The JourneyPattern a ServiceJourney uses. */
const jpOf = (/** @type {string} */ line, /** @type {string} */ uid) => {
  const sj = line.slice(line.indexOf(`<ServiceJourney id="TST:ServiceJourney:${uid}"`));
  return /<JourneyPatternRef ref="([^"]+)"/.exec(sj)?.[1];
};

describe('destination displays in NeTEx', () => {
  // Trips 0 and 2: Delta. Trip 1: Delta via Beta, then Delta from Beta.
  const { shared, line } = build(['#DSK;0;0;;1', '#DSK;1;0;;3', '#DSK;1;1;;1', '#DSK;2;0;;1']);

  it('writes each destination once, with a via as its own display', () => {
    expect(count(shared, '<DestinationDisplay ')).toBe(3);
    expect(shared).toContain('<FrontText>Delta</FrontText>');
    expect(shared).toContain('<FrontText>Beta</FrontText>');
    const viaDd = shared.slice(shared.lastIndexOf('<DestinationDisplay ', shared.indexOf('<vias>')));
    expect(viaDd).toMatch(/<FrontText>Delta<\/FrontText>\s*<vias>\s*<Via>\s*<DestinationDisplayRef ref="TST:DestinationDisplay:[^"]+"[^>]*\/>\s*<\/Via>\s*<\/vias>/);
    expect(shared).not.toContain('<FrontText>Delta S</FrontText>'); // the stop name is no longer the display
  });

  it('gives trips with the same stops but other destinations their own pattern, and same ones a shared one', () => {
    expect(jpOf(line, U[0])).toBe(jpOf(line, U[2]));
    expect(jpOf(line, U[1])).not.toBe(jpOf(line, U[0]));
    expect(count(line, '<JourneyPattern ')).toBe(2);
  });

  it('refers to the display where the destination starts and where it changes', () => {
    const jp = line.slice(line.indexOf(`<JourneyPattern id="${jpOf(line, U[1])}"`));
    const points = jp.slice(0, jp.indexOf('</JourneyPattern>')).split('<StopPointInJourneyPattern ').slice(1);
    expect(points.map((p) => p.includes('DestinationDisplayRef'))).toEqual([true, true, false]);
    const plain = line.slice(line.indexOf(`<JourneyPattern id="${jpOf(line, U[0])}"`));
    const pp = plain.slice(0, plain.indexOf('</JourneyPattern>')).split('<StopPointInJourneyPattern ').slice(1);
    expect(pp.map((p) => p.includes('DestinationDisplayRef'))).toEqual([true, false, false]);
  });

  it('puts the display reference right after the stop reference', () => {
    expect(line).toMatch(/<ScheduledStopPointRef ref="[^"]+"\/>\s*<DestinationDisplayRef ref="TST:DestinationDisplay:/);
  });

  it('refers only to displays that exist', () => {
    const ids = new Set([...shared.matchAll(/<DestinationDisplay id="([^"]+)"/g)].map((m) => m[1]));
    for (const m of (line + shared).matchAll(/<DestinationDisplayRef ref="([^"]+)"/g)) expect(ids.has(m[1])).toBe(true);
  });
});

describe('element order (review)', () => {
  const firstPoint = (/** @type {number} */ mask) => {
    const t = ern(['#DSK;0;0;;1', '#DSK;1;0;;1', '#DSK;2;0;;1']).replace('#TRC;0;0700;0;0;0;0;0', `#TRC;0;0700;0;0;0;0;${mask}`);
    const files = buildNeTExFiles({ codespace: 'TST', deliveryName: 'T', routes: [{ code: 'r1', rs: parseERN(t) }], orgs: [], brandings: [], calendars: [{ id: 'h1', name: 'Vår', ranges: [['20260101', '20260630']] }], timestamp: 'x' });
    const line = files[1].xml;
    return line.slice(line.indexOf('<StopPointInJourneyPattern '), line.indexOf('</StopPointInJourneyPattern>'));
  };
  const inOrder = (/** @type {string} */ sp, /** @type {string[]} */ els) => { const at = els.map((s) => sp.indexOf(s)); return at.every((v, i) => v > 0 && (i === 0 || v > at[i - 1])); };

  it('writes ForAlighting before DestinationDisplayRef', () => {
    expect(inOrder(firstPoint(2), ['<ScheduledStopPointRef', '<ForAlighting>', '<DestinationDisplayRef'])).toBe(true);
  });

  it('writes DestinationDisplayRef before RequestStop', () => {
    expect(inOrder(firstPoint(256), ['<ScheduledStopPointRef', '<DestinationDisplayRef', '<RequestStop>'])).toBe(true);
  });
});
