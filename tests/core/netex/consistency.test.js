import { describe, it, expect } from 'vitest';
import { parseERN } from '../../../src/core/ern/parse.js';
import { buildNeTExFiles } from '../../../src/core/netex/export.js';

// One table set, one period on a January calendar (timetable structure spec §6).
const calendars = [{ id: 'jan', name: 'Januar', ranges: /** @type {[string, string][]} */ ([['20260101', '20260131']]) }];
const head = ['#RUT;-1;70;Test;;1;', '#TRA;Test', '#PER;;;;;;', '#KAL;jan', '#TAB;0;;;;'];
/** @param {string[]} lines */
const build = (lines) => buildNeTExFiles({
  codespace: 'TST', deliveryName: 'Test', orgs: [], calendars, timestamp: '2026-01-01T00:00:00',
  routes: [{ code: '70', rs: parseERN([...head, '#TUR;0;D;0;0;0;0', '#TUR;1;D;0;0;0;0', ...lines].join('\r\n') + '\r\n') }],
});

/** Every ref to a stop point, destination display or route point must be defined in the files. */
function undefinedRefs(/** @type {{ xml: string }[]} */ files) {
  const all = files.map((f) => f.xml).join('\n');
  const ids = new Set([...all.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
  return [...all.matchAll(/ref="(TST:(?:ScheduledStopPoint|DestinationDisplay|RoutePoint|ServiceJourney|JourneyPattern|OperatingDay|Route):[^"]+)"/g)]
    .map((m) => m[1]).filter((ref) => !ids.has(ref));
}

describe('NeTEx references', () => {
  it('defines the destination of a trip that ends at a dwell arrival row', () => {
    // Rows 1 and 2 are one stop (B) with arrival and departure in column 0. Column 1 ends at B's
    // arrival row, so B is that trip's destination.
    const files = build([
      '#TRL;0;NSR:Quay:7203;A;34;0;-1;-1;34;-1', '#TRC;0;0700;0;0;0;0;0', '#TRC;1;0800;0;0;0;0;0',
      '#TRL;1;NSR:Quay:11972;B;34;0;-1;-1;34;-1', '#TRC;0;0710;0;0;0;0;0', '#TRC;1;0810;0;0;0;0;0',
      '#TRL;2;NSR:Quay:11972;B;34;0;-1;-1;34;-1', '#TRC;0;0715;0;0;0;0;0',
      '#TRL;3;NSR:Quay:563;C;34;0;-1;-1;34;-1', '#TRC;0;0730;0;0;0;0;0',
    ]);
    expect(undefinedRefs(files)).toEqual([]);
  });

  it('leaves out an interchange to a stop that has no time in the target trip', () => {
    // Column 0 at A has an interchange to column 1, row 2 (D), which has no times at all.
    const files = build([
      '#TRL;0;NSR:Quay:7203;A;34;0;-1;-1;34;-1', '#TRC;0;0700;0;0;1;2;1024', '#TRC;1;0800;0;0;0;0;0',
      '#TRL;1;NSR:Quay:11972;B;34;0;-1;-1;34;-1', '#TRC;0;0710;0;0;0;0;0', '#TRC;1;0810;0;0;0;0;0',
      '#TRL;2;NSR:Quay:999;D;34;0;-1;-1;34;-1',
    ]);
    expect(undefinedRefs(files)).toEqual([]);
    expect(files[1].xml).not.toContain('ServiceJourneyInterchange');
  });

  it('keeps an interchange whose target has a time', () => {
    const files = build([
      '#TRL;0;NSR:Quay:7203;A;34;0;-1;-1;34;-1', '#TRC;0;0700;0;0;1;1;1024', '#TRC;1;0800;0;0;0;0;0',
      '#TRL;1;NSR:Quay:11972;B;34;0;-1;-1;34;-1', '#TRC;0;0710;0;0;0;0;0', '#TRC;1;0810;0;0;0;0;0',
    ]);
    expect(files[1].xml).toContain('<ServiceJourneyInterchange');
    expect(undefinedRefs(files)).toEqual([]);
  });

  it('leaves out an interchange to a trip that is not exported', () => {
    // Column 1 has only one time, so it is not a trip; the interchange to it must go too.
    const files = build([
      '#TRL;0;NSR:Quay:7203;A;34;0;-1;-1;34;-1', '#TRC;0;0700;0;0;1;0;1024', '#TRC;1;0800;0;0;0;0;0',
      '#TRL;1;NSR:Quay:11972;B;34;0;-1;-1;34;-1', '#TRC;0;0710;0;0;0;0;0',
    ]);
    expect(files[1].xml).not.toContain('ServiceJourneyInterchange');
    expect(undefinedRefs(files)).toEqual([]);
  });

  it('writes no empty Route for a table set without trips', () => {
    const rs = parseERN([...head, '#TUR;0;D;0;0;0;0',
      '#TRL;0;NSR:Quay:7203;A;34;0;-1;-1;34;-1', '#TRC;0;0700;0;0;0;0;0',
      '#TRL;1;NSR:Quay:11972;B;34;0;-1;-1;34;-1', '#TRC;0;0710;0;0;0;0;0',
      '#TRA;Tom', '#PER;;;;;;', '#KAL;jan', '#TAB;0;;;;'].join('\r\n') + '\r\n');
    const files = buildNeTExFiles({ codespace: 'TST', deliveryName: 'Test', orgs: [], calendars, timestamp: '2026-01-01T00:00:00', routes: [{ code: '70', rs }] });
    expect(files[1].xml.match(/<Route id=/g)).toHaveLength(1);
  });

  it('writes no line file for a route without trips', () => {
    const rs = parseERN(['#RUT;-1;71;Tom;;1;', '#TRA;Tom', '#PER;;;;;;', '#KAL;jan', '#TAB;0;;;;', '#TUR;0;D;0;0;0;0',
      '#TRL;0;NSR:Quay:7203;A;34;0;-1;-1;34;-1', '#TRC;0;0700;0;0;0;0;0'].join('\r\n') + '\r\n');
    const files = buildNeTExFiles({ codespace: 'TST', deliveryName: 'Test', orgs: [], timestamp: '2026-01-01T00:00:00', calendars, routes: [{ code: '71', rs }] });
    expect(files.map((f) => f.name)).toEqual(['_TST-shared.xml']);
  });
});
