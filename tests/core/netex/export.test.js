import { describe, it, expect } from 'vitest';
import { sample } from '../../fixtures/sample-project.js';
import { parseERN } from '../../../src/core/ern/parse.js';
import { buildNeTExFiles } from '../../../src/core/netex/export.js';

const base = {
  codespace: 'TST',
  deliveryName: 'Testprosjekt',
  orgs: [], // the sample's #SEK names are used (organisations not in the project copy)
  timestamp: '2026-01-01T00:00:00',
};

describe('buildNeTExFiles', () => {
  it('skips a route with no periods instead of failing', () => {
    const empty = parseERN('#RUT;-1;30;Tom rute;;1;\r\n');
    const files = buildNeTExFiles({ ...base, routes: [{ code: '30', rs: empty }] });
    expect(files).toHaveLength(1);
    expect(files[0].xml).toContain('<PublicationDelivery');
  });

  const nsrRoute = () => parseERN([
    '#RUT;-1;50;Jernbanetorget - Oslo bussterminal;;1;', '#PER;P;20260101;20260131;;;', '#TAB;0;;;;', '#TUR;0;D;0;0;0;0',
    '#TRL;0;NSR:Quay:7203;Jernbanetorget;34;0;-1;-1;34;-1', '#TRC;0;0700;0;0;0;0;0',
    '#TRL;1;-1;Uten ID;34;0;-1;-1;34;-1', '#TRC;0;0705;0;0;0;0;0',
    '#TRL;2;NSR:Quay:11972;Oslo bussterminal;34;0;-1;-1;34;-1', '#TRC;0;0710;0;0;0;0;0',
  ].join('\r\n') + '\r\n');

  it('refers to NSR Quays directly', () => {
    const [shared, line] = buildNeTExFiles({ ...base, routes: [{ code: '50', rs: nsrRoute() }] });
    expect(shared.xml).toContain('<ScheduledStopPoint id="TST:ScheduledStopPoint:NSR-Quay-7203" version="1">');
    expect(shared.xml).toContain('<QuayRef ref="NSR:Quay:7203"/>');
    expect(shared.xml).toContain('<QuayRef ref="NSR:Quay:11972"/>');
    expect(line.xml).toContain('<ScheduledStopPointRef ref="TST:ScheduledStopPoint:NSR-Quay-7203"/>');
  });

  it('leaves out rows without a stop ID', () => {
    const all = buildNeTExFiles({ ...base, routes: [{ code: '50', rs: nsrRoute() }] }).map((f) => f.xml).join('\n');
    expect(all).not.toContain('Uten ID');
    expect(all.match(/<ScheduledStopPoint id=/g)).toHaveLength(2);
    expect(all).not.toMatch(/ScheduledStopPoint:(null|undefined|-1)?"/);
  });

  it('writes no ServiceLinks', () => {
    const all = buildNeTExFiles({ ...base, routes: sample.routes.map(({ code, text }) => ({ code, rs: parseERN(text) })) }).map((f) => f.xml).join('\n');
    expect(all).not.toContain('ServiceLink');
    expect(all).not.toContain('linksInSequence');
  });

  it('does not write a stops file', () => {
    const files = buildNeTExFiles({ ...base, routes: [{ code: '20', rs: parseERN(sample.routes[1].text) }] });
    expect(files.map((f) => f.name)).not.toContain('_stops.xml');
  });

  it('upper-cases the codespace in file names', () => {
    const files = buildNeTExFiles({ ...base, codespace: 'abc', routes: [{ code: '20', rs: parseERN(sample.routes[1].text) }] });
    expect(files.map((f) => f.name)).toEqual(['_ABC-shared.xml', 'ABC-Line-20.xml']);
  });
});
