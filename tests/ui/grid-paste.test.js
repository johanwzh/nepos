// @vitest-environment jsdom
// Copy one, paste everywhere (backlog 102, spec 2026-11-04-paste-everywhere-design.md): Excel's paste in the time cells
// and in the day-code row — one onto many, a block repeated over a bigger selection, a block pasted once that grows the
// table — for copies made in Nepos and for text from Excel.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadAppMarkup } from './dom-setup.js';
import { app } from '../../src/ui/state.js';
import { initShell } from '../../src/ui/shell.js';
import { grid, initGrid, loadGrid, gridData, selectCell, selectDayCode } from '../../src/ui/grid.js';
import { initFootnoteEditor } from '../../src/ui/footnote-editor.js';
import { initPowerTools, setTool } from '../../src/ui/power-tools.js';
import { newRouteState } from '../../src/ui/route-state.js';

const stop = (name) => ({ name, stopId: null, bold: false, sep: false, isDwellArr: false, price: null });
const cell = (time, more = {}) => ({ time, dayOffset: 0, suffix: '', interchange: null, ...more });
const press = (key, opts = {}) => document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts }));
const down = (el, opts = {}) => el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, ...opts }));
const dc = (/** @type {number} */ ci) => /** @type {HTMLElement} */ (document.querySelector(`.g-dc-cell[data-ci="${ci}"]`));
const selectedDc = () => [...document.querySelectorAll('.g-dc-cell.dc-sel')].map((x) => Number(/** @type {HTMLElement} */ (x).dataset.ci));
/** The paste event the browser sends after Ctrl+V, with whatever text is on the clipboard. */
const paste = (/** @type {string} */ text) => {
  const ev = new Event('paste', { bubbles: true, cancelable: true });
  /** @type {any} */ (ev).clipboardData = { getData: () => text };
  document.dispatchEvent(ev);
};
/** Select the cells r0..r1 × c0..c1 the way the keyboard does. */
function selectRect(r0, c0, r1 = r0, c1 = c0) {
  selectCell(r0, c0);
  for (let i = r0; i < r1; i++) press('ArrowDown', { shiftKey: true });
  for (let j = c0; j < c1; j++) press('ArrowRight', { shiftKey: true });
}
/** Ctrl+C on a rectangle of cells; returns the text that goes on the clipboard with it. */
function copyRect(r0, c0, r1 = r0, c1 = c0) {
  selectRect(r0, c0, r1, c1);
  press('c', { ctrlKey: true });
  const lines = [];
  for (let r = r0; r <= r1; r++) lines.push(grid.cols.slice(c0, c1 + 1).map((c) => (c.cells[r] ? c.cells[r].time + (c.cells[r].suffix || '') : '')).join('\t'));
  return lines.join('\n');
}
/** Ctrl+C on the day codes of columns a..b; returns the text that goes on the clipboard. */
function copyDayCodes(a, b = a) {
  down(dc(a));
  if (b > a) down(dc(b), { shiftKey: true });
  press('c', { ctrlKey: true });
  return grid.cols.slice(a, b + 1).map((c) => c.dayCode).join('\t');
}
const times = (/** @type {number} */ ci) => grid.cols[ci].cells.map((c) => c?.time ?? null);
const codes = () => grid.cols.map((c) => c.dayCode);
const B = { phone: '22' };

let wired = false;
beforeEach(() => {
  loadAppMarkup();
  initShell();
  initGrid();
  initPowerTools();
  setTool('');
  if (!wired) { initFootnoteEditor(); wired = true; }
  try { localStorage.clear(); } catch { /* none */ }
  window.confirm = () => true;
  app.routeState = newRouteState('no');
  // 6 stops × 5 trips: column c, stop r = 07+c : r0; the first cell has a note and a booking
  loadGrid({
    stops: ['A', 'B', 'C', 'D', 'E', 'F'].map(stop),
    cols: [0, 1, 2, 3, 4].map((c) => ({ dayCode: 'D', note: '', dates: [], uid: crypto.randomUUID(), cells: [0, 1, 2, 3, 4, 5].map((r) => cell(`${String(7 + c).padStart(2, '0')}${r}0`, c === 0 && r === 0 ? { note: 'N', booking: B, req: true } : {})) })),
  });
});

