// @vitest-environment jsdom
// The Virtual intervals tool (power tools spec 2026-10-24): drag a column right; step 1 opens a dialog, 2–7 make a band
// of 1–6 columns, more asks how often; the end column's jog moves the last departure by the interval; Unpack.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadAppMarkup } from './dom-setup.js';
import { app } from '../../src/ui/state.js';
import { initShell } from '../../src/ui/shell.js';
import { grid, initGrid, loadGrid, gridData, selectCell } from '../../src/ui/grid.js';
import { initFootnoteEditor } from '../../src/ui/footnote-editor.js';
import { initPowerTools, setTool } from '../../src/ui/power-tools.js';
import { newRouteState } from '../../src/ui/route-state.js';
import { DRAG_STEP_PX } from '../../src/ui/interval-tool.js';

const stop = (name) => ({ name, stopId: null, bold: false, sep: false, isDwellArr: false, price: null });
const cell = (time) => ({ time, dayOffset: 0, suffix: '', interchange: null });
const col = (t0, t1, more = {}) => ({ dayCode: 'D', note: '', dates: [], uid: crypto.randomUUID(), cells: [t0 ? cell(t0) : null, t1 ? cell(t1) : null], ...more });
const td = (/** @type {number} */ r, /** @type {number} */ c) => /** @type {HTMLElement} */ (document.querySelector(`td[data-r="${r}"][data-c="${c}"]`));
/** Drag cell (r, c) `steps` column widths to the right (negative: left) and let go. */
const drag = (/** @type {number} */ r, /** @type {number} */ c, /** @type {number} */ steps, drop = true) => {
  td(r, c).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientX: 100 }));
  document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 100 + steps * DRAG_STEP_PX }));
  if (drop) document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 100 + steps * DRAG_STEP_PX }));
};
const virt = () => grid.cols.map((c) => c.virt ?? '');
const saved = () => gridData().cols;

let wired = false;
beforeEach(() => {
  loadAppMarkup();
  initShell();
  initGrid();
  initPowerTools();
  if (!wired) { initFootnoteEditor(); wired = true; }
  app.routeState = newRouteState('no');
  loadGrid({ stops: [stop('A'), stop('B')], cols: [col('0605', '0625'), col('0900', '0910')] });
  setTool('intervals');
  window.confirm = () => true;
});

