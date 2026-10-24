// @vitest-environment jsdom
// Copying inside Nepos carries the whole cell; Ctrl+Shift+V = Paste special with toggles (booking spec 2026-10-22).
import { describe, it, expect, beforeEach } from 'vitest';
import { loadAppMarkup } from './dom-setup.js';
import { app } from '../../src/ui/state.js';
import { initShell } from '../../src/ui/shell.js';
import { grid, initGrid, loadGrid, selectCell } from '../../src/ui/grid.js';
import { initFootnoteEditor } from '../../src/ui/footnote-editor.js';
import { newRouteState } from '../../src/ui/route-state.js';

const stop = (name) => ({ name, stopId: null, bold: false, sep: false, isDwellArr: false, price: null });
const cell = (time, more = {}) => ({ time, dayOffset: 0, suffix: '', interchange: null, ...more });
const press = (key, opts = {}) => document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts }));
/** The paste event the browser sends after Ctrl+V, with the text Nepos copied (or text from Excel). */
const paste = (/** @type {string} */ text) => {
  const ev = new Event('paste', { bubbles: true, cancelable: true });
  /** @type {any} */ (ev).clipboardData = { getData: () => text };
  document.dispatchEvent(ev);
};
const B = { phone: '22' };

let wired = false;
beforeEach(() => {
  loadAppMarkup();
  initShell();
  initGrid();
  if (!wired) { initFootnoteEditor(); wired = true; }
  try { localStorage.clear(); } catch { /* none */ }
  app.routeState = newRouteState('no');
  loadGrid({ stops: [stop('A'), stop('B')], cols: [
    { dayCode: 'D', note: '', dates: [], cells: [cell('0700', { suffix: 'a', req: true, note: 'N', dates: [{ from: '20260101', to: '20260101', on: false }] }), cell('0710', { booking: B })] },
    { dayCode: 'D', note: '', dates: [], cells: [cell('0800', { note: 'Behold' }), cell('0810')] },
  ] });
});

describe('copying inside Nepos', () => {
  it('Ctrl+C / Ctrl+V carries time, a/p, x, booking, note and dates', () => {
    selectCell(0, 0);
    press('ArrowDown', { shiftKey: true });
    press('c', { ctrlKey: true });
    selectCell(0, 1);
    paste('0700a\n0710');
    expect(grid.cols[1].cells[0]).toMatchObject({ time: '0700', suffix: 'a', req: true, note: 'N' });
    expect(grid.cols[1].cells[0].dates).toHaveLength(1);
    expect(grid.cols[1].cells[1]).toMatchObject({ time: '0710', booking: B });
    expect(grid.cols[1].cells[1].booking).not.toBe(grid.cols[0].cells[1].booking);
  });

  it('text from outside carries times and a/p only; an x is ignored and the target keeps its own', () => {
    grid.cols[1].cells[0].req = true;
    selectCell(0, 1);
    paste('0605x\t');
    expect(grid.cols[1].cells[0]).toMatchObject({ time: '0605', suffix: '', req: true, note: 'Behold' });
  });
});

describe('paste special', () => {
  it('with only "booking / request stop" on, changes those and leaves times and notes', () => {
    selectCell(0, 0);
    press('c', { ctrlKey: true });
    selectCell(0, 1);
    press('V', { ctrlKey: true, shiftKey: true });
    const toggles = [...document.querySelectorAll('.ps-part')].map((x) => /** @type {HTMLElement} */ (x).dataset.v);
    expect(toggles).toEqual(['times', 'boarding', 'booking', 'notes']);
    for (const el of document.querySelectorAll('.ps-part input')) /** @type {HTMLInputElement} */ (el).checked = /** @type {HTMLElement} */ (el.closest('.ps-part')).dataset.v === 'booking';
    /** @type {HTMLElement} */ (document.querySelector('.fb-apply')).click();
    expect(grid.cols[1].cells[0]).toMatchObject({ time: '0800', suffix: '', req: true, note: 'Behold' });
  });

  it('remembers the last choice', () => {
    selectCell(0, 0);
    press('c', { ctrlKey: true });
    selectCell(0, 1);
    press('V', { ctrlKey: true, shiftKey: true });
    for (const el of document.querySelectorAll('.ps-part input')) /** @type {HTMLInputElement} */ (el).checked = /** @type {HTMLElement} */ (el.closest('.ps-part')).dataset.v === 'notes';
    /** @type {HTMLElement} */ (document.querySelector('.fb-apply')).click();
    press('V', { ctrlKey: true, shiftKey: true });
    const on = [...document.querySelectorAll('.ps-part')].filter((x) => /** @type {HTMLInputElement} */ (x.querySelector('input')).checked).map((x) => /** @type {HTMLElement} */ (x).dataset.v);
    expect(on).toEqual(['notes']);
  });

  it('the note row: Ctrl+C / Ctrl+V carries the trip booking too, and paste special offers note, dates, booking', () => {
    grid.cols[0].booking = { url: 'https://t.no' };
    grid.cols[0].note = 'Tur';
    const fn = (/** @type {number} */ ci) => /** @type {HTMLElement} */ (document.querySelector(`.g-fn-cell[data-ci="${ci}"]`));
    fn(0).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    press('c', { ctrlKey: true });
    fn(1).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    press('V', { ctrlKey: true, shiftKey: true });
    expect([...document.querySelectorAll('.ps-part')].map((x) => /** @type {HTMLElement} */ (x).dataset.v)).toEqual(['note', 'dates', 'booking']);
    for (const el of document.querySelectorAll('.ps-part input')) /** @type {HTMLInputElement} */ (el).checked = /** @type {HTMLElement} */ (el.closest('.ps-part')).dataset.v === 'booking';
    /** @type {HTMLElement} */ (document.querySelector('.fb-apply')).click();
    expect(grid.cols[1].booking).toEqual({ url: 'https://t.no' });
    expect(grid.cols[1].note).toBe('');
    fn(1).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    press('v', { ctrlKey: true });
    expect(grid.cols[1].note).toBe('Tur');
  });
});
