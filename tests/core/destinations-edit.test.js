import { describe, it, expect } from 'vitest';
import { normalizeDests, setDestAt, moveChange, viaDrag, suggestDests, applySuggestion, copyDests, pasteDests, snapshotDests, restoreDests } from '../../src/core/destinations.js';

const stop = (name) => ({ name, stopId: `NSR:Quay:${name}`, bold: false, sep: false, isDwellArr: false, price: null });
const cell = (time) => ({ time, dayOffset: 0, suffix: '', interchange: null });
const d = (text, vias = []) => ({ text, vias });

/** Stops with names, one column per list of timed rows. */
function gridOf(names, ...timed) {
  const stops = names.map(stop);
  const cols = (timed.length ? timed : [names.map((_, i) => i)]).map((rows) => ({ dayCode: 'D', cells: stops.map((_, i) => (rows.includes(i) ? cell(`07${10 + i}`) : null)) }));
  const grid = /** @type {any} */ ({ stops, cols });
  normalizeDests(grid);
  return grid;
}
const ABCD = ['Alfa S', 'Beta', 'Ceta', 'Delta S'];

describe('setting destinations', () => {
  it('sets the start on the first served row and changes further down', () => {
    const g = gridOf(ABCD), col = g.cols[0];
    expect(setDestAt(g, col, 0, d('C'))).toBe(true);
    expect(col.dest).toEqual(d('C'));
    expect(setDestAt(g, col, 1, d('D'))).toBe(true);
    expect(col.dests[1]).toEqual(d('D'));
  });

  it('refuses the last served row and a row the trip does not serve', () => {
    const g = gridOf(ABCD, [0, 2, 3]), col = g.cols[0];
    expect(setDestAt(g, col, 3, d('X'))).toBe(false);
    expect(setDestAt(g, col, 1, d('X'))).toBe(false);
    expect(col.dests.every((x) => x === null)).toBe(true);
  });

  it('removes a change that equals the destination already in effect', () => {
    const g = gridOf(ABCD), col = g.cols[0];
    setDestAt(g, col, 0, d('C'));
    setDestAt(g, col, 1, d('D'));
    setDestAt(g, col, 1, d('C'));
    expect(col.dests[1]).toBe(null);
  });

  it('removes the start or a change with null', () => {
    const g = gridOf(ABCD), col = g.cols[0];
    setDestAt(g, col, 0, d('C'));
    setDestAt(g, col, 1, d('D'));
    setDestAt(g, col, 1, null);
    setDestAt(g, col, 0, null);
    expect(col.dest).toBe(null);
    expect(col.dests[1]).toBe(null);
  });
});

describe('moving a change', () => {
  it('moves to another served row, never to the last or the first', () => {
    const g = gridOf(ABCD), col = g.cols[0];
    col.dest = d('Delta');
    col.dests[1] = d('Ceta');
    expect(moveChange(g, col, 1, 2)).toBe(true);
    expect(col.dests[2]).toEqual(d('Ceta'));
    expect(col.dests[1]).toBe(null);
    expect(moveChange(g, col, 2, 3)).toBe(false);
    expect(moveChange(g, col, 2, 0)).toBe(false);
    expect(col.dests[2]).toEqual(d('Ceta'));
  });

  it('replaces a change it is dropped on', () => {
    const g = gridOf(['A', 'B', 'C', 'D', 'E']), col = g.cols[0];
    col.dest = d('E');
    col.dests[1] = d('X');
    col.dests[2] = d('Y');
    moveChange(g, col, 1, 2);
    expect(col.dests[2]).toEqual(d('X'));
    expect(col.dests[1]).toBe(null);
  });
});

describe('shift+drag makes a via', () => {
  it('adds the stop as a via and changes to the plain destination there', () => {
    const g = gridOf(['A', 'Støren stasjon', 'Røros']), col = g.cols[0];
    col.dest = d('Røros');
    expect(viaDrag(g, col, 0, 1)).toBe(true);
    expect(col.dest).toEqual(d('Røros', ['Støren']));
    expect(col.dests[1]).toEqual(d('Røros'));
  });

  it('keeps vias in stop order', () => {
    const g = gridOf(['A', 'Beta', 'Ceta', 'Delta']), col = g.cols[0];
    col.dest = d('Delta');
    viaDrag(g, col, 0, 2);
    viaDrag(g, col, 0, 1);
    expect(col.dest.vias).toEqual(['Beta', 'Ceta']);
  });

  it('refuses the last stop', () => {
    const g = gridOf(['A', 'B', 'C']), col = g.cols[0];
    col.dest = d('C');
    expect(viaDrag(g, col, 0, 2)).toBe(false);
    expect(col.dest).toEqual(d('C'));
  });
});

