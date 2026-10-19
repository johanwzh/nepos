// DirectionType on a table set (customer request 2026-10-19): an optional label mirroring NeTEx's DirectionType,
// stored in #TRA field 1 and exported as the Route's DirectionType.
import { describe, it, expect } from 'vitest';
import { parseERN } from '../../../src/core/ern/parse.js';
import { serializeERN } from '../../../src/core/ern/serialize.js';
import { checkRouteFile } from '../../../src/core/integrity/check.js';
import { buildNeTExFiles } from '../../../src/core/netex/export.js';

const OPTS = { delivery: { name: 'T', codespace: 'TST' }, orgs: [] };
const file = (/** @type {string} */ tra) => ['#LEV;T;TST', '#RUT;-1;1;Linje;;6;', '#SEK;TST:Authority:1;F;1;0;0;0', '#SEK;TST:Operator:1;B;0;1;0;0', '#DST;1;B;',
  tra, '#UID;5f0c2e1a-1111-4aaa-8bbb-0000000000a1', '#PER;;;;;;', '#KAL;h1', '#TAB;0;;;;', '#TUR;0;D;0;0;0;0', '#UID;5f0c2e1a-1111-4aaa-8bbb-0000000000b1',
  '#TRL;0;NSR:Quay:1;A;0;-1;-1;-1;0;-1', '#TRC;0;0700;0;0;0;0;0', '#TRL;1;NSR:Quay:2;B;0;-1;-1;-1;0;-1', '#TRC;0;0710;0;0;0;0;0', '#DSK;0;0;;1'].join('\r\n') + '\r\n';

describe('direction of a table set', () => {
  it('is read from #TRA field 1 and written back; none is written as before', () => {
    const rs = parseERN(file('#TRA;Fram;outbound'));
    expect(rs.tableSets[0].direction).toBe('outbound');
    expect(serializeERN(rs, 'r', OPTS)).toContain('#TRA;Fram;outbound\r\n');
    const none = parseERN(file('#TRA;Fram'));
    expect(none.tableSets[0].direction).toBe('');
    expect(serializeERN(none, 'r', OPTS)).toContain('#TRA;Fram\r\n');
  });

  it('keeps a file with a direction OK in the file check', () => {
    expect(checkRouteFile(serializeERN(parseERN(file('#TRA;Fram;clockwise')), '1', OPTS)).status).toBe('ok');
  });

  it('is exported as the Route\'s DirectionType, after LineRef', () => {
    const line = buildNeTExFiles({ codespace: 'TST', deliveryName: 'T', routes: [{ code: 'r1', rs: parseERN(file('#TRA;Fram;inbound')) }], orgs: [], brandings: [], calendars: [{ id: 'h1', name: 'V', ranges: [['20260101', '20260630']] }], timestamp: 'x' })[1].xml;
    expect(line).toMatch(/<LineRef ref="[^"]+" version="1"\/>\s*<DirectionType>inbound<\/DirectionType>\s*<pointsInSequence>/);
  });

  it('leaves DirectionType out when none is chosen', () => {
    const line = buildNeTExFiles({ codespace: 'TST', deliveryName: 'T', routes: [{ code: 'r1', rs: parseERN(file('#TRA;Fram')) }], orgs: [], brandings: [], calendars: [{ id: 'h1', name: 'V', ranges: [['20260101', '20260630']] }], timestamp: 'x' })[1].xml;
    expect(line).not.toContain('DirectionType');
  });
});
