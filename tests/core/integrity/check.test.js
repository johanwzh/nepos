import { describe, it, expect } from 'vitest';
import { sample } from '../../fixtures/sample-project.js';
import { parseERN } from '../../../src/core/ern/parse.js';
import { serializeERN } from '../../../src/core/ern/serialize.js';
import { checkRouteFile, summarizeIntegrity } from '../../../src/core/integrity/check.js';

const nepos2 = serializeERN(parseERN(sample.routes[0].text), '10', { delivery: sample.delivery, orgs: sample.orgs });
const codes = (text) => checkRouteFile(text).issues.map((i) => i.code);

describe('checkRouteFile', () => {
  it('passes a file written by Nepos 2', () => {
    expect(checkRouteFile(nepos2)).toEqual({ status: 'ok', issues: [] });
  });

  it('marks a 1.x file as outdated: personal data in #LEV and the vehicle field', () => {
    const result = checkRouteFile(sample.routes[0].text);
    expect(result.status).toBe('outdated');
    expect(result.issues[0]).toEqual({ code: 'personal-data-in-lev', severity: 'outdated', line: 1 });
    expect(codes(sample.routes[0].text)).toContain('vehicle-field');
  });

  it('marks a file without #LEV as outdated', () => {
    expect(codes(nepos2.replace(/^#LEV[^\r\n]*\r\n/, ''))).toEqual(['missing-lev']);
  });

  it('marks records Nepos would drop on save as damaged, with their line', () => {
    const text = nepos2.replace('#TRA;10\r\n', '#TRA;10\r\n#KOS;4;Byttes i Florø;0\r\n');
    const result = checkRouteFile(text);
    expect(result.status).toBe('damaged');
    expect(result.issues).toContainEqual({ code: 'unsupported-record', severity: 'damaged', line: 7, detail: '#KOS' });
  });

  it('marks a second #KOM as damaged (only the first is kept)', () => {
    expect(codes(nepos2.replace('#KOM;', '#KOM;Første\r\n#KOM;'))).toContain('extra-comment');
  });

  it('marks fields Nepos would drop as damaged', () => {
    expect(codes(nepos2.replace('#RUT;-1;10;Bergen - Florø;;6;', '#RUT;-1;10;Bergen - Florø;Kystruta;6;'))).toContain('unsupported-field');
    expect(codes(nepos2.replace('#TRC;0;0800;0;0;0;0;0', '#TRC;0;0800;0;2;0;0;0'))).toContain('unsupported-field');
  });

  it('marks invalid day codes, times and dates as damaged', () => {
    expect(codes(nepos2.replace('#TUR;1;DX67;', '#TUR;1;XX;'))).toContain('invalid-day-code');
    expect(codes(nepos2.replace('#TRC;0;0800;', '#TRC;0;0860;'))).toContain('invalid-time');
    expect(codes(nepos2.replace('20260831', '20260931'))).toContain('invalid-date');
  });

  it('marks records in the wrong place as damaged', () => {
    const tabFirst = nepos2.replace('#PER;Sommer', '#TAB;0;;;;\r\n#PER;Sommer');
    expect(checkRouteFile(tabFirst).issues).toContainEqual({ code: 'out-of-order', severity: 'damaged', line: 7, detail: '#TAB' });
  });

  it('marks lines that are not records as damaged', () => {
    expect(codes(nepos2.replace('#TRA;10', 'hello'))).toContain('unreadable-line');
  });

  it('marks a file with no #RUT as damaged', () => {
    expect(codes('#LEV;X;ABC\r\n')).toEqual(['missing-route-record']);
  });

  it('marks a file with old Mac line endings (CR only) as damaged', () => {
    expect(checkRouteFile(nepos2.replace(/\r\n/g, '\r')).status).toBe('damaged');
  });

  it('notes a route without periods but does not block it', () => {
    expect(checkRouteFile('#LEV;X;ABC\r\n#RUT;-1;30;Ny rute;;1;\r\n')).toEqual({
      status: 'ok',
      issues: [{ code: 'no-periods', severity: 'note' }],
    });
  });

  it('accepts LF-only line endings', () => {
    expect(checkRouteFile(nepos2.replace(/\r\n/g, '\n')).status).toBe('ok');
  });
});

describe('summarizeIntegrity', () => {
  it('counts each status', () => {
    expect(summarizeIntegrity([{ status: 'ok' }, { status: 'ok' }, { status: 'outdated' }, { status: 'damaged' }]))
      .toEqual({ ok: 2, outdated: 1, damaged: 1 });
  });
});
