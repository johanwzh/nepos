// @vitest-environment jsdom
// The vehicle row (user 2026-10-20): a vehicle per column, chosen from the project's list, working like the label row.
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
const vh = (/** @type {number} */ ci) => /** @type {HTMLElement} */ (document.querySelector(`.g-row-vh .g-lb-cell[data-ci="${ci}"]`));
const lb = (/** @type {number} */ ci) => /** @type {HTMLElement} */ (document.querySelector(`.g-row-lb:not(.g-row-vh) .g-lb-cell[data-ci="${ci}"]`));
const dcMenu = () => /** @type {HTMLElement} */ (document.querySelector('.g-dc-cell[data-ci="0"]')).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));

let wired = false;
beforeEach(() => {
  loadAppMarkup();
  initShell();
  initGrid();
  if (!wired) { initFootnoteEditor(); wired = true; }
  app.routeState = newRouteState('no');
  app.labels = [{ id: 'a', name: 'Rush', colour: '#c0392b' }];
  app.vehicles = [{ id: 'v1', name: 'Buss 7', colour: '#2f6fb5' }, { id: 'v2', name: 'Buss 12', colour: '#d08000' }];
  loadGrid({ stops: [stop('A'), stop('B')], cols: [{ dayCode: 'D', cells: [cell('0700'), cell('0710')], label: 'Rush', vehicle: 'Buss 7' }, { dayCode: 'D', cells: [cell('0800'), cell('0810')] }],
    labelRow: true, vehicleRow: true });
});

