// Destinations in ERN (destination displays spec): #DST per distinct destination, before the table
// sets; #DSK where a trip's destination starts or changes, after the notes and dates of its table.
import { describe, it, expect } from 'vitest';
import { parseERN } from '../../../src/core/ern/parse.js';
import { serializeERN } from '../../../src/core/ern/serialize.js';

const OPTS = { delivery: { name: 'T', codespace: 'TST' }, orgs: [] };
const d = (text, vias = []) => ({ text, vias });

/** A route file with one table: the given stops, one column per list of times, and extra lines. */
function file({ head = [], tail = [], times = [['0700', '0710', '0720']] } = {}) {
  const names = ['Alfa', 'Beta', 'Ceta'];
  const lines = ['#LEV;T;TST', '#RUT;-1;1;Linje;;6;', '#SEK;-1;;0;0;0;0', ...head, '#TRA;Fram', '#PER;;;;;;', '#TAB;0;;;;'];
  times.forEach((_, ci) => lines.push(`#TUR;${ci};D;0;0;0;0`));
  names.forEach((n, ri) => {
    lines.push(`#TRL;${ri};NSR:Quay:${ri + 1};${n};0;-1;-1;-1;0;-1`);
    times.forEach((col, ci) => { if (col[ri]) lines.push(`#TRC;${ci};${col[ri]};0;0;0;0;0`); });
  });
  return [...lines, ...tail].join('\r\n') + '\r\n';
}
const colOf = (rs, ci = 0) => /** @type {any} */ (Object.values(rs.grids)[0]).cols[ci];

describe('reading destinations', () => {
  it('reads the start, a change and the vias, in Bokmål only', () => {
    const rs = parseERN(file({
      head: ['#DST;1;Beta;', '#DST;2;Ceta;;1', '#DST;2;Seta;eng', '#DST;3;Ceta;'],
      tail: ['#DSK;0;0;;2', '#DSK;0;1;;3'],
    }));
    expect(colOf(rs).dest).toEqual(d('Ceta', ['Beta']));
    expect(colOf(rs).dests).toEqual([null, d('Ceta'), null]);
  });

  it('skips a via that points back to its own record', () => {
    const rs = parseERN(file({ head: ['#DST;1;Ceta;;1'], tail: ['#DSK;0;0;;1'] }));
    expect(colOf(rs).dest).toEqual(d('Ceta'));
  });

  it('takes the first #DSK of a column as its start, wherever it is', () => {
    const rs = parseERN(file({ head: ['#DST;1;Ceta;'], tail: ['#DSK;0;1;;1'] }));
    expect(colOf(rs).dest).toEqual(d('Ceta'));
    expect(colOf(rs).dests).toEqual([null, null, null]);
  });

  it('ignores a #DSK with only a sign', () => {
    const rs = parseERN(file({ tail: ['#DSK;0;0;5;'] }));
    expect(colOf(rs).dest).toBe(null);
  });

  it('gives a file without destinations empty ones', () => {
    const rs = parseERN(file());
    expect(colOf(rs).dest).toBe(null);
    expect(colOf(rs).dests).toEqual([null, null, null]);
  });
});

describe('writing destinations', () => {
  it('writes each destination once, a via before its user, and reads it back', () => {
    const rs = parseERN(file({ times: [['0700', '0710', '0720'], ['0800', '0810', '0820']] }));
    colOf(rs, 0).dest = d('Ceta', ['Beta']);
    colOf(rs, 0).dests[1] = d('Ceta');
    colOf(rs, 1).dest = d('Ceta', ['Beta']);
    const text = serializeERN(rs, 'r', OPTS);
    const dst = text.split('\r\n').filter((l) => l.startsWith('#DST'));
    expect(dst).toEqual(['#DST;1;Beta;', '#DST;2;Ceta;;1', '#DST;3;Ceta;']);
    expect(text.indexOf('#DST')).toBeLessThan(text.indexOf('#TRA'));
    expect(text).toContain('#DSK;0;0;;2\r\n#DSK;0;1;;3\r\n#DSK;1;0;;2');
    const again = parseERN(text);
    expect(colOf(again, 0).dest).toEqual(d('Ceta', ['Beta']));
    expect(colOf(again, 0).dests[1]).toEqual(d('Ceta'));
    expect(colOf(again, 1).dest).toEqual(d('Ceta', ['Beta']));
  });

  it('leaves out a change on the last stop', () => {
    const rs = parseERN(file());
    colOf(rs).dest = d('Ceta');
    colOf(rs).dests[2] = d('X');
    const text = serializeERN(rs, 'r', OPTS);
    expect(text).not.toContain('X');
    expect(text).not.toContain('#DSK;0;2');
  });

  it('writes the start on the first stop the trip serves now', () => {
    const rs = parseERN(file({ head: ['#DST;1;Ceta;'], tail: ['#DSK;0;1;;1'], times: [['', '0710', '0720']] }));
    colOf(rs).cells[0] = { time: '0700', dayOffset: 0, suffix: '', interchange: null };
    expect(serializeERN(rs, 'r', OPTS)).toContain('#DSK;0;0;;1');
  });

  it('writes no #DSK for a trip without a destination', () => {
    expect(serializeERN(parseERN(file()), 'r', OPTS)).not.toMatch(/#DS[KT]/);
  });
});