describe('the Virtual intervals tool', () => {
  it('dragging 3 steps makes a half-hourly block for two hours; the column on the right moves along', () => {
    drag(1, 0, 3);
    expect(saved()[0].block).toEqual({ every: 30, span: 120 });
    expect(virt()).toEqual(['', 'band', 'band', 'end', '']);
    expect(grid.cols[4].cells[0].time).toBe('0900');
  });

  it('while dragging, only the top departures are drawn', () => {
    drag(0, 0, 2, false);
    expect(td(0, 2).textContent).toBe('0805');
    expect(td(1, 2).textContent).toBe('');
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 100 + 2 * DRAG_STEP_PX }));
    expect(td(1, 2).textContent).toBe('0825');
  });

  it('at step 1 a hint says that dropping opens the dialog; it goes when the drag ends', () => {
    drag(0, 0, 1, false);
    expect(document.querySelector('.iv-drop-hint')).not.toBeNull();
    expect(td(0, 0).classList.contains('g-blk-pending')).toBe(true);
    drag(0, 0, 0, false);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 100 }));
    expect(document.querySelector('.iv-drop-hint')).toBeNull();
  });

  it('the drag stops one step past six band columns, with a hint that letting go there asks how often', () => {
    drag(0, 0, 12, false);
    expect(virt()).toEqual(['', 'band', 'band', 'band', 'band', 'band', 'band', 'end', '']); // every 10 min, not more
    expect(document.querySelector('.iv-drop-hint')?.textContent).toMatch(/10/);
    expect(td(0, 7).classList.contains('g-blk-pending')).toBe(true);
    drag(0, 0, 0, false);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 100 + 7 * DRAG_STEP_PX }));
    expect(document.querySelector('.iv-drop-hint')).toBeNull();
    expect(document.querySelector('.iv-often')).toBeNull(); // step 7 is a band: no question
  });

  it('a column can be dragged by its day code too', () => {
    const dcCell = /** @type {HTMLElement} */ (document.querySelector('.g-dc-cell[data-ci="0"]'));
    dcCell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientX: 100 }));
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 100 + 3 * DRAG_STEP_PX }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 100 + 3 * DRAG_STEP_PX }));
    expect(saved()[0].block).toEqual({ every: 30, span: 120 });
  });

  it('the end jog keeps its turn when the table is redrawn', () => {
    drag(0, 0, 3);
    const dot = () => document.querySelector('.g-dc-cell[data-ci="3"] .jd-dot');
    const before = `${dot()?.getAttribute('cx')},${dot()?.getAttribute('cy')}`;
    /** @type {HTMLElement} */ (document.querySelector('.g-dc-cell[data-ci="3"] .jd')).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    selectCell(1, 0); // a redraw
    expect(`${dot()?.getAttribute('cx')},${dot()?.getAttribute('cy')}`).not.toBe(before);
  });

  it('band and end cells show the first trip\'s marks: a/p, x and the note letter', () => {
    const cols = saved();
    Object.assign(cols[0].cells[1], { suffix: 'p', req: true, note: 'Merk' });
    cols[0].cells.push(cell('0640')); // a stop after it: a and p only on the stops in between
    cols[0].block = { every: 30, span: 120 };
    cols.splice(1, 1);
    loadGrid({ stops: [stop('A'), stop('B'), stop('C')], cols });
    const marks = (/** @type {number} */ c) => td(1, c).querySelector('.g-m')?.textContent;
    expect(marks(0)).toBe('pxb');
    expect(marks(1)).toBe('pxb');
    expect(marks(3)).toBe('pxb');
    expect(td(1, 1).querySelector('.g-t')?.textContent).toBe('55');
  });

  it('the day-code row shows the block as a line, ending at the end column', () => {
    drag(0, 0, 3);
    setTool('');
    expect(document.querySelector('.g-dc-cell[data-ci="0"]')?.classList.contains('g-blk-dc-start')).toBe(true);
    expect(document.querySelector('.g-dc-cell[data-ci="1"]')?.classList.contains('g-blk-dc')).toBe(true);
    expect(document.querySelector('.g-dc-cell[data-ci="3"]')?.classList.contains('g-blk-dc-end')).toBe(true);
  });

  it('the redraw after the end jog waits while the dial is still held', () => {
    vi.useFakeTimers();
    try {
      drag(0, 0, 3);
      const dial = /** @type {HTMLElement} */ (document.querySelector('.g-dc-cell[data-ci="3"] .jd'));
      document.body.classList.add('scrubbing'); // the mouse holds the dial
      dial.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      vi.advanceTimersByTime(2000);
      expect(dial.isConnected).toBe(true);
      document.body.classList.remove('scrubbing');
      vi.advanceTimersByTime(1000);
      expect(dial.isConnected).toBe(false); // redrawn once let go
    } finally { vi.useRealTimers(); }
  });

  it('dropping at step 1 opens the dialog: OK makes the block, an off-band last departure is refused', () => {
    drag(0, 0, 1);
    const box = /** @type {HTMLElement} */ (document.querySelector('.iv-box'));
    expect(box).not.toBeNull();
    /** @type {HTMLSelectElement} */ (box.querySelector('.iv-every')).value = '2';
    const last = /** @type {HTMLInputElement} */ (box.querySelector('.iv-last'));
    last.value = '16:02';
    /** @type {HTMLElement} */ (box.querySelector('.fb-apply')).click();
    expect(saved()[0].block).toBeUndefined();
    expect(box.querySelector('.iv-err')?.textContent).not.toBe('');
    last.value = '16:05';
    /** @type {HTMLElement} */ (box.querySelector('.fb-apply')).click();
    expect(saved()[0].block).toEqual({ every: 2, span: 600 });
    expect(virt()).toEqual(['', 'band', 'end', '']); // collapsed
  });

  it('dragging past 7 steps asks how often', () => {
    drag(0, 0, 9);
    const btn = /** @type {HTMLElement} */ (document.querySelector('.iv-often [data-every="5"]'));
    btn.click();
    expect(saved()[0].block).toEqual({ every: 5, span: 120 });
  });

  it('dragging back onto the parent removes the block; dragging the end changes the band', () => {
    drag(0, 0, 3);
    drag(0, 3, 1); // the end, one step further: three band columns
    expect(saved()[0].block.every).toBe(20);
    drag(0, 4, -4); // the end back onto the parent
    expect(saved()[0].block).toBeUndefined();
    expect(virt()).toEqual(['', '']);
  });

  it('the end column\'s jog moves the last departure by the interval, within the limits', () => {
    drag(0, 0, 3);
    const jog = /** @type {HTMLElement} */ (document.querySelector('.g-dc-cell[data-ci="3"] .jd'));
    jog.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(saved()[0].block.span).toBe(150);
    expect(td(0, 3).textContent).toBe('0835');
    const jog2 = /** @type {HTMLElement} */ (document.querySelector('.g-dc-cell[data-ci="3"] .jd'));
    jog2.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    jog2.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(saved()[0].block.span).toBe(90); // shorter blocks are allowed now: at least an hour, or two intervals (user 2026-10-24)
  });

  it('review I-6: a cancelled dialog gives the old block back, and a band reached again keeps the old last departure', () => {
    const cols = saved();
    cols[0].block = { every: 30, span: 990 };
    loadGrid({ stops: [stop('A'), stop('B')], cols });
    drag(0, 3, -2); // the end onto step 1
    /** @type {HTMLElement} */ (document.querySelector('.iv-box .fb-cancel')).click();
    expect(saved()[0].block).toEqual({ every: 30, span: 990 });
    td(0, 3).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientX: 100 }));
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 100 - 2 * DRAG_STEP_PX }));
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 100 }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 100 }));
    expect(saved()[0].block).toEqual({ every: 30, span: 990 });
  });

  it('review I-6: a small nudge of a collapsed block\'s end does not turn it into another block', () => {
    const cols = saved();
    cols[0].block = { every: 5, span: 300 };
    loadGrid({ stops: [stop('A'), stop('B')], cols });
    drag(0, 2, -1);
    expect(saved()[0].block).toEqual({ every: 10, span: 300 });
    drag(0, 7, 1); // now every 10 min: parent, six band columns, end at 7; one step further asks
    /** @type {HTMLElement} */ (document.querySelector('.iv-often [data-every="5"]')).click();
    expect(saved()[0].block).toEqual({ every: 5, span: 300 });
  });

  it('a column with an interchange cannot become a block', () => {
    const cols = saved();
    cols[0].cells[0].interchange = { targetC: 1, targetR: 0, type: 'guaranteed' };
    loadGrid({ stops: [stop('A'), stop('B')], cols });
    drag(0, 0, 3);
    expect(saved()[0].block).toBeUndefined();
  });

  it('Unpack makes real columns with the generated ids', () => {
    drag(0, 0, 3);
    selectCell(0, 0);
    /** @type {HTMLElement} */ (document.querySelector('#power-tools .pt-unpack')).click();
    const cols = saved();
    expect(cols.map((c) => c.cells[0]?.time)).toEqual(['0605', '0635', '0705', '0735', '0805', '0900']);
    expect(cols[0].block).toBeUndefined();
    expect(cols[1].uid).toMatch(/^[0-9a-f-]{36}$/);
    expect(virt().every((v) => v === '')).toBe(true);
  });
});