describe('the vehicle row', () => {
  it('shows each column\'s vehicle in its colour, under the label row', () => {
    expect(vh(0).textContent).toBe('Buss 7');
    expect(/** @type {HTMLElement} */ (vh(0).querySelector('.g-lb-chip')).style.background).toMatch(/47, 111, 181|#2f6fb5/);
    expect(vh(1).textContent).toBe('');
    expect(lb(0).textContent).toBe('Rush');
    const rows = [...document.querySelectorAll('#tbl tr')];
    expect(rows.indexOf(/** @type {HTMLElement} */ (document.querySelector('.g-row-vh')))).toBeGreaterThan(rows.indexOf(/** @type {HTMLElement} */ (lb(0).closest('tr'))));
    expect(/** @type {HTMLElement} */ (document.querySelector('.g-row-vh .g-lb-label')).textContent).toBe('Kjøretøy');
  });

  it('is shown and hidden from the day-code menu, on its own', () => {
    loadGrid({ stops: [stop('A')], cols: [{ dayCode: 'D', cells: [cell('0700')] }] });
    expect(document.querySelector('.g-row-vh')).toBeNull();
    dcMenu();
    expect(document.getElementById('gc-vehicles')?.textContent).toBe('Vis kjøretøy');
    /** @type {HTMLElement} */ (document.getElementById('gc-vehicles')).click();
    expect(document.querySelector('.g-row-vh')).not.toBeNull();
    expect(document.querySelector('.g-row-lb:not(.g-row-vh)')).toBeNull();
    expect(gridData()).toMatchObject({ vehicleRow: true, labelRow: false });
  });

  it('hiding it asks first, and removes the vehicles but not the labels', () => {
    const was = window.confirm;
    window.confirm = () => true;
    try {
      dcMenu();
      expect(document.getElementById('gc-vehicles')?.textContent).toBe('Skjul kjøretøy');
      /** @type {HTMLElement} */ (document.getElementById('gc-vehicles')).click();
    } finally { window.confirm = was; }
    expect(document.querySelector('.g-row-vh')).toBeNull();
    expect(grid.cols[0]).toMatchObject({ vehicle: '', label: 'Rush' });
  });

  it('picks a vehicle from the project\'s list with Enter', () => {
    down(vh(1));
    press('Enter');
    const items = [...document.querySelectorAll('.lb-pick .lb-item')].map((x) => x.textContent);
    expect(items).toEqual(['Buss 12', 'Buss 7', 'Ingen']);
    /** @type {HTMLElement} */ ([...document.querySelectorAll('.lb-pick .lb-item')][0]).dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(grid.cols[1].vehicle).toBe('Buss 12');
    expect(grid.cols[1].label ?? '').toBe('');
  });

  it('says where to add vehicles when there are none', () => {
    app.vehicles = [];
    down(vh(1));
    press('Enter');
    expect(document.querySelector('.lb-pick .lb-hint')?.textContent).toMatch(/Ressurser/);
  });

  it('copies a vehicle to another column, and Delete clears it; labels are left alone', () => {
    down(lb(0));
    press('c', { ctrlKey: true }); // a label on the clipboard must not be pasted as a vehicle
    down(vh(0));
    press('c', { ctrlKey: true });
    down(vh(1));
    press('v', { ctrlKey: true });
    expect(grid.cols[1].vehicle).toBe('Buss 7');
    expect(grid.cols[1].label ?? '').toBe('');
    press('Delete');
    expect(grid.cols[1].vehicle).toBe('');
    expect(grid.cols[0].label).toBe('Rush');
  });

  it('the arrow keys move between the label and vehicle rows', () => {
    down(lb(1));
    press('ArrowDown');
    expect(vh(1).classList.contains('lb-sel')).toBe(true);
    expect(lb(1).classList.contains('lb-sel')).toBe(false);
    press('ArrowUp');
    expect(lb(1).classList.contains('lb-sel')).toBe(true);
    press('ArrowUp'); // on to the day codes
    expect(document.querySelector('.lb-sel')).toBeNull();
  });

  it('a vehicle no longer in the list is shown in grey', () => {
    app.vehicles = [];
    loadGrid({ stops: [stop('A')], cols: [{ dayCode: 'D', cells: [cell('0700')], vehicle: 'Buss 99' }], vehicleRow: true });
    expect(/** @type {HTMLElement} */ (vh(0).querySelector('.g-lb-chip')).style.background).toMatch(/136, 136, 136|#888888/);
  });
});

describe('the vehicle row: short codes and modes (user 2026-10-20)', () => {
  it('shows a vehicle\'s short code, with the full name as a tooltip', () => {
    app.vehicles = [{ id: 'v1', name: 'Buss 7', colour: '#2f6fb5', shortCode: 'B7' }];
    loadGrid({ stops: [stop('A')], cols: [{ dayCode: 'D', cells: [cell('0700')], vehicle: 'Buss 7' }], vehicleRow: true });
    const chip = /** @type {HTMLElement} */ (vh(0).querySelector('.g-lb-chip'));
    expect(chip.textContent).toBe('B7');
    expect(chip.title).toBe('Buss 7');
  });

  it('offers only vehicles of the line\'s mode (and those without a mode)', () => {
    app.routeState = { ...newRouteState('no'), mode: 'bus' };
    app.vehicles = [{ id: 'v1', name: 'Buss 7', colour: '#2f6fb5', transportMode: 'bus' }, { id: 'v2', name: 'Ferje 1', colour: '#2f6fb5', transportMode: 'water' },
      { id: 'v3', name: 'Reserve', colour: '#2f6fb5', transportMode: '' }];
    loadGrid({ stops: [stop('A')], cols: [{ dayCode: 'D', cells: [cell('0700')] }], vehicleRow: true });
    down(vh(0));
    press('Enter');
    expect([...document.querySelectorAll('.lb-pick .lb-item')].map((x) => x.textContent)).toEqual(['Buss 7', 'Reserve', 'Ingen']);
  });
});

describe('one marker at a time (user 2026-10-20)', () => {
  it('selecting a label or vehicle cell takes the marker off the timetable cell', () => {
    const marked = () => document.querySelectorAll('#tbl td.is-anchor, #tbl td.in-range').length;
    expect(marked()).toBe(1); // the first time is selected when a grid opens
    down(vh(1));
    expect(marked()).toBe(0);
    down(lb(0));
    expect(marked()).toBe(0);
  });
});
