// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { loadAppMarkup } from './dom-setup.js';
import { app } from '../../src/ui/state.js';
import { initShell, setPage, currentPage } from '../../src/ui/shell.js';
import { grid, initGrid, loadGrid, onGridChange, gridData, selectedStopRow } from '../../src/ui/grid.js';
import { initFootnoteEditor } from '../../src/ui/footnote-editor.js';
import { newRouteState } from '../../src/ui/route-state.js';

const stop = (name, stopId = null) => ({ name, stopId, bold: false, sep: false, isDwellArr: false, price: null });
const cell = (time) => ({ time, dayOffset: 0, suffix: '', interchange: null, footnoteId: null });
const press = (key, opts = {}) => document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...opts }));
const typeKeys = (s) => [...s].forEach((k) => press(k));
const cellText = (r, c) => document.querySelector(`[data-r="${r}"][data-c="${c}"]`)?.textContent;

let changes = 0;
let initialised = false;

beforeEach(() => {
  loadAppMarkup();
  initShell();
  if (!initialised) { initGrid(); initFootnoteEditor(); initialised = true; }
  app.routeState = newRouteState('no');
  changes = 0;
  onGridChange(() => { changes++; });
  loadGrid({
    stops: [stop('Sentrum', 'NSR:Quay:7203'), stop('Flyplass')],
    cols: [{ dayCode: 'DX67', footnote: '', footnoteId: null, cells: [cell('0700'), cell('0745')] }],
  }, { readOnly: false });
});

describe('grid', () => {
  it('shows the stops and times', () => {
    expect(document.getElementById('tbl').textContent).toContain('Sentrum');
    expect(cellText(0, 0)).toBe('0700');
    expect(cellText(1, 0)).toBe('0745');
  });

  it('marks a stop without an ID, not one with an NSR Quay ID', () => {
    const names = [...document.querySelectorAll('.g-td-name')];
    expect(names[0].classList.contains('stop-unlinked')).toBe(false);
    expect(names[1].classList.contains('stop-unlinked')).toBe(true);
  });

  it('edits a time with the keyboard and reports the change', () => {
    typeKeys('0800');
    press('Enter');
    expect(grid.cols[0].cells[0].time).toBe('0800');
    expect(cellText(0, 0)).toBe('0800');
    expect(changes).toBeGreaterThan(0);
  });

  it('keeps the old time when the input is not a valid time', () => {
    typeKeys('99');
    press('Enter');
    expect(grid.cols[0].cells[0].time).toBe('0700');
  });

  it('keeps the old day code when the input is not valid', () => {
    press('ArrowUp'); // from row 0 into the day-code row
    press('Enter');
    typeKeys('X9');
    press('Enter');
    expect(grid.cols[0].dayCode).toBe('DX67');
  });

  it('changes nothing in read-only mode', () => {
    loadGrid(gridData(), { readOnly: true });
    changes = 0;
    typeKeys('0800');
    press('Enter');
    press('Delete');
    expect(grid.cols[0].cells[0].time).toBe('0700');
    expect(changes).toBe(0);
    expect(document.querySelectorAll('.g-ibtn')).toHaveLength(0);
  });

  it('selects the new row\'s stop cell when a row is added (no name box until asked for)', () => {
    document.querySelector('.g-row-bot .g-ibtn').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(grid.stops).toHaveLength(3);
    expect(selectedStopRow()).toBe(2);
    expect(document.querySelector('.g-stop-input')).toBeNull();
  });

  it('types into a new stop row after naming it, never into another row', () => {
    document.querySelector('.g-row-bot .g-ibtn').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    press('Enter'); // name it
    const input = /** @type {HTMLInputElement} */ (document.querySelector('.g-stop-input'));
    input.value = 'Ny holdeplass';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    press('ArrowRight'); // from the new row's name into its first time
    typeKeys('0800');
    press('Enter');
    expect(grid.stops[2].name).toBe('Ny holdeplass');
    expect(grid.cols[0].cells[2]?.time).toBe('0800');
    expect(grid.cols[0].cells[0].time).toBe('0700');
  });

  it('does not switch page with F2 any more (F2 only edits a cell; views are Alt+1/2/3)', () => {
    setPage('export');
    press('F2');
    expect(currentPage()).toBe('export');
    expect(document.querySelector('.g-stop-input')).toBe(null);
    setPage('edit');
  });
});

describe('navigation like a spreadsheet (user test 2026-10-17)', () => {
  const at = (/** @type {number} */ r, /** @type {number} */ c) => /** @type {HTMLElement} */ (document.querySelector(`[data-r="${r}"][data-c="${c}"]`));
  const anchor = () => /** @type {HTMLElement} */ (document.querySelector('.is-anchor'));

  it('selects a range by click and drag', () => {
    at(0, 0).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    at(1, 0).dispatchEvent(new MouseEvent('mouseover', { bubbles: true, buttons: 1 }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    expect(at(1, 0).classList.contains('in-range')).toBe(true); // the anchor stays marked as the anchor
    at(0, 0).dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); // after release: nothing changes
    expect(at(1, 0).classList.contains('in-range')).toBe(true);
  });

  it('goes from the day-code row down to the first row, wherever the marker was before', () => {
    at(1, 0).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    /** @type {HTMLElement} */ (document.querySelector('.g-dc-cell[data-ci="0"]')).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    press('ArrowDown');
    expect(anchor().dataset.r).toBe('0');
  });
});

describe('interpolating times (user test 2026-10-17)', () => {
  const at = (/** @type {number} */ r, /** @type {number} */ c) => /** @type {HTMLElement} */ (document.querySelector(`[data-r="${r}"][data-c="${c}"]`));
  const rightClick = (/** @type {HTMLElement} */ el) => el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
  beforeEach(() => {
    initGrid(); // the menu items belong to the freshly loaded markup
    loadGrid({
      stops: [stop('A'), stop('B'), stop('C'), stop('D'), stop('E')],
      cols: [{ dayCode: 'D', footnote: '', footnoteId: null, cells: [cell('0700'), null, null, cell('0730'), null] }],
    }, { readOnly: false });
  });

  it('fills the whole column between the times typed (one cell selected), and hides extrapolation', () => {
    rightClick(at(0, 0));
    expect(/** @type {HTMLElement} */ (document.getElementById('gc-extrap-fwd')).style.display).toBe('none');
    expect(/** @type {HTMLElement} */ (document.getElementById('gc-interp')).className).toBe('gci');
    /** @type {HTMLElement} */ (document.getElementById('gc-interp')).click();
    expect([1, 2, 4].map((r) => grid.cols[0].cells[r]?.time ?? null)).toEqual(['0710', '0720', null]);
  });

  it('within a selection, only between the times inside it', () => {
    at(1, 0).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    at(4, 0).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, shiftKey: true }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    rightClick(at(2, 0));
    expect(/** @type {HTMLElement} */ (document.getElementById('gc-interp')).className).toContain('dis'); // only 0730 inside
  });
});
