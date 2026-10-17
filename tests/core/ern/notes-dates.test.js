// Notes and dates are separate (spreadsheet tools spec, 2026-10-17): a column or a cell has its own
// note (#FOT) and its own date changes (#UNT: PMU bit 13 = runs on these days, bit 14 = does not).
// The file format is unchanged.
import { describe, it, expect } from 'vitest';
import { parseERN } from '../../../src/core/ern/parse.js';
import { serializeERN } from '../../../src/core/ern/serialize.js';
import { sample } from '../../fixtures/sample-project.js';

const OPTS = { delivery: { name: 'T', codespace: 'TST' }, orgs: [] };

describe('notes and dates on columns and cells', () => {
  it('reads #FOT as the note and #UNT as dates, with no shared footnote list', () => {
    const rs = parseERN(sample.routes[0].text);
    const grid = /** @type {any} */ (Object.values(rs.grids)[0]);
    expect(rs.footnotes).toBeUndefined();
    expect(grid.cols[2].note).toBe('Kjører ikke i fellesferien.');
    expect(grid.cols[2].dates).toEqual([{ from: '20260706', to: '20260802', on: false }]);
    expect(grid.cols[1].note).toBe('');
    expect(grid.cols[1].dates).toEqual([{ from: '20260615', to: '20260615', on: true }]);
    expect(grid.cols[0].dates).toEqual([]);
  });

  it('writes them back as the same records, column and cell', () => {
    const rs = parseERN(sample.routes[0].text);
    const grid = /** @type {any} */ (Object.values(rs.grids)[0]);
    grid.cols[0].cells[0].note = 'Bytt buss';
    grid.cols[0].cells[0].dates = [{ from: '20260101', to: '20260102', on: false }];
    const text = serializeERN(rs, 'r', OPTS);
    expect(text).toContain('#FOT;2;-1;Kjører ikke i fellesferien.;0');
    expect(text).toContain('#UNT;2;-1;20260706;16384;20260802;16384;0;0;');
    expect(text).toContain('#UNT;1;-1;20260615;8192;20260615;8192;0;0;');
    expect(text).toContain('#FOT;0;0;Bytt buss;0');
    expect(text).toContain('#UNT;0;0;20260101;16384;20260102;16384;0;0;');
    const again = /** @type {any} */ (Object.values(parseERN(text).grids)[0]);
    expect(again.cols[0].cells[0]).toMatchObject({ note: 'Bytt buss', dates: [{ from: '20260101', to: '20260102', on: false }] });
  });

  it('leaves out dates without a date', () => {
    const rs = parseERN(sample.routes[0].text);
    /** @type {any} */ (Object.values(rs.grids)[0]).cols[0].dates = [{ from: '', to: '', on: false }];
    expect(serializeERN(rs, 'r', OPTS)).not.toContain('#UNT;0;');
  });
});
