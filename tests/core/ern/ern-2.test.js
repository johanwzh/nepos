// ERN 2.0 (docs/ern/ern-standard.md, decided 2026-10-17): Nepos writes the standard and reads both
// the standard and its own older files; the project check offers to update the older ones.
import { describe, it, expect } from 'vitest';
import { parseERN } from '../../../src/core/ern/parse.js';
import { serializeERN } from '../../../src/core/ern/serialize.js';
import { checkRouteFile } from '../../../src/core/integrity/check.js';
import { routeSummary } from '../../../src/ui/route-summary.js';

const OPTS = { delivery: { name: 'T', codespace: 'TST' }, orgs: [] };
const U = '5f0c2e1a-1111-4aaa-8bbb-000000000001';
/** A route file as Nepos 2 wrote it before ERN 2.0. */
const OLD = [
  '#LEV;T;TST', '#RUT;-1;N54;A - B;;13;', '#MOD;bus;expressBus', '#BRA;TST:Branding:b1', '#EKS;1', '#OFF;1',
  '#SEK;TST:Operator:1;Buss AS;0;1;0;0', '#CUR;neposcoin;1', '#TRA;A - B', '#UID;5f0c2e1a-1111-4aaa-8bbb-0000000000a1', '#PER;;;;;;', '#KAL;c1', '#KOM;Hei', '#TAB;0;;;;',
  '#TUR;0;D;0;0;0;0', `#UID;${U}`,
  '#TRL;0;NSR:Quay:1;A;34;1;12.500000;-1;34;-1', '#TRC;0;0800;0;0;0;0;8',
  '#TRL;1;NSR:Quay:2;B;34;2;-1;-1;34;-1', '#TRC;0;0830;0;0;0;0;0',
  '#FOT;0;-1;Merknad;0',
].join('\r\n') + '\r\n';
const grid = (/** @type {any} */ rs) => /** @type {any} */ (Object.values(rs.grids)[0]);

describe('ERN 2.0: what Nepos writes', () => {
  const text = serializeERN(parseERN(OLD), 'r', OPTS);
  const lines = text.split('\r\n');

  it('writes the renamed records (#TRM, #MRK) and no #MOD, #BRA or #CUR', () => {
    expect(lines).toContain('#TRM;bus;expressBus');
    expect(lines).toContain('#MRK;TST:Branding:b1');
    expect(lines.some((l) => /^#(MOD|BRA|CUR|VAL);/.test(l))).toBe(false);
  });

  it('writes #TRL in the standard\'s positions: typography (bold = bit 1, underline = bit 3), km, zone, price, flags, platform', () => {
    expect(lines).toContain('#TRL;0;NSR:Quay:1;A;2;-1;-1;12.500000;0;-1');
    expect(lines).toContain('#TRL;1;NSR:Quay:2;B;8;-1;-1;-1;0;-1');
  });

  it('marks a request stop with bit 8 of the #TRC mask', () => {
    expect(lines).toContain('#TRC;0;0800;0;0;0;0;256');
  });

  it('writes a language code on notes; the line note is a note on the whole table', () => {
    expect(lines).toContain('#FOT;0;-1;Merknad;nob');
    expect(lines).toContain('#FOT;-1;-1;Hei;nob');
  });

  it('reads back what it writes, and the check finds nothing to update', () => {
    const rs = parseERN(text);
    expect([rs.mode, rs.submode, rs.brandingId]).toEqual(['bus', 'expressBus', 'TST:Branding:b1']);
    expect(grid(rs).stops.map((/** @type {any} */ s) => [s.bold, s.sep, s.price])).toEqual([[true, false, 12.5], [false, true, null]]);
    expect(grid(rs).cols[0].cells[0].suffix).toBe('x');
    expect(checkRouteFile(text)).toEqual({ status: 'ok', issues: [] });
  });
});

describe('ERN 2.0: reading older files', () => {
  it('reads Nepos\'s older files the same way', () => {
    const rs = parseERN(OLD);
    expect([rs.mode, rs.brandingId, rs.kom]).toEqual(['bus', 'TST:Branding:b1', 'Hei']);
    expect(grid(rs).stops.map((/** @type {any} */ s) => [s.bold, s.sep, s.price])).toEqual([[true, false, 12.5], [false, true, null]]);
    expect(grid(rs).cols[0].cells[0].suffix).toBe('x');
    expect(grid(rs).cols[0].note).toBe('Merknad');
  });

  it('offers to update them, and nothing is lost by doing so', () => {
    const res = checkRouteFile(OLD);
    expect(res.status).toBe('outdated');
    expect(new Set(res.issues.map((i) => i.code))).toEqual(new Set(['old-record-name', 'old-row-layout', 'old-request-stop', 'old-language-code', 'old-line-note']));
  });

  it('reads a classic ERN row (typography in field 3, price in field 6)', () => {
    const classic = OLD.replace('#TRL;0;NSR:Quay:1;A;34;1;12.500000;-1;34;-1', '#TRL;0;6239;Halden rb.st.;2;0.00;-1;45;34;-1');
    const s0 = grid(parseERN(classic)).stops[0];
    expect([s0.name, s0.bold, s0.sep, s0.price]).toEqual(['Halden rb.st.', true, false, 45]);
  });

  it('turns comments in other languages (#KON, #KOE, #KOT, #KOM with a code) into line notes (#FOT -1;-1) with a language code', () => {
    const multi = OLD.replace('#KOM;Hei', '#KOM;Hei\r\n#KOE;Hello\r\n#KON;Hei på deg\r\n#KOM;Hallo;deu');
    const rs = parseERN(multi);
    expect(rs.kom).toBe('Hei');
    const out = serializeERN(rs, 'r', OPTS).split('\r\n');
    expect(out).toEqual(expect.arrayContaining(['#FOT;-1;-1;Hei;nob', '#FOT;-1;-1;Hello;eng', '#FOT;-1;-1;Hei på deg;nno', '#FOT;-1;-1;Hallo;deu']));
    expect(checkRouteFile(multi).status).toBe('outdated'); // nothing lost: the old records are only renamed
  });

  it('the line list reads both the old and the new record names', () => {
    const fresh = serializeERN(parseERN(OLD), 'r', OPTS);
    for (const t of [OLD, fresh]) {
      const s = routeSummary(t);
      expect([s.mode, s.submode, s.brandingId]).toEqual(['bus', 'expressBus', 'TST:Branding:b1']);
    }
  });
});
