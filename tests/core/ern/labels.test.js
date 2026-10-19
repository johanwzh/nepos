// Column labels (62): a planner's label per column ("Normal", "Rush"), a text row in ERN with field 5 bit 0 set,
// one #TTC per labelled column (flags 256). Not exported to NeTEx.
import { describe, it, expect } from 'vitest';
import { parseERN } from '../../../src/core/ern/parse.js';
import { serializeERN } from '../../../src/core/ern/serialize.js';
import { checkRouteFile } from '../../../src/core/integrity/check.js';

const OPTS = { delivery: { name: 'T', codespace: 'TST' }, orgs: [] };
const file = (/** @type {string[]} */ rows) => ['#LEV;T;TST', '#RUT;-1;1;Linje;;6;', '#SEK;-1;;0;0;0;0', '#TRA;Fram', '#UID;5f0c2e1a-1111-4aaa-8bbb-0000000000a1', '#PER;;;;;;', '#TAB;0;;;;',
  '#TUR;0;D;0;0;0;0', '#UID;5f0c2e1a-1111-4aaa-8bbb-0000000000b1', '#TUR;1;D;0;0;0;0', '#UID;5f0c2e1a-1111-4aaa-8bbb-0000000000b2', ...rows,
  '#TRL;0;NSR:Quay:1;A;0;-1;-1;-1;0;-1', '#TRC;0;0700;0;0;0;0;0', '#TRC;1;0800;0;0;0;0;0'].join('\r\n') + '\r\n';
const grid = (/** @type {any} */ rs) => /** @type {any} */ (Object.values(rs.grids)[0]);

describe('column labels in ERN', () => {
  it('reads the label row beside the trip-number row', () => {
    const rs = parseERN(file(['#TTL;-1;0;;10;Turnummer;0', '#TTC;0;;10;101;128', '#TTL;-1;0;;10;Etikett;1', '#TTC;0;;10;Rush;256']));
    expect(grid(rs).tripRow).toBe(true);
    expect(grid(rs).labelRow).toBe(true);
    expect(grid(rs).cols.map((/** @type {any} */ c) => [c.tripNo, c.label])).toEqual([['101', 'Rush'], ['', '']]);
  });

  it('writes it back, and a file with labels checks OK', () => {
    const rs = parseERN(file([]));
    grid(rs).labelRow = true;
    grid(rs).cols[1].label = 'Normal';
    const text = serializeERN(rs, 'r', OPTS);
    expect(text).toContain('#TTL;-1;0;;10;Etikett;1\r\n#TTC;1;;10;Normal;256\r\n');
    expect(grid(parseERN(text)).cols[1].label).toBe('Normal');
    expect(checkRouteFile(text).status).toBe('ok');
  });

  it('a label row alone does not show the trip-number row', () => {
    const rs = parseERN(file(['#TTL;-1;0;;10;Etikett;1', '#TTC;0;;10;Rush;256']));
    expect(grid(rs).tripRow).toBe(false);
    expect(grid(rs).cols[0].tripNo).toBe('');
  });
});