describe('one cell onto many', () => {
  it('a cell copied in Nepos fills every selected cell, with its note and booking (each its own copy)', () => {
    const text = copyRect(0, 0);
    selectRect(1, 2, 3, 3);
    paste(text);
    for (const c of [2, 3]) for (const r of [1, 2, 3]) expect(grid.cols[c].cells[r]).toMatchObject({ time: '0700', note: 'N', req: true, booking: B });
    expect(grid.cols[2].cells[1].booking).not.toBe(grid.cols[3].cells[2].booking);
    expect(grid.cols[2].cells[1].booking).not.toBe(grid.cols[0].cells[0].booking);
    expect(times(2)).toEqual(['0900', '0700', '0700', '0700', '0940', '0950']); // outside the selection: as before
  });

  it('a time from Excel fills the selection; its trailing line break is ignored', () => {
    selectRect(0, 1, 2, 1);
    paste('0715\r\n');
    expect(times(1)).toEqual(['0715', '0715', '0715', '0830', '0840', '0850']);
    expect(grid.stops).toHaveLength(6);
    expect(grid.cols).toHaveLength(5);
  });

  it('one cell onto one cell still works', () => {
    const text = copyRect(1, 0);
    selectRect(4, 4);
    paste(text);
    expect(grid.cols[4].cells[4].time).toBe('0710');
    expect(times(3)).toEqual(['1000', '1010', '1020', '1030', '1040', '1050']);
  });

  it('an empty cell in a copied block clears its target', () => {
    grid.cols[0].cells[5] = null;
    loadGrid({ stops: grid.stops, cols: grid.cols });
    copyRect(4, 0, 5, 0); // 0740 and an empty cell
    selectRect(0, 2, 3, 2);
    paste('0740\n');
    expect(times(2)).toEqual(['0740', null, '0740', null, '0940', '0950']);
  });
});

describe('a block onto a bigger selection', () => {
  it('is repeated when the selection is a whole multiple of it', () => {
    const text = copyRect(0, 0, 1, 0); // 2 × 1
    selectRect(0, 2, 3, 3); // 4 × 2
    paste(text);
    expect(times(2).slice(0, 4)).toEqual(['0700', '0710', '0700', '0710']);
    expect(times(3).slice(0, 4)).toEqual(['0700', '0710', '0700', '0710']);
    expect(times(2).slice(4)).toEqual(['0940', '0950']);
  });

  it('a block of several columns is repeated across too', () => {
    const text = copyRect(0, 0, 0, 1); // 1 × 2: 0700 0800
    selectRect(2, 1, 2, 4); // 1 × 4
    paste(text);
    expect([1, 2, 3, 4].map((c) => grid.cols[c].cells[2].time)).toEqual(['0700', '0800', '0700', '0800']);
  });

  it('is pasted once, from the top-left corner, when the selection is not a multiple', () => {
    const text = copyRect(0, 0, 1, 0);
    selectRect(0, 2, 2, 2); // 3 rows, not a multiple of 2
    paste(text);
    expect(times(2).slice(0, 3)).toEqual(['0700', '0710', '0920']);
  });

  it('text from Excel is repeated the same way', () => {
    selectRect(0, 0, 3, 0);
    paste('0600\n0610');
    expect(times(0).slice(0, 4)).toEqual(['0600', '0610', '0600', '0610']);
    expect(grid.cols[0].cells[0]).toMatchObject({ note: 'N', req: true }); // text from outside keeps the target's marks
  });

  it('a bigger selection never grows the table', () => {
    const text = copyRect(0, 0, 1, 0);
    selectRect(4, 3, 5, 4);
    paste(text);
    expect(grid.stops).toHaveLength(6);
    expect(grid.cols).toHaveLength(5);
    expect(grid.cols[4].cells[5].time).toBe('0710');
  });
});

describe('growing the table', () => {
  it('a block copied in Nepos that hangs over the edge adds the rows and columns it needs', () => {
    const text = copyRect(0, 0, 1, 1); // 2 × 2
    selectRect(5, 4);
    paste(text);
    expect(grid.stops).toHaveLength(7);
    expect(grid.cols).toHaveLength(6);
    expect(grid.cols[4].cells[5].time).toBe('0700');
    expect(grid.cols[4].cells[6].time).toBe('0710');
    expect(grid.cols[5].cells[5].time).toBe('0800');
    expect(grid.cols[5].cells[6].time).toBe('0810');
    expect(grid.cols[5].dayCode).toBe('D');
    expect(grid.cols[5].dests).toHaveLength(7);
  });

  it('asks before adding more than 50 columns', () => {
    selectRect(0, 4);
    const asked = [];
    window.confirm = (/** @type {string} */ m) => { asked.push(m); return false; };
    paste(Array.from({ length: 60 }, () => '0800').join('\t'));
    expect(asked[0]).toContain('59');
    expect(grid.cols).toHaveLength(5);
  });
});

