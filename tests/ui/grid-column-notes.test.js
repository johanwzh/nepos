// @vitest-environment jsdom
// Several day codes at once, and the note row (user 2026-10-21): select a run of columns in the day-code row
// (Shift+click, Shift+arrows) to put one note on all of them or paste a day code into all; the note row's cells can be
// selected, and Ctrl+C / Ctrl+V copies a column's note and dates to other columns.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadAppMarkup } from './dom-setup.js';
import { app } from '../../src/ui/state.js';
import { initShell } from '../../src/ui/shell.js';
import { grid, initGrid, loadGrid } from '../../src/ui/grid.js';
import { initFootnoteEditor } from '../../src/ui/footnote-editor.js';
import { newRouteState } from '../../src/ui/route-state.js';

const stop = (name) => ({ name, stopId: null, bold: false, sep: false, isDwellArr: false, price: null });
const cell = (time) => ({ time, dayOffset: 0, suffix: '', interchange: null });
const press = (key, opts = {}) => document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...opts }));
const down = (el, opts = {}) => el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, ...opts }));
const dc = (/** @type {number} */ ci) => /** @type {HTMLElement} */ (document.querySelector(`.g-dc-cell[data-ci="${ci}"]`));
const fn = (/** @type {number} */ ci) => /** @type {HTMLElement} */ (document.querySelector(`.g-fn-cell[data-ci="${ci}"]`));
const selected = (/** @type {string} */ sel) => [...document.querySelectorAll(sel)].map((x) => Number(/** @type {HTMLElement} */ (x).dataset.ci));
const typeNote = (/** @type {string} */ text) => {
  const input = /** @type {HTMLInputElement} */ (document.querySelector('.float-box .note-text'));
  input.value = text;
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
};

let wired = false;
beforeEach(() => {
  loadAppMarkup();
  initShell();
  initGrid();
  if (!wired) { initFootnoteEditor(); wired = true; }
  app.routeState = newRouteState('no');
  loadGrid({ stops: [stop('A'), stop('B')], cols: ['0700', '0800', '0900', '1000'].map((t0) => ({ dayCode: 'D', cells: [cell(t0), cell(t0.slice(0, 2) + '10')], note: '', dates: [] })) });
});

describe('several day codes at once', () => {
  it('Shift+click and Shift+arrows select a run of columns', () => {
    down(dc(1));
    down(dc(2), { shiftKey: true });
    expect(selected('.g-dc-cell.dc-sel')).toEqual([1, 2]);
    press('ArrowRight', { shiftKey: true });
    expect(selected('.g-dc-cell.dc-sel')).toEqual([1, 2, 3]);
    press('ArrowLeft'); // without Shift: one column again
    expect(selected('.g-dc-cell.dc-sel')).toHaveLength(1);
  });

  it('F7 puts one note on every selected column', () => {
    down(dc(0));
    down(dc(2), { shiftKey: true });
    press('F7');
    expect(document.querySelector('.float-box')?.textContent).toContain('3');
    typeNote('Ikke i skoleferien');
    expect(grid.cols.map((c) => c.note)).toEqual(['Ikke i skoleferien', 'Ikke i skoleferien', 'Ikke i skoleferien', '']);
  });

  it('Ctrl+V pastes a day code into every selected column', () => {
    grid.cols[0].dayCode = 'DX67';
    loadGrid({ stops: grid.stops, cols: grid.cols });
    down(dc(0));
    press('c', { ctrlKey: true });
    down(dc(1));
    down(dc(3), { shiftKey: true });
    press('v', { ctrlKey: true });
    expect(grid.cols.map((c) => c.dayCode)).toEqual(['DX67', 'DX67', 'DX67', 'DX67']);
  });
});

describe('the note row', () => {
  it('its cells can be selected, also several', () => {
    down(fn(1));
    expect(selected('.g-fn-cell.fn-sel')).toEqual([1]);
    down(fn(3), { shiftKey: true });
    expect(selected('.g-fn-cell.fn-sel')).toEqual([1, 2, 3]);
    expect(selected('.g-dc-cell.dc-sel')).toEqual([]); // one marker: the note row has it
    expect(document.querySelectorAll('#tbl td.is-anchor')).toHaveLength(0);
  });

  it('Ctrl+C copies a column\'s note and dates, Ctrl+V puts them on the selected columns', () => {
    grid.cols[0].note = 'Bytt buss';
    grid.cols[0].dates = [{ from: '20261101', to: '20261101', on: false }];
    loadGrid({ stops: grid.stops, cols: grid.cols });
    down(fn(0));
    press('c', { ctrlKey: true });
    down(fn(2));
    down(fn(3), { shiftKey: true });
    press('v', { ctrlKey: true });
    expect(grid.cols.map((c) => c.note)).toEqual(['Bytt buss', '', 'Bytt buss', 'Bytt buss']);
    expect(grid.cols[3].dates).toEqual(grid.cols[0].dates);
    expect(grid.cols[3].dates).not.toBe(grid.cols[0].dates); // its own copy
    expect(grid.cols[0].dayCode).toBe('D');
  });

  it('typing in the note row does not change a day code; Enter edits the note of every selected column', () => {
    down(fn(0));
    down(fn(1), { shiftKey: true });
    press('X');
    expect(grid.cols[0].dayCode).toBe('D');
    press('Enter');
    typeNote('Ekstra');
    expect(grid.cols.map((c) => c.note)).toEqual(['Ekstra', 'Ekstra', '', '']);
  });

  it('a double-click on a note cell opens its note', () => {
    down(fn(2), { detail: 2 });
    expect(document.querySelector('.float-box .note-text')).not.toBeNull();
  });

  it('down from the note row goes to the day codes, and clicking a time leaves it', () => {
    down(fn(1));
    press('ArrowDown');
    expect(selected('.g-dc-cell.dc-sel')).toEqual([1]);
    expect(selected('.g-fn-cell.fn-sel')).toEqual([]);
    down(fn(1));
    down(/** @type {HTMLElement} */ (document.querySelector('[data-r="0"][data-c="0"]')));
    expect(selected('.g-fn-cell.fn-sel')).toEqual([]);
  });
});