describe('suggesting destinations from bold and underline', () => {
  const marked = (marks, timed) => {
    const g = timed ? gridOf(ABCD, timed) : gridOf(ABCD);
    for (const [i, m] of Object.entries(marks)) { g.stops[i].bold = m.includes('b'); g.stops[i].sep = m.includes('u'); }
    return { g, s: suggestDests(g, g.cols[0]) };
  };
  const changes = (s) => Object.fromEntries(s.dests.map((x, i) => [i, x]).filter(([, x]) => x));

  it('without marks: the last stop', () => {
    const { s } = marked({});
    expect(s.dest).toEqual(d('Delta'));
    expect(changes(s)).toEqual({});
  });

  it('bold: a via that drops off at that stop', () => {
    const { s } = marked({ 1: 'b' });
    expect(s.dest).toEqual(d('Delta', ['Beta']));
    expect(changes(s)).toEqual({ 1: d('Delta') });
  });

  it('two bold stops stack and drop off one by one', () => {
    const { s } = marked({ 1: 'b', 2: 'b' });
    expect(s.dest).toEqual(d('Delta', ['Beta', 'Ceta']));
    expect(changes(s)).toEqual({ 1: d('Delta', ['Ceta']), 2: d('Delta') });
  });

  it('underline: a new destination from that stop', () => {
    const { s } = marked({ 1: 'u' });
    expect(s.dest).toEqual(d('Beta'));
    expect(changes(s)).toEqual({ 1: d('Delta') });
  });

  it('bold and underline counts as bold', () => {
    const { s } = marked({ 1: 'bu' });
    expect(s.dest).toEqual(d('Delta', ['Beta']));
    expect(changes(s)).toEqual({ 1: d('Delta') });
  });

  it('a bold stop before an underlined one is a via of the first part', () => {
    const { s } = marked({ 1: 'b', 2: 'u' });
    expect(s.dest).toEqual(d('Ceta', ['Beta']));
    expect(changes(s)).toEqual({ 1: d('Ceta'), 2: d('Delta') });
  });

  it('ignores marks on rows the trip does not serve', () => {
    const { s } = marked({ 1: 'b' }, [0, 2, 3]);
    expect(s.dest).toEqual(d('Delta'));
    expect(changes(s)).toEqual({});
  });

  it('writes the suggestion into the column', () => {
    const g = gridOf(ABCD);
    g.stops[1].bold = true;
    applySuggestion(g, g.cols[0]);
    expect(g.cols[0].dest).toEqual(d('Delta', ['Beta']));
    expect(g.cols[0].dests[1]).toEqual(d('Delta'));
  });
});

describe('copy and paste', () => {
  it('pastes a column onto one that starts later: the start goes on its first stop, unserved changes are left out', () => {
    const g = gridOf(['A', 'B', 'C', 'D', 'E'], [0, 1, 2, 3, 4], [1, 3, 4]);
    const [src, dst] = g.cols;
    src.dest = d('E');
    src.dests[2] = d('X');
    src.dests[3] = d('Y');
    const clip = copyDests(g, src, 0, 4);
    expect(clip.start).toEqual(d('E'));
    pasteDests(g, dst, clip, 0);
    expect(dst.dest).toEqual(d('E'));
    expect(dst.dests[2]).toBe(null); // row 2 is not served by the target
    expect(dst.dests[3]).toEqual(d('Y'));
  });

  it('pastes one destination as a change further down', () => {
    const g = gridOf(ABCD);
    const col = g.cols[0];
    col.dest = d('Delta');
    pasteDests(g, col, { start: null, changes: [{ offset: 0, dest: d('Ceta') }] }, 1);
    expect(col.dests[1]).toEqual(d('Ceta'));
  });

  it('restores what was there before (undo)', () => {
    const g = gridOf(ABCD);
    const col = g.cols[0];
    col.dest = d('Delta');
    const snap = snapshotDests(g.cols);
    col.dest = d('X');
    col.dests[1] = d('Y');
    restoreDests(g.cols, snap);
    expect(col.dest).toEqual(d('Delta'));
    expect(col.dests[1]).toBe(null);
  });
});
