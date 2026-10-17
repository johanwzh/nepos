import { describe, it, expect } from 'vitest';
import { firstWord, hasViaWord, sameDest, destKey, destLabel, normalizeDests, servedRows, destSegments, effectiveDestAt } from '../../src/core/destinations.js';

const stop = (name, stopId = `NSR:Quay:${name.length}${name}`) => ({ name, stopId, bold: false, sep: false, isDwellArr: false, price: null });
const cell = (time) => ({ time, dayOffset: 0, suffix: '', interchange: null });
const d = (text, vias = []) => ({ text, vias });

/** A grid of named stops (all with IDs) and one column with times on the given rows. */
function gridOf(names, timedRows) {
  const stops = names.map((n) => stop(n));
  const col = { dayCode: 'D', cells: stops.map((_, i) => (timedRows.includes(i) ? cell(`07${String(10 + i)}`) : null)) };
  const grid = { stops, cols: [col] };
  normalizeDests(grid);
  return { grid, col };
}

describe('destination helpers', () => {
  it('takes the first word of a stop name', () => {
    expect(firstWord('Oslo S')).toBe('Oslo');
    expect(firstWord('  Trondheim S ')).toBe('Trondheim');
    expect(firstWord('Sandvika bussterminal')).toBe('Sandvika');
    expect(firstWord('')).toBe('');
  });

  it('finds the word via in a text, not inside another word', () => {
    expect(hasViaWord('Røros via Støren')).toBe(true);
    expect(hasViaWord('Viadukten')).toBe(false);
    expect(hasViaWord('VIA')).toBe(true);
  });

  it('compares destinations by text and vias in order', () => {
    expect(sameDest(d('C', ['B']), d('C', ['B']))).toBe(true);
    expect(sameDest(d('C', ['A', 'B']), d('C', ['B', 'A']))).toBe(false);
    expect(sameDest(null, null)).toBe(true);
    expect(sameDest(d('C'), null)).toBe(false);
    expect(destKey(d('C', ['B']))).not.toBe(destKey(d('C B')));
  });

  it('labels a destination with its vias', () => {
    expect(destLabel(d('Røros', ['Støren', 'Støren2']))).toEqual({ text: 'Røros', vias: 'via Støren, Støren2' });
    expect(destLabel(d('Røros'))).toEqual({ text: 'Røros', vias: '' });
  });

  it('gives every column a start and a change list as long as the stops', () => {
    const grid = { stops: [stop('A'), stop('B'), stop('C')], cols: [{ cells: [] }, { cells: [], dests: [null, null, null, null, d('X')] }, { cells: [], dest: d('S'), dests: [d('Y')] }] };
    normalizeDests(grid);
    expect(grid.cols[0]).toMatchObject({ dest: null, dests: [null, null, null] });
    expect(grid.cols[1].dests).toEqual([null, null, null]);
    expect(grid.cols[2].dest).toEqual(d('S'));
    expect(grid.cols[2].dests).toEqual([d('Y'), null, null]);
  });
});

describe('served rows', () => {
  it('counts rows with a time and a stop ID', () => {
    const grid = { stops: [stop('A'), stop('B', null), stop('C'), stop('D')], cols: [] };
    const col = { cells: [cell('0700'), cell('0705'), cell('0710'), null] };
    expect(servedRows(grid, col)).toEqual([0, 2]);
  });

  it('leaves out the arrival half of a dwell stop', () => {
    const grid = { stops: [stop('A'), { ...stop('B'), isDwellArr: true }, stop('B'), stop('C')], cols: [] };
    grid.stops[2].stopId = grid.stops[1].stopId;
    const col = { cells: [cell('0700'), cell('0705'), cell('0710'), cell('0720')] };
    expect(servedRows(grid, col)).toEqual([0, 2, 3]);
  });
});

describe('destination segments', () => {
  it('runs the start to the first change and the change to the last stop', () => {
    const { grid, col } = gridOf(['A', 'B', 'C', 'D'], [0, 1, 2, 3]);
    col.dest = d('C');
    col.dests[1] = d('D');
    expect(destSegments(grid, col).map(({ row, end, start, colour, state }) => ({ row, end, start, colour, state }))).toEqual([
      { row: 0, end: 0, start: true, colour: 0, state: 'ok' },
      { row: 1, end: 3, start: false, colour: 1, state: 'ok' },
    ]);
  });

  it('marks a change on the last stop and one on a row the trip does not serve', () => {
    const { grid, col } = gridOf(['A', 'B', 'C', 'D'], [0, 2, 3]);
    col.dest = d('D');
    col.dests[1] = d('X');
    col.dests[3] = d('Y');
    const segs = destSegments(grid, col);
    expect(segs.find((s) => s.row === 1)?.state).toBe('unserved');
    expect(segs.find((s) => s.row === 3)?.state).toBe('last');
  });

  it('has no start segment when the column has no destination', () => {
    const { grid, col } = gridOf(['A', 'B'], [0, 1]);
    expect(destSegments(grid, col)).toEqual([]);
  });

  it('tells which destination applies at a row', () => {
    const { grid, col } = gridOf(['A', 'B', 'C', 'D'], [0, 1, 2, 3]);
    col.dest = d('C', ['B']);
    col.dests[1] = d('C');
    expect(effectiveDestAt(grid, col, 0)).toEqual(d('C', ['B']));
    expect(effectiveDestAt(grid, col, 2)).toEqual(d('C'));
  });
});
