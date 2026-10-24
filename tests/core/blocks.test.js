// Virtual intervals (power tools spec 2026-10-24): a parent column, an interval that divides 60, a last departure.
import { describe, it, expect } from 'vitest';
import { INTERVALS, firstDeparture, blockTrips, bandColumns, endColumn, withBlocks, withoutBlocks, snapSpan, canBeBlock, dragResult } from '../../src/core/blocks.js';

const UID = '5f0c2e1a-1111-4aaa-8bbb-00000000000a';
const c = (time, dayOffset = 0) => ({ time, dayOffset, suffix: '', interchange: null });
const parent = (block, times = ['0605', '0625']) => ({ uid: UID, dayCode: 'D', tripNo: '17', cells: times.map((x) => (x ? c(x) : null)), block });
const times = (col) => col.cells.map((x) => (x ? `${x.time}${x.dayOffset ? `+${x.dayOffset}` : ''}` : ''));

describe('blocks', () => {
  it('has the intervals that divide an hour', () => {
    expect(INTERVALS).toEqual([60, 30, 20, 15, 12, 10, 6, 5, 4, 3, 2, 1]);
  });

  it('every 30 minutes for two hours: four more trips, band 35 and 05, end 08:05', () => {
    const p = parent({ every: 30, span: 120 });
    expect(blockTrips(p).map((t) => t.cells[0].time)).toEqual(['0635', '0705', '0735', '0805']);
    expect(blockTrips(p)[0].cells[1].time).toBe('0655');
    expect(bandColumns(p).map((b) => b.minute)).toEqual([35, 5]);
    expect(times(endColumn(p))).toEqual(['0805', '0825']);
    expect(endColumn(p)).toMatchObject({ virt: 'end', of: UID });
  });

  it('hourly: 06:05 | 05 | 08:05', () => {
    const p = parent({ every: 60, span: 120 });
    expect(bandColumns(p).map((b) => b.minute)).toEqual([5]);
    expect(endColumn(p).cells[0].time).toBe('0805');
  });

  it('runs to 22:35 and past midnight with day offsets', () => {
    expect(endColumn(parent({ every: 30, span: 990 })).cells[0].time).toBe('2235');
    expect(times(endColumn(parent({ every: 30, span: 1380 })))).toEqual(['0505+1', '0525+1']);
    expect(times(endColumn(parent({ every: 60, span: 120 }, ['2330', '2350'])))).toEqual(['0130+1', '0150+1']);
    expect(times(blockTrips(parent({ every: 30, span: 120 }, ['2330', '2350']))[0])).toEqual(['0000+1', '0020+1']);
  });

  it('collapses a band under 10 minutes to one column', () => {
    const b = bandColumns(parent({ every: 5, span: 120 }));
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ virt: 'band', every: 5 });
  });

  it('gives generated trips stable ids, kept when the block grows, and no trip number', () => {
    const a = blockTrips(parent({ every: 60, span: 120 }));
    const b = blockTrips(parent({ every: 60, span: 240 }));
    expect(a[0].uid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-/);
    expect(b[0].uid).toBe(a[0].uid);
    expect(new Set(b.map((t) => t.uid)).size).toBe(b.length);
    expect(a[0].tripNo).toBeUndefined();
    expect(a[0].block).toBeUndefined();
    expect(a[0].dayCode).toBe('D');
  });

  it('finds the parent\'s first departure: the earliest time in the column', () => {
    expect(firstDeparture(parent(null, ['', '0625']))).toBe(385);
    expect(firstDeparture(parent(null, ['', '']))).toBeNull();
  });

  it('snaps the span to the band and the limits', () => {
    expect(snapSpan(30, 100)).toBe(120);
    expect(snapSpan(30, 2000)).toBe(1410);
    expect(snapSpan(20, 130)).toBe(140);
    expect(snapSpan(60, 1439)).toBe(1380);
  });

  it('puts the virtual columns after their parent and takes them away again, interchanges intact', () => {
    const p = parent({ every: 30, span: 120 });
    const before = { uid: 'b', cells: [{ ...c('0500'), interchange: { targetC: 2, targetR: 0, type: 'guaranteed' } }, null] };
    const after = { uid: 'a', cells: [c('0900'), null] };
    const cols = [before, p, after];
    const view = withBlocks(cols);
    expect(view.map((x) => x.virt ?? '')).toEqual(['', '', 'band', 'band', 'end', '']);
    expect(view[0].cells[0].interchange.targetC).toBe(5);
    expect(withoutBlocks(view)).toEqual(cols);
  });

  it('a column with an interchange, or one that is a target, cannot become a block', () => {
    const a = { cells: [{ ...c('0500'), interchange: { targetC: 1, targetR: 0, type: 'guaranteed' } }] };
    const b = { cells: [c('0600')] };
    const d = { cells: [c('0700')] };
    expect(canBeBlock([a, b, d], 0)).toBe(false);
    expect(canBeBlock([a, b, d], 1)).toBe(false);
    expect(canBeBlock([a, b, d], 2)).toBe(true);
  });

  it('turns drag steps into what to do', () => {
    expect(dragResult(0)).toEqual({ kind: 'none' });
    expect(dragResult(1)).toEqual({ kind: 'dialog' });
    expect(dragResult(2)).toEqual({ kind: 'band', every: 60 });
    expect(dragResult(3)).toEqual({ kind: 'band', every: 30 });
    expect(dragResult(7)).toEqual({ kind: 'band', every: 10 });
    expect(dragResult(9)).toEqual({ kind: 'ask' });
  });
});