describe('after a paste', () => {
  it('the pasted area is selected (Delete clears exactly it)', () => {
    const text = copyRect(0, 0, 1, 0);
    selectCell(0, 4); // the selection is now somewhere else
    selectRect(2, 2, 5, 3);
    paste(text); // repeated over the whole selection
    press('Delete');
    expect(times(2)).toEqual(['0900', '0910', null, null, null, null]);
    expect(times(3)).toEqual(['1000', '1010', null, null, null, null]);
  });

  it('after a single cell is pasted the selection is that cell', () => {
    const text = copyRect(0, 0);
    selectRect(1, 2);
    paste(text);
    press('Delete');
    expect(times(2)).toEqual(['0900', null, '0920', '0930', '0940', '0950']);
  });

  it('a block pasted once leaves the whole block selected', () => {
    const text = copyRect(0, 0, 1, 1);
    selectRect(3, 2);
    paste(text);
    press('Delete');
    expect([2, 3].map((c) => times(c).slice(3, 5))).toEqual([[null, null], [null, null]]);
    expect(times(2).slice(0, 3)).toEqual(['0900', '0910', '0920']);
    expect(times(4)[3]).toBe('1130'); // outside the block
  });
});

describe('Paste special uses the same paste', () => {
  it('one cell with only the booking part onto a selection', () => {
    copyRect(0, 0);
    selectRect(1, 1, 2, 1);
    press('V', { ctrlKey: true, shiftKey: true });
    for (const el of document.querySelectorAll('.ps-part input')) /** @type {HTMLInputElement} */ (el).checked = /** @type {HTMLElement} */ (el.closest('.ps-part')).dataset.v === 'booking';
    /** @type {HTMLElement} */ (document.querySelector('.fb-apply')).click();
    expect(grid.cols[1].cells[1]).toMatchObject({ time: '0810', req: true, booking: B });
    expect(grid.cols[1].cells[2]).toMatchObject({ time: '0820', req: true, booking: B });
    expect(grid.cols[1].cells[3].req).toBeUndefined();
  });
});

describe('virtual intervals (a block of generated trips)', () => {
  const col = (t0, t1, more = {}) => ({ dayCode: 'D', note: '', dates: [], uid: crypto.randomUUID(), cells: [cell(t0), cell(t1)], ...more });
  beforeEach(() => {
    // 05:00 | 06:05 every 30 to 08:05 (band, band, end) | 09:00: columns 0 | 1 parent | 2, 3 band | 4 end | 5
    loadGrid({ stops: [stop('A'), stop('B')], cols: [col('0500', '0510'), col('0605', '0625', { block: { every: 30, span: 120 } }), col('0900', '0910')] });
  });

  it('one cell over a selection that spans the block fills the real columns; the generated ones follow their parent', () => {
    const text = copyRect(0, 0);
    selectRect(0, 1, 0, 5);
    paste(text);
    expect(gridData().cols.map((c) => c.cells[0].time)).toEqual(['0500', '0500', '0500']);
    expect(grid.cols[2].cells[0].time).toBe('0530');
    expect(grid.cols[4].cells[0].time).toBe('0700');
  });

  it('the generated columns keep their place in a block that is pasted once', () => {
    copyRect(0, 0, 0, 1); // 05:00 | 06:05
    selectCell(0, 4); // the block's end column: not written to, but its slot counts
    paste('0500\t0605');
    expect(gridData().cols.map((c) => c.cells[0].time)).toEqual(['0500', '0605', '0605']);
  });

  it('a copy made across the block carries the times as they are shown', () => {
    selectRect(0, 2, 0, 3);
    press('c', { ctrlKey: true });
    selectCell(1, 0);
    paste('0635\t0705');
    expect(grid.cols[0].cells[1].time).toBe('0635');
    expect(grid.cols[1].cells[1].time).toBe('0705');
  });

  it('day codes over a block change only the real columns', () => {
    selectDayCode(0);
    for (let i = 0; i < 5; i++) press('ArrowRight', { shiftKey: true });
    paste('DX67');
    expect(gridData().cols.map((c) => c.dayCode)).toEqual(['DX67', 'DX67', 'DX67']);
  });
});

