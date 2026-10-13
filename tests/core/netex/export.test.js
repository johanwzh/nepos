import { describe, it, expect } from 'vitest';
import { sample } from '../../fixtures/sample-project.js';
import { parseERN } from '../../../src/core/ern/parse.js';
import { buildNeTExFiles } from '../../../src/core/netex/export.js';

const base = {
  codespace: 'TST',
  deliveryName: 'Testprosjekt',
  orgs: sample.orgs,
  stopDb: sample.stopDb,
  timestamp: '2026-01-01T00:00:00',
};

describe('buildNeTExFiles', () => {
  it('skips a route with no periods instead of failing', () => {
    const empty = parseERN('#RUT;-1;30;Tom rute;;1;\r\n');
    const files = buildNeTExFiles({ ...base, routes: [{ code: '30', rs: empty }] });
    expect(files).toHaveLength(1);
    expect(files[0].xml).toContain('<PublicationDelivery');
  });

  it('leaves out stops that are not in the stop database', () => {
    const files = buildNeTExFiles({ ...base, routes: [{ code: '10', rs: parseERN(sample.routes[0].text) }] });
    const all = files.map((f) => f.xml).join('\n');
    expect(all).not.toContain('ScheduledStopPoint:999');
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
