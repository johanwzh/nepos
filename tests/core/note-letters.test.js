// Note letters (booking spec 2026-10-22): b, c, … skipping a, p and x; after z: bb, bc, …; per table in reading
// order, column by column, top to bottom; identical note and dates share a letter.
import { describe, it, expect } from 'vitest';
import { letterAt, noteLetters, noteLegend } from '../../src/core/note-letters.js';

const c = (time, more = {}) => ({ time, dayOffset: 0, suffix: '', interchange: null, ...more });

describe('note letters', () => {
  it('skips a, p and x and goes on to two letters after z', () => {
    expect(letterAt(0)).toBe('b');
    expect(letterAt(13)).toBe('o');
    expect(letterAt(14)).toBe('q');
    expect(letterAt(20)).toBe('w');
    expect(letterAt(21)).toBe('y');
    expect(letterAt(22)).toBe('z');
    expect(letterAt(23)).toBe('bb');
    expect(letterAt(24)).toBe('bc');
  });

  it('gives letters column by column, top to bottom, and the same note and dates the same letter', () => {
    const d = [{ from: '20260101', to: '20260102', on: false }];
    const grid = { stops: [{}, {}], cols: [
      { cells: [c('0700'), c('0710', { note: 'Bytt' })] },
      { cells: [c('0800', { note: 'Først' }), c('0810', { note: 'Bytt' })] },
      { cells: [c('0900', { dates: d }), c('0910', { note: 'Bytt', dates: d })] },
    ] };
    const m = noteLetters(grid);
    expect(m.get('0:1')).toBe('b');
    expect(m.get('1:0')).toBe('c');
    expect(m.get('1:1')).toBe('b');
    expect(m.get('2:0')).toBe('d');
    expect(m.get('2:1')).toBe('e');
    expect(m.has('0:0')).toBe(false);
  });

  it('counts only real columns, not a block\'s virtual ones', () => {
    const grid = { stops: [{}], cols: [{ cells: [c('0700', { note: 'X' })], virt: 'band' }, { cells: [c('0800', { note: 'Y' })] }] };
    const m = noteLetters(grid);
    expect(m.has('0:0')).toBe(false);
    expect(m.get('1:0')).toBe('b');
  });
});

// The list under the grid (backlog 116): every letter in use once, with the note and dates it stands for
describe('note legend', () => {
  const d = [{ from: '20260101', to: '20260102', on: false }];

  it('lists each letter once, with its note and dates, in letter order', () => {
    const grid = { stops: [{}, {}], cols: [
      { cells: [c('0700'), c('0710', { note: 'Bytt' })] },
      { cells: [c('0800', { note: 'Først' }), c('0810', { note: 'Bytt' })] },
      { cells: [c('0900', { dates: d }), c('0910', { note: 'Bytt', dates: d })] },
    ] };
    expect(noteLegend(grid)).toEqual([
      { letter: 'b', note: 'Bytt', dates: [] },
      { letter: 'c', note: 'Først', dates: [] },
      { letter: 'd', note: '', dates: d },
      { letter: 'e', note: 'Bytt', dates: d },
    ]);
  });

  it('is empty when no time has a note or dates, and skips a block\'s virtual columns', () => {
    expect(noteLegend({ stops: [{}], cols: [{ cells: [c('0700')] }] })).toEqual([]);
    expect(noteLegend({ stops: [{}], cols: [{ cells: [c('0700', { note: 'X' })], virt: 'band' }] })).toEqual([]);
  });

  it('goes b … z and then bb, bc …, the two-letter ones last', () => {
    const cells = Array.from({ length: 25 }, (_, i) => c('0700', { note: `n${i}` }));
    const legend = noteLegend({ stops: cells.map(() => ({})), cols: [{ cells }] });
    expect(legend).toHaveLength(25);
    expect(legend.map((e) => e.letter).slice(21)).toEqual(['y', 'z', 'bb', 'bc']);
    expect(legend[0]).toMatchObject({ letter: 'b', note: 'n0' });
  });
});
