// @vitest-environment jsdom
// Blocks in the grid (power tools spec 2026-10-24): parent | band | end, framed and locked; only the parent is stored.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadAppMarkup } from './dom-setup.js';
import { app } from '../../src/ui/state.js';
import { initShell } from '../../src/ui/shell.js';
import { grid, initGrid, loadGrid, gridData, selectCell, selectDayCode } from '../../src/ui/grid.js';
import { initFootnoteEditor } from '../../src/ui/footnote-editor.js';
import { initPowerTools, setTool } from '../../src/ui/power-tools.js';
import { newRouteState } from '../../src/ui/route-state.js';

const stop = (name) => ({ name, stopId: null, bold: false, sep: false, isDwellArr: false, price: null });
const cell = (time) => ({ time, dayOffset: 0, suffix: '', interchange: null });
const col = (t0, t1, more = {}) => ({ dayCode: 'D', note: '', dates: [], uid: crypto.randomUUID(), cells: [t0 ? cell(t0) : null, t1 ? cell(t1) : null], ...more });
const press = (key, opts = {}) => document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts }));
const td = (/** @type {number} */ r, /** @type {number} */ c) => /** @type {HTMLElement} */ (document.querySelector(`td[data-r="${r}"][data-c="${c}"]`));
const paste = (/** @type {string} */ text) => {
  const ev = new Event('paste', { bubbles: true, cancelable: true });
  /** @type {any} */ (ev).clipboardData = { getData: () => text };
  document.dispatchEvent(ev);
};

let wired = false;
beforeEach(() => {
  loadAppMarkup();
  initShell();
  initGrid();
  initPowerTools();
  setTool('');
  if (!wired) { initFootnoteEditor(); wired = true; }
  app.routeState = newRouteState('no');
  // 05:00 | 06:05 every 30 to 08:05 (band 35, 05; end) | 09:00
  loadGrid({ stops: [stop('A'), stop('B')], cols: [col('0500', '0510'), col('0605', '0625', { block: { every: 30, span: 120 } }), col('0900', '0910')] });
});

