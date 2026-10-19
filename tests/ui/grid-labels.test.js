// @vitest-environment jsdom
// The label row (62): a planner's label per column, chosen from the project's list, in its colour.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadAppMarkup } from './dom-setup.js';
import { app } from '../../src/ui/state.js';
import { initShell } from '../../src/ui/shell.js';
import { grid, initGrid, loadGrid, gridData } from '../../src/ui/grid.js';
import { initFootnoteEditor } from '../../src/ui/footnote-editor.js';
import { newRouteState } from '../../src/ui/route-state.js';

const stop = (name) => ({ name, stopId: null, bold: false, sep: false, isDwellArr: false, price: null });
const cell = (time) => ({ time, dayOffset: 0, suffix: '', interchange: null });
const press = (key, opts = {}) => document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...opts }));
const down = (el, opts = {}) => el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, ...opts }));
const lb = (/** @type {number} */ ci) => /** @type {HTMLElement} */ (document.querySelector(`.g-lb-cell[data-ci="${ci}"]`));

let wired = false;
beforeEach(() => {
  loadAppMarkup();
  initShell();
  initGrid();
  if (!wired) { initFootnoteEditor(); wired = true; }
  app.routeState = newRouteState('no');
  app.labels = [{ id: 'a', name: 'Rush', colour: '#c0392b' }, { id: 'b', name: 'Normal', colour: '#2e8b57' }];
  loadGrid({ stops: [stop('A'), stop('B')], cols: [{ dayCode: 'D', cells: [cell('0700'), cell('0710')], label: 'Rush' }, { dayCode: 'D', cells: [cell('0800'), cell('0810')] }], labelRow: true });
});

describe('the label row', () => {
  it('shows each column\'s label in its colour', () => {
    expect(lb(0).textContent).toBe('Rush');
    expect(/** @type {HTMLElement} */ (lb(0).querySelector('.g-lb-chip')).style.background).toMatch(/192, 57, 43|#c0392b/);
    expect(lb(1).textContent).toBe('');
  });

  it('is shown and hidden from the day-code menu', () => {
    loadGrid({ stops: [stop('A')], cols: [{ dayCode: 'D', cells: [cell('0700')] }] });
    expect(document.querySelector('.g-row-lb')).toBeNull();
    /** @type {HTMLElement} */ (document.querySelector('.g-dc-cell[data-ci="0"]')).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    expect(document.getElementById('gc-labels')?.textContent).toBe('Vis etiketter');
    /** @type {HTMLElement} */ (document.getElementById('gc-labels')).click();
    expect(document.querySelector('.g-row-lb')).not.toBeNull();
    expect(gridData().labelRow).toBe(true);
  });

  it('picks a label from the project\'s list with Enter', () => {
    down(lb(1));
    press('Enter');
    const items = [...document.querySelectorAll('.lb-pick .lb-item')].map((x) => x.textContent);
    expect(items).toEqual(['Normal', 'Rush', 'Ingen']);
    /** @type {HTMLElement} */ ([...document.querySelectorAll('.lb-pick .lb-item')][0]).dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(grid.cols[1].label).toBe('Normal');
    expect(document.querySelector('.lb-pick')).toBeNull();
  });

  it('copies a label to another column, and Delete clears it', () => {
    down(lb(0));
    press('c', { ctrlKey: true });
    down(lb(1));
    press('v', { ctrlKey: true });
    expect(grid.cols[1].label).toBe('Rush');
    press('Delete');
    expect(grid.cols[1].label).toBe('');
  });
});