describe('day codes', () => {
  it('a code from Excel fills every selected column', () => {
    down(dc(1));
    down(dc(3), { shiftKey: true });
    paste('DX67');
    expect(codes()).toEqual(['D', 'DX67', 'DX67', 'DX67', 'D']);
    expect(selectedDc()).toEqual([1, 2, 3]);
  });

  it('a code copied in Nepos fills every selected column', () => {
    grid.cols[0].dayCode = 'DX67';
    const text = copyDayCodes(0);
    down(dc(2));
    down(dc(4), { shiftKey: true });
    paste(text);
    expect(codes()).toEqual(['DX67', 'D', 'DX67', 'DX67', 'DX67']);
  });

  it('several codes are pasted once when the selection is not a whole multiple', () => {
    grid.cols[0].dayCode = 'DX67'; grid.cols[1].dayCode = '6';
    const text = copyDayCodes(0, 1);
    down(dc(2));
    down(dc(4), { shiftKey: true }); // 3 columns, not a multiple of 2
    paste(text);
    expect(codes()).toEqual(['DX67', '6', 'DX67', '6', 'D']);
  });

  it('several codes are repeated when the selection is a multiple', () => {
    down(dc(0));
    down(dc(3), { shiftKey: true });
    paste('D\t6');
    expect(codes()).toEqual(['D', '6', 'D', '6', 'D']);
    expect(selectedDc()).toEqual([0, 1, 2, 3]);
  });

  it('several codes pasted once that hang over the edge add columns', () => {
    down(dc(4));
    paste('6\t7\tDX67');
    expect(grid.cols).toHaveLength(7);
    expect(codes()).toEqual(['D', 'D', 'D', 'D', '6', '7', 'DX67']);
    expect(grid.cols[6].cells).toHaveLength(6);
    expect(selectedDc()).toEqual([4, 5, 6]);
  });

  it('a column of codes from Excel works too, in order', () => {
    down(dc(0));
    paste('6\r\n7\r\n');
    expect(codes()).toEqual(['6', '7', 'D', 'D', 'D']);
  });

  it('tidies the codes as typing does', () => {
    down(dc(0));
    paste('dx76');
    expect(grid.cols[0].dayCode).toBe('DX67');
  });

  it('pastes nothing when something is not a day code', () => {
    down(dc(0));
    paste('D\thei');
    paste('0800\t0900');
    expect(codes()).toEqual(['D', 'D', 'D', 'D', 'D']);
    expect(grid.cols).toHaveLength(5);
  });

  it('asks before adding more than 50 columns', () => {
    down(dc(0));
    const asked = [];
    window.confirm = (/** @type {string} */ m) => { asked.push(m); return false; };
    paste(Array.from({ length: 60 }, () => '6').join('\t'));
    expect(asked[0]).toContain('55');
    expect(grid.cols).toHaveLength(5);
  });

  it('a newer copy from Excel wins over an older one made in Nepos', () => {
    grid.cols[0].dayCode = 'DX67';
    copyDayCodes(0);
    down(dc(2));
    paste('7'); // what is on the clipboard now: something copied in Excel afterwards
    expect(codes()).toEqual(['DX67', 'D', '7', 'D', 'D']);
  });

  it('a time copied in Nepos is never pasted as a day code, although 1234 is both', () => {
    grid.cols[0].cells[1].time = '1234';
    const text = copyRect(1, 0);
    down(dc(2));
    paste(text);
    expect(codes()).toEqual(['D', 'D', 'D', 'D', 'D']);
  });

  it('day codes copied after a time still paste (the newer copy owns the clipboard)', () => {
    grid.cols[0].cells[1].time = '1234';
    copyRect(1, 0);
    grid.cols[0].dayCode = '1234';
    const text = copyDayCodes(0);
    down(dc(2));
    paste(text);
    expect(grid.cols[2].dayCode).toBe('1234');
  });

  it('an empty day code copied along with others pastes as empty', () => {
    grid.cols[1].dayCode = '';
    const text = copyDayCodes(0, 1);
    expect(text).toBe('D\t');
    down(dc(3));
    paste(text);
    expect(codes()).toEqual(['D', '', 'D', 'D', '']);
  });

  it('times pasted while the day codes are selected change nothing, and day codes pasted on times change nothing', () => {
    down(dc(1));
    paste('0900');
    expect(codes()).toEqual(['D', 'D', 'D', 'D', 'D']);
    expect(times(1)[0]).toBe('0800');
    selectCell(0, 1);
    paste('DX67\t6');
    expect(times(1)[0]).toBe('0800');
    expect(grid.cols).toHaveLength(5);
  });
});