describe('a block in the grid', () => {
  it('shows parent | band | end, framed, and stores only the parent', () => {
    expect(grid.cols.map((c) => c.virt ?? '')).toEqual(['', '', 'band', 'band', 'end', '']);
    expect([1, 2, 3, 4].every((c) => td(0, c).classList.contains('g-blk'))).toBe(true);
    expect(td(0, 0).classList.contains('g-blk')).toBe(false);
    const saved = gridData().cols;
    expect(saved).toHaveLength(3);
    expect(saved[1].block).toEqual({ every: 30, span: 120 });
  });

  it('band cells show only the minutes; the end shows full times', () => {
    expect(td(0, 2).textContent).toBe('35');
    expect(td(0, 3).textContent).toBe('05');
    expect(td(1, 3).textContent).toBe('25');
    expect(td(0, 4).textContent).toBe('0805');
  });

  it('collapses a band under 10 minutes to one column saying how often', () => {
    loadGrid({ stops: [stop('A'), stop('B')], cols: [col('0605', '0625', { block: { every: 5, span: 120 } })] });
    expect(grid.cols.map((c) => c.virt ?? '')).toEqual(['', 'band', 'end']);
    expect(td(0, 1).textContent).toMatch(/5\. min/);
  });

  it('shows +1 on end times past midnight', () => {
    loadGrid({ stops: [stop('A'), stop('B')], cols: [col('0605', '0625', { block: { every: 30, span: 1380 } })] });
    expect(td(0, 3).textContent).toBe('0505+1');
  });

  it('band and end columns have no delete ×, and typing there does nothing', () => {
    expect(document.querySelector('.g-ibtn-del[data-ci="2"], th[data-ci="2"] .g-ibtn-del')).toBeNull();
    const heads = [...document.querySelectorAll('.g-ibtn-del')].length;
    expect(heads).toBe(2 /* rows */ + 3 /* real columns */);
    selectCell(0, 2);
    for (const k of ['1', '2', '0', '0']) press(k);
    press('Enter');
    expect(gridData().cols[1].cells[0].time).toBe('0605');
    expect(grid.cols[2].cells[0].time).toBe('0635');
  });

  it('a selection over the block changes only real columns (paste, F7 note, day code)', () => {
    selectCell(0, 0);
    paste('0400\t0400\t0400\t0400\t0400\t0400');
    expect(gridData().cols.map((c) => c.cells[0].time)).toEqual(['0400', '0400', '0400']);
    expect(grid.cols[2].cells[0].time).toBe('0430'); // the band follows its parent
    selectDayCode(3);
    press('6');
    press('Enter');
    expect(gridData().cols.map((c) => c.dayCode)).toEqual(['D', 'D', 'D']);
  });

  it('typing a new first time in the parent moves the whole block, keeping its length', () => {
    selectCell(0, 1);
    for (const k of ['0', '6', '1', '5']) press(k);
    press('Enter');
    expect(td(0, 2).textContent).toBe('45');
    expect(td(0, 4).textContent).toBe('0815');
  });

  it('a column added inside the block goes after its end; deleting the parent removes the block', () => {
    const plus = /** @type {HTMLElement[]} */ ([...document.querySelectorAll('.g-row-ins .g-ibtn')]);
    plus[3].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); // "insert left of" column 3 (a band column)
    expect(grid.cols.map((c) => c.virt ?? '')).toEqual(['', '', 'band', 'band', 'end', '', '']);
    window.confirm = () => true;
    document.querySelectorAll('.g-ibtn-del')[2 + 1].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); // the parent's ×
    expect(grid.cols.map((c) => c.virt ?? '')).toEqual(['', '', '']);
    expect(gridData().cols.some((c) => c.block)).toBe(false);
  });

  it('keeps interchanges to a column right of the block, also when a column is added on the left', () => {
    const cols = gridData().cols;
    cols[0].cells[1].interchange = { targetC: 2, targetR: 0, type: 'guaranteed' };
    loadGrid({ stops: [stop('A'), stop('B')], cols });
    expect(grid.cols[0].cells[1].interchange.targetC).toBe(5);
    document.querySelectorAll('.g-row-ins .g-ibtn')[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    const saved = gridData().cols;
    expect(saved[1].cells[1].interchange.targetC).toBe(3);
    expect(saved[3].cells[0].time).toBe('0900');
  });

  it('F7 over a selection with the block puts the note on real times only', () => {
    selectCell(0, 1);
    press('ArrowRight', { shiftKey: true });
    press('ArrowRight', { shiftKey: true });
    press('F7');
    const input = /** @type {HTMLInputElement} */ (document.querySelector('.float-box .note-text'));
    input.value = 'Merk';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(gridData().cols[1].cells[0].note).toBe('Merk');
    expect(grid.cols[2].cells[0].note).toBe('Merk'); // the band shows its parent's
  });

  it('review I-1: a problem on a column right of a block goes to that column, not into the block', async () => {
    const { goToProblem } = await import('../../src/ui/problem-nav.js');
    goToProblem(/** @type {any} */ ({ level: 'error', code: 'col-one-stop', where: { column: 3 } }));
    expect(document.querySelector('.g-dc-cell.dc-sel')?.getAttribute('data-ci')).toBe('5');
  });

  it('review I-2: no interchange from or to a block', () => {
    const ctx = (/** @type {number} */ c) => td(0, c).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    ctx(1);
    expect(document.getElementById('gc-ix-g')?.className).toContain('dis');
    ctx(3);
    expect(document.getElementById('gc-ix-g')?.className).toContain('dis');
    ctx(0);
    /** @type {HTMLElement} */ (document.getElementById('gc-ix-g')).click();
    td(0, 4).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 })); // the end column
    td(0, 1).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 })); // the parent
    expect(gridData().cols[0].cells[0].interchange).toBeNull();
  });

  it('review I-3: the jog on a band or end cell moves the parent, and so the block', () => {
    selectCell(0, 4);
    setTool('jog');
    const dial = /** @type {HTMLElement} */ (document.querySelector('#power-tools .pt-body .jd'));
    dial.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    setTool('');
    expect(gridData().cols[1].cells[0].time).toBe('0606');
    expect(td(0, 4).textContent).toBe('0806');
  });

  it('review I-4: turning a tool on finishes a half-typed time where it was typed', () => {
    selectCell(0, 0);
    for (const k of ['0', '4', '1', '5']) press(k);
    setTool('intervals');
    expect(gridData().cols[0].cells[0].time).toBe('0415');
    setTool('');
    selectCell(1, 2 + 3);
    press('Enter'); press('Escape');
    expect(gridData().cols[2].cells[1].time).toBe('0910');
  });

  it('a parent with no times keeps its block, waiting for times', () => {
    selectCell(0, 1);
    press('ArrowDown', { shiftKey: true });
    press('Delete');
    expect(gridData().cols[1].block).toEqual({ every: 30, span: 120 });
    expect(grid.cols.map((c) => c.virt ?? '')).toEqual(['', '', 'band', 'band', 'end', '']);
  });
});
