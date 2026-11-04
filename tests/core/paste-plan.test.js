// Where a pasted block goes, Excel's way (backlog 102, spec 2026-11-04-paste-everywhere-design.md).
import { describe, it, expect } from 'vitest';
import { pastePlan, textBlock, dayCodeList } from '../../src/core/paste-plan.js';

const size = { rows: 10, cols: 10 };
const sel = (r0, c0, r1 = r0, c1 = c0) => ({ r0, c0, r1, c1 });

describe('pastePlan: one cell', () => {
  it('onto one cell goes there, once', () => {
    expect(pastePlan({ rows: 1, cols: 1 }, sel(3, 4), size)).toEqual({ r0: 3, c0: 4, r1: 3, c1: 4, addRows: 0, addCols: 0 });
  });
  it('onto a selection fills all of it', () => {
    expect(pastePlan({ rows: 1, cols: 1 }, sel(2, 1, 5, 3), size)).toEqual({ r0: 2, c0: 1, r1: 5, c1: 3, addRows: 0, addCols: 0 });
  });
});

describe('pastePlan: a block', () => {
  const two = { rows: 2, cols: 1 };
  it('repeats when the selection is a whole multiple in both directions', () => {
    expect(pastePlan(two, sel(0, 0, 3, 2), size)).toMatchObject({ r0: 0, c0: 0, r1: 3, c1: 2, addRows: 0, addCols: 0 });
  });
  it('pastes once from the top-left when the selection is not a multiple', () => {
    expect(pastePlan(two, sel(1, 2, 3, 2), size)).toMatchObject({ r0: 1, c0: 2, r1: 2, c1: 2 }); // 3 rows is not a multiple of 2
  });
  it('pastes once when only one direction is a multiple', () => {
    expect(pastePlan({ rows: 2, cols: 2 }, sel(0, 0, 3, 2), size)).toMatchObject({ r1: 1, c1: 1 }); // 3 columns is not a multiple of 2
  });
  it('a selection smaller than the block pastes the whole block once', () => {
    expect(pastePlan({ rows: 3, cols: 3 }, sel(1, 1), size)).toMatchObject({ r0: 1, c0: 1, r1: 3, c1: 3 });
  });
  it('a selection the size of the block pastes it once', () => {
    expect(pastePlan(two, sel(4, 4, 5, 4), size)).toMatchObject({ r0: 4, r1: 5, c0: 4, c1: 4 });
  });
  it('a selection given backwards (from the bottom right) is the same rectangle', () => {
    // the caller passes the normalised rectangle: r0 <= r1, c0 <= c1
    expect(pastePlan({ rows: 1, cols: 1 }, sel(1, 1, 2, 2), size)).toMatchObject({ r0: 1, c0: 1, r1: 2, c1: 2 });
  });
});

describe('pastePlan: growth', () => {
  it('adds the rows and columns a block pasted once needs', () => {
    expect(pastePlan({ rows: 3, cols: 4 }, sel(8, 8), size)).toEqual({ r0: 8, c0: 8, r1: 10, c1: 11, addRows: 1, addCols: 2 });
  });
  it('never adds when the block is repeated over a selection', () => {
    const p = pastePlan({ rows: 1, cols: 1 }, sel(8, 8, 9, 9), size);
    expect(p).toMatchObject({ r1: 9, c1: 9, addRows: 0, addCols: 0 });
  });
  it('grows only as far as the used part of a block (junk at the end adds nothing)', () => {
    // a 3 × 3 block of text where only the first column holds times
    const p = pastePlan({ rows: 3, cols: 3, usedRows: 3, usedCols: 1 }, sel(0, 9), size);
    expect(p).toMatchObject({ addRows: 0, addCols: 0, c0: 9, c1: 9 }); // the other two columns fall off the edge, as before
  });
  it('clips the pasted area to the grid when part of the block is unused', () => {
    expect(pastePlan({ rows: 2, cols: 4, usedRows: 2, usedCols: 2 }, sel(0, 8), size)).toMatchObject({ c0: 8, c1: 9, addCols: 0 });
  });
  it('a block with nothing used adds nothing', () => {
    expect(pastePlan({ rows: 2, cols: 2, usedRows: 0, usedCols: 0 }, sel(9, 9), size)).toMatchObject({ addRows: 0, addCols: 0 });
  });
});

describe('pastePlan: nothing to paste', () => {
  it('an empty block gives no plan', () => {
    expect(pastePlan({ rows: 0, cols: 0 }, sel(0, 0), size)).toBeNull();
    expect(pastePlan({ rows: 2, cols: 0 }, sel(0, 0), size)).toBeNull();
  });
});

describe('textBlock', () => {
  it('splits rows on line breaks and cells on tabs', () => {
    expect(textBlock('a\tb\nc\td')).toEqual([['a', 'b'], ['c', 'd']]);
    expect(textBlock('a\tb\r\nc\td')).toEqual([['a', 'b'], ['c', 'd']]);
  });
  it('ignores the one line break Excel puts at the end', () => {
    expect(textBlock('0700\r\n')).toEqual([['0700']]);
    expect(textBlock('0700\n')).toEqual([['0700']]);
  });
  it('keeps an empty cell at the end of a row', () => {
    expect(textBlock('0605x\t')).toEqual([['0605x', '']]);
  });
  it('a blank line is an empty row', () => {
    expect(textBlock('0700\n\n0800')).toEqual([['0700'], [], ['0800']]);
  });
  it('nothing is no rows', () => {
    expect(textBlock('')).toEqual([]);
  });
});

describe('dayCodeList', () => {
  it('reads codes separated by tabs, line breaks or both, in order', () => {
    expect(dayCodeList('DX67\t6')).toEqual(['DX67', '6']);
    expect(dayCodeList('D\nDX67\r\n7')).toEqual(['D', 'DX67', '7']);
    expect(dayCodeList('D\t6\nDX67')).toEqual(['D', '6', 'DX67']);
  });
  it('ignores the one line break at the end', () => {
    expect(dayCodeList('DX67\r\n')).toEqual(['DX67']);
  });
  it('tidies: lower case, DX76 → DX67, 1234567 → D', () => {
    expect(dayCodeList('dx76\t1234567')).toEqual(['DX67', 'D']);
  });
  it('is null when any entry is not a day code (nothing is pasted)', () => {
    expect(dayCodeList('D\thei')).toBeNull();
    expect(dayCodeList('0800\t0900')).toBeNull();
    expect(dayCodeList('D\t\t6')).toBeNull();
    expect(dayCodeList('')).toBeNull();
  });
});
