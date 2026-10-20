// Vehicles (user 2026-10-20): a vehicle per column, chosen from the project's list (data/vehicles.json), the same way
// as labels: a text row in ERN with field 5 bit 1 set, one #TTC per column with a vehicle (flags 512). Not exported
// to NeTEx yet; later a project vehicle refers to Entur's vehicle register.
import { describe, it, expect } from 'vitest';
import { parseERN } from '../../../src/core/ern/parse.js';
import { serializeERN } from '../../../src/core/ern/serialize.js';
import { checkRouteFile } from '../../../src/core/integrity/check.js';
import { copiesAtInterval } from '../../../src/core/column-copy.js';

const OPTS = { delivery: { name: 'T', codespace: 'TST' }, orgs: [] };
const file = (/** @type {string[]} */ rows) => ['#LEV;T;TST', '#RUT;-1;1;Linje;;6;', '#SEK;-1;;0;0;0;0', '#TRA;Fram', '#UID;5f0c2e1a-1111-4aaa-8bbb-0000000000a1', '#PER;;;;;;', '#TAB;0;;;;',
  '#TUR;0;D;0;0;0;0', '#UID;5f0c2e1a-1111-4aaa-8bbb-0000000000b1', '#TUR;1;D;0;0;0;0', '#UID;5f0c2e1a-1111-4aaa-8bbb-0000000000b2', ...rows,
  '#TRL;0;NSR:Quay:1;A;0;-1;-1;-1;0;-1', '#TRC;0;0700;0;0;0;0;0', '#TRC;1;0800;0;0;0;0;0'].join('\r\n') + '\r\n';
const grid = (/** @type {any} */ rs) => /** @type {any} */ (Object.values(rs.grids)[0]);

describe('vehicles in ERN', () => {
  it('reads the vehicle row beside the label and trip-number rows', () => {
    const rs = parseERN(file(['#TTL;-1;0;;10;Turnummer;0', '#TTC;0;;10;101;128', '#TTL;-1;0;;10;Etikett;1', '#TTC;0;;10;Rush;256',
      '#TTL;-1;0;;10;Kjøretøy;2', '#TTC;1;;10;Buss 7;512']));
    expect(grid(rs).tripRow).toBe(true);
    expect(grid(rs).labelRow).toBe(true);
    expect(grid(rs).vehicleRow).toBe(true);
    expect(grid(rs).cols.map((/** @type {any} */ c) => [c.tripNo, c.label, c.vehicle])).toEqual([['101', 'Rush', ''], ['', '', 'Buss 7']]);
  });

  it('writes it back after the label row, and a file with vehicles checks OK', () => {
    const rs = parseERN(file([]));
    grid(rs).labelRow = true;
    grid(rs).cols[0].label = 'Rush';
    grid(rs).vehicleRow = true;
    grid(rs).cols[1].vehicle = 'Buss 7';
    const text = serializeERN(rs, 'r', OPTS);
    expect(text).toContain('#TTL;-1;0;;10;Etikett;1\r\n#TTC;0;;10;Rush;256\r\n#TTL;-1;0;;10;Kjøretøy;2\r\n#TTC;1;;10;Buss 7;512\r\n');
    const back = grid(parseERN(text));
    expect(back.cols.map((/** @type {any} */ c) => [c.label, c.vehicle])).toEqual([['Rush', ''], ['', 'Buss 7']]);
    expect(checkRouteFile(text).status).toBe('ok');
  });

  it('a vehicle row alone shows neither the label nor the trip-number row', () => {
    const rs = parseERN(file(['#TTL;-1;0;;10;Kjøretøy;2', '#TTC;0;;10;Buss 7;512']));
    expect(grid(rs).tripRow).toBe(false);
    expect(grid(rs).labelRow).toBe(false);
    expect(grid(rs).cols[0]).toMatchObject({ tripNo: '', label: '', vehicle: 'Buss 7' });
  });

  it('a 1.x vehicle reference in #TUR is still ignored', () => {
    const rs = parseERN(file([]).replace('#TUR;0;D;0;0;0;0', '#TUR;0;D;0;0;0;0;12'));
    expect(grid(rs).cols[0].vehicle).toBe('');
  });

  it('a trip copied at an interval does not keep the vehicle (one vehicle cannot run them all)', () => {
    const col = { dayCode: 'D', uid: 'x', note: '', dates: [], tripNo: '', label: 'Rush', vehicle: 'Buss 7',
      cells: [{ time: '0800', dayOffset: 0, suffix: '', interchange: null }] };
    const copies = copiesAtInterval(col, 60, 10 * 60);
    expect(copies.map((c) => [c.label, c.vehicle])).toEqual([['Rush', ''], ['Rush', '']]);
  });
});
