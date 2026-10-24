// @vitest-environment jsdom
// Marks on a time (booking spec 2026-10-22): a/p, x (request stop or booking), one note letter. x is never typed.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadAppMarkup } from './dom-setup.js';
import { app } from '../../src/ui/state.js';
import { initShell } from '../../src/ui/shell.js';
import { grid, initGrid, loadGrid, selectCell, gridData } from '../../src/ui/grid.js';
import { initFootnoteEditor } from '../../src/ui/footnote-editor.js';
import { newRouteState } from '../../src/ui/route-state.js';

const stop = (name) => ({ name, stopId: null, bold: false, sep: false, isDwellArr: false, price: null });
const cell = (time, more = {}) => ({ time, dayOffset: 0, suffix: '', interchange: null, ...more });
const press = (key, opts = {}) => document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...opts }));
const td = (/** @type {number} */ r, /** @type {number} */ c) => /** @type {HTMLElement} */ (document.querySelector(`td[data-r="${r}"][data-c="${c}"]`));
const marks = (/** @type {number} */ r, /** @type {number} */ c) => td(r, c)?.querySelector('.g-m')?.textContent ?? '';

let wired = false;
beforeEach(() => {
  loadAppMarkup();
  initShell();
  initGrid();
  if (!wired) { initFootnoteEditor(); wired = true; }
  app.routeState = newRouteState('no');
  loadGrid({ stops: [stop('A'), stop('B')], cols: [
    { dayCode: 'D', cells: [cell('0700', { suffix: 'a', req: true }), cell('0710', { suffix: 'x' })], note: '', dates: [] },
  ] });
});

describe('a/p and x on a time', () => {
  it('shows a then x', () => {
    expect(marks(0, 0)).toBe('ax');
  });

  it('turns a 2.3 x suffix into a request stop on load', () => {
    expect(grid.cols[0].cells[1]).toMatchObject({ suffix: '', req: true });
    expect(gridData().cols[0].cells[1].suffix).toBe('');
  });

  it('shows a/p, x and the note letter, with no hover text', () => {
    loadGrid({ stops: [stop('A'), stop('B')], cols: [
      { dayCode: 'D', cells: [cell('0605', { suffix: 'a', req: true, note: 'Bytt her' }), cell('0610', { dates: [{ from: '20260101', to: '20260101', on: false }] })], note: '', dates: [] },
    ] });
    expect(marks(0, 0)).toBe('axb');
    expect(marks(1, 0)).toBe('c');
    expect(td(0, 0).title).toBe('');
    expect(td(1, 0).title).toBe('');
  });

  it('keeps the request stop when the time is typed again', () => {
    selectCell(0, 0);
    for (const k of ['0', '7', '0', '5', 'p']) press(k);
    press('Enter');
    expect(grid.cols[0].cells[0]).toMatchObject({ time: '0705', suffix: 'p', req: true });
  });
});
