import { describe, it, expect } from 'vitest';
import { sortColumns } from '../../src/core/column-sort.js';

const cell = (/** @type {string} */ time, dayOffset = 0, interchange = null) => ({ time, dayOffset, suffix: '', interchange, footnoteId: null });
const col = (/** @type {string} */ dayCode, /** @type {any[]} */ cells, uid = dayCode + cells.map((c) => c?.time).join()) => ({ dayCode, uid, footnote: '', footnoteId: null, cells });

describe('sortColumns', () => {
  it('by departure: the first time in each column, a later day counting later', () => {
    const grid = { stops: [{}, {}], cols: [col('D', [cell('0900'), cell('0910')]), col('D', [null, cell('0005', 1)]), col('D', [cell('0700'), cell('0710')])] };
    sortColumns(grid, 'time');
    expect(grid.cols.map((c) => c.cells.find(Boolean).time)).toEqual(['0700', '0900', '0005']);
  });

  it('in day-code blocks (D, then by first weekday, then 6, 7, H), then by departure', () => {
    const grid = { stops: [{}], cols: [col('H', [cell('0800')]), col('6', [cell('0700')]), col('DX67', [cell('0900')]), col('D', [cell('1000')]), col('DX67', [cell('0600')]), col('7', [cell('0500')])] };
    sortColumns(grid, 'daycode');
    expect(grid.cols.map((c) => `${c.dayCode} ${c.cells[0].time}`)).toEqual(['D 1000', 'DX67 0600', 'DX67 0900', '6 0700', '7 0500', 'H 0800']);
  });

  it('re-points interchanges to the columns they meant', () => {
    // column 0 (0900) has an interchange to column 1 (0700), which moves to the front
    const grid = { stops: [{}, {}], cols: [col('D', [cell('0900', 0, { targetR: 1, targetC: 1, type: 'guaranteed' }), null]), col('D', [cell('0700'), cell('0705')])] };
    sortColumns(grid, 'time');
    expect(grid.cols[1].cells[0].interchange.targetC).toBe(0);
  });

  it('keeps the order of equal columns, and puts columns without times last', () => {
    const grid = { stops: [{}], cols: [col('D', [null], 'empty'), col('D', [cell('0800')], 'a'), col('D', [cell('0800')], 'b')] };
    sortColumns(grid, 'time');
    expect(grid.cols.map((c) => c.uid)).toEqual(['a', 'b', 'empty']);
  });
});
