// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { loadAppMarkup } from './dom-setup.js';
import { app } from '../../src/ui/state.js';
import { initShell } from '../../src/ui/shell.js';
import { grid, initGrid, loadGrid } from '../../src/ui/grid.js';
import { initFootnoteEditor } from '../../src/ui/footnote-editor.js';
import { newRouteState } from '../../src/ui/route-state.js';

const stop = (name) => ({ name, stopId: `NSR:Quay:${name}`, bold: false, sep: false, isDwellArr: false, price: null });
const cell = (time) => ({ time, dayOffset: 0, suffix: '', interchange: null });
const press = (key, opts = {}) => document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...opts }));
const down = (el, opts = {}) => el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, ...opts }));
const d = (text, vias = []) => ({ text, vias });

let initialised = false;
beforeEach(() => {
  loadAppMarkup();
  initShell();
  initGrid(); // the menu items belong to the markup, which is new for each test
  if (!initialised) { initFootnoteEditor(); initialised = true; }
  app.routeState = newRouteState('no');
  loadGrid({
    stops: [stop('Alfa'), stop('Beta'), stop('Ceta'), stop('Delta')],
    cols: [{ dayCode: 'D', cells: [cell('0700'), cell('0710'), cell('0720'), cell('0730')], dest: d('Delta'), dests: [null, d('Ceta')] }],
  });
});

describe('destinations follow rows and columns', () => {
  it('gives a loaded column a change slot per stop', () => {
    expect(grid.cols[0].dests).toHaveLength(4);
  });

  it('moves a change down when a row is inserted above it', () => {
    down(document.querySelectorAll('.g-td-ins .g-ibtn')[1]);
    expect(grid.cols[0].dests).toHaveLength(5);
    expect(grid.cols[0].dests[2]).toEqual(d('Ceta'));
    expect(grid.cols[0].dests[1]).toBe(null);
  });

  it('moves a change up when a row above it is deleted', () => {
    grid.cols[0].cells[0] = null;
    down(document.querySelectorAll('.g-ibtn-del')[0]);
    expect(grid.stops).toHaveLength(3);
    expect(grid.cols[0].dests).toEqual([d('Ceta'), null, null]);
  });

  it('gives a new column no destination and a slot per stop', () => {
    down(document.querySelector('.g-ibtn-end'));
    const col = grid.cols[grid.cols.length - 1];
    expect(col.dest).toBe(null);
    expect(col.dests).toHaveLength(4);
  });

  it('keeps a change when the time in its row is cleared', () => {
    down(/** @type {HTMLElement} */ (document.querySelector('[data-r="1"][data-c="0"]')));
    press('Delete');
    expect(grid.cols[0].cells[1]).toBe(null);
    expect(grid.cols[0].dests[1]).toEqual(d('Ceta'));
  });
});

describe('destination columns', () => {
  const open = () => { if (!document.querySelector('.cw-dest')) press('d', { altKey: true }); };
  const destCell = (r, c) => /** @type {HTMLElement} */ (document.querySelector(`.cw-dest[data-dr="${r}"][data-dc="${c}"]`));

  it('are hidden until Alt+D, then one per trip column in every row, remembered', () => {
    try { localStorage.removeItem('nepos.destOpen'); } catch { /* none */ }
    if (document.querySelector('.cw-dest')) press('d', { altKey: true });
    loadGrid({ stops: grid.stops, cols: grid.cols });
    expect(document.querySelector('.cw-dest')).toBeNull();
    press('d', { altKey: true });
    const rows = [...document.querySelectorAll('#tbl tr')];
    for (const tr of rows) expect(tr.querySelectorAll('.cw-dest').length).toBe(grid.cols.length);
    expect(localStorage.getItem('nepos.destOpen')).toBe('1');
  });

  it('show the destination with its vias where it starts, and a line down to the last stop', () => {
    grid.cols[0].dest = d('Delta', ['Beta']);
    grid.cols[0].dests[1] = null;
    open();
    loadGrid({ stops: grid.stops, cols: grid.cols });
    const label = destCell(0, 0).querySelector('.dest-label');
    expect(label?.textContent).toContain('Delta');
    expect(destCell(0, 0).querySelector('.dest-via')?.textContent).toBe('via Beta');
    for (const r of [0, 1, 2, 3]) expect(destCell(r, 0).querySelector('.dl')?.classList.contains('dl-double')).toBe(true);
  });

  it('start a new colour where the destination changes', () => {
    open();
    loadGrid({ stops: grid.stops, cols: grid.cols });
    expect(destCell(0, 0).querySelector('.dl')?.classList.contains('dl-c0')).toBe(true);
    expect(destCell(1, 0).querySelector('.dl')?.classList.contains('dl-c1')).toBe(true);
    expect(destCell(1, 0).querySelector('.dest-label')?.textContent).toContain('Ceta');
  });

  it('mark a trip without a destination on its first stop', () => {
    grid.cols[0].dest = null;
    open();
    loadGrid({ stops: grid.stops, cols: grid.cols });
    expect(destCell(0, 0).querySelector('.dest-missing')).not.toBeNull();
  });
});

describe('editing destinations', () => {
  const destCell = (r, c) => /** @type {HTMLElement} */ (document.querySelector(`.cw-dest[data-dr="${r}"][data-dc="${c}"]`));
  const twoCols = () => {
    if (!document.querySelector('.cw-dest')) press('d', { altKey: true });
    loadGrid({
      stops: [stop('Alfa'), stop('Beta'), stop('Ceta'), stop('Delta S')],
      cols: [0, 1].map((k) => ({ dayCode: 'D', cells: [cell(`0${7 + k}00`), cell(`0${7 + k}10`), cell(`0${7 + k}20`), cell(`0${7 + k}30`)] })),
    });
  };
  const textBox = () => /** @type {HTMLInputElement} */ (document.querySelector('.dest-box .de-text'));
  const typeIn = (input, s) => { input.value = s; input.dispatchEvent(new Event('input')); };
  const enter = (el) => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

  it('types a destination on the first stop: the trip starts with it', () => {
    twoCols();
    down(destCell(0, 0));
    press('D');
    expect(textBox().value).toBe('D');
    typeIn(textBox(), 'Delta');
    enter(textBox());
    expect(grid.cols[0].dest).toEqual(d('Delta'));
    expect(document.querySelector('.dest-box')).toBeNull();
  });

  it('opens nothing on the last stop', () => {
    twoCols();
    down(destCell(3, 0));
    press('X');
    expect(document.querySelector('.dest-box')).toBeNull();
  });

  it('suggests destinations already used', () => {
    twoCols();
    grid.cols[0].dest = d('Delta');
    down(destCell(0, 1));
    press('d');
    typeIn(textBox(), 'de');
    expect([...document.querySelectorAll('.de-sugg-item')].map((x) => x.textContent)).toEqual(['Delta']);
    document.querySelector('.de-sugg-item')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    enter(textBox());
    expect(grid.cols[1].dest).toEqual(d('Delta'));
  });

  it('removes a destination with Delete, and Ctrl+Z brings it back', () => {
    twoCols();
    grid.cols[0].dest = d('Delta');
    loadGrid({ stops: grid.stops, cols: grid.cols });
    down(destCell(0, 0));
    press('Delete');
    expect(grid.cols[0].dest).toBe(null);
    press('z', { ctrlKey: true });
    expect(grid.cols[0].dest).toEqual(d('Delta'));
  });

  it('suggests from bold stops with the right-click menu', () => {
    twoCols();
    grid.stops[1].bold = true;
    loadGrid({ stops: grid.stops, cols: grid.cols });
    destCell(0, 0).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 }));
    expect(document.getElementById('gctx-dest')?.style.display).toBe('');
    document.getElementById('gc-dest-suggest')?.click();
    expect(grid.cols[0].dest).toEqual(d('Delta', ['Beta']));
    expect(grid.cols[0].dests[1]).toEqual(d('Delta'));
    expect(grid.cols[1].dest).toBe(null); // only the column clicked
  });

  it('copies one column and pastes it on another', () => {
    twoCols();
    grid.cols[0].dest = d('Delta', ['Beta']);
    grid.cols[0].dests[1] = d('Delta');
    loadGrid({ stops: grid.stops, cols: grid.cols });
    down(destCell(0, 0));
    down(destCell(3, 0), { shiftKey: true });
    press('c', { ctrlKey: true });
    down(destCell(0, 1));
    press('v', { ctrlKey: true });
    expect(grid.cols[1].dest).toEqual(d('Delta', ['Beta']));
    expect(grid.cols[1].dests[1]).toEqual(d('Delta'));
  });
});

describe('dragging destinations', () => {
  const destCell = (r, c) => /** @type {HTMLElement} */ (document.querySelector(`.cw-dest[data-dr="${r}"][data-dc="${c}"]`));
  const label = (r, c) => /** @type {HTMLElement} */ (destCell(r, c).querySelector('.dest-label'));
  // The grid is rebuilt on mousedown: the target cell is looked up after it
  const drag = (from, [r, c], opts = {}) => {
    down(from);
    const to = destCell(r, c);
    to.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, buttons: 1, ...opts }));
    to.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, ...opts }));
  };
  const setup = () => {
    if (!document.querySelector('.cw-dest')) press('d', { altKey: true });
    loadGrid({
      stops: [stop('Alfa'), stop('Beta'), stop('Ceta'), stop('Delta S')],
      cols: [{ dayCode: 'D', cells: [cell('0700'), cell('0710'), cell('0720'), cell('0730')], dest: d('Delta'), dests: [null, d('Ceta')] }],
    });
  };

  it('moves a change to another stop', () => {
    setup();
    drag(label(1, 0), [2, 0]);
    expect(grid.cols[0].dests[2]).toEqual(d('Ceta'));
    expect(grid.cols[0].dests[1]).toBe(null);
  });

  it('does not drop a change on the last stop', () => {
    setup();
    drag(label(1, 0), [3, 0]);
    expect(grid.cols[0].dests[1]).toEqual(d('Ceta'));
    expect(grid.cols[0].dests[3]).toBe(null);
  });

  it('makes a via with shift+drag of the start', () => {
    setup();
    grid.cols[0].dests[1] = null;
    loadGrid({ stops: grid.stops, cols: grid.cols });
    drag(label(0, 0), [1, 0], { shiftKey: true });
    expect(grid.cols[0].dest).toEqual(d('Delta', ['Beta']));
    expect(grid.cols[0].dests[1]).toEqual(d('Delta'));
  });

  it('does not move the start without shift', () => {
    setup();
    drag(label(0, 0), [2, 0]);
    expect(grid.cols[0].dest).toEqual(d('Delta'));
    expect(grid.cols[0].dests[2]).toBe(null);
  });
});

describe('review fixes in the grid', () => {
  const destCell = (r, c) => /** @type {HTMLElement} */ (document.querySelector(`.cw-dest[data-dr="${r}"][data-dc="${c}"]`));
  const openCols = () => { if (!document.querySelector('.cw-dest')) press('d', { altKey: true }); };

  it('"Remove change" on a flagged change above the start removes that change, not the start', () => {
    openCols();
    loadGrid({ stops: [stop('Alfa'), stop('Beta'), stop('Ceta')], cols: [{ dayCode: 'D', cells: [null, cell('0710'), cell('0720')], dest: d('Ceta'), dests: [d('X'), null, null] }] });
    destCell(0, 0).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 5, clientY: 5 }));
    document.getElementById('gc-dest-remove')?.click();
    expect(grid.cols[0].dest).toEqual(d('Ceta'));
    expect(grid.cols[0].dests[0]).toBe(null);
  });

  it('Ctrl+Z does nothing after the columns changed', () => {
    window.confirm = () => true;
    openCols();
    loadGrid({ stops: [stop('Alfa'), stop('Beta')], cols: [0, 1].map(() => ({ dayCode: 'D', cells: [cell('0700'), cell('0710')] })) });
    grid.cols[1].dest = d('Y');
    loadGrid({ stops: grid.stops, cols: grid.cols });
    down(destCell(0, 0));
    press('a');
    const input = /** @type {HTMLInputElement} */ (document.querySelector('.dest-box .de-text'));
    input.value = 'Alfa2';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    down(document.querySelectorAll('.g-ibtn-del')[2]); // delete column 0 (the bottom row's ×; row buttons come first)
    expect(grid.cols).toHaveLength(1);
    down(destCell(0, 0));
    press('z', { ctrlKey: true });
    expect(grid.cols[0].dest).toEqual(d('Y'));
  });

  it('forgets the undo step when another grid is loaded', () => {
    openCols();
    down(destCell(0, 0));
    press('Delete');
    loadGrid({ stops: [stop('Alfa'), stop('Beta')], cols: [{ dayCode: 'D', cells: [cell('0700'), cell('0710')], dest: d('Q') }] });
    down(destCell(0, 0));
    press('z', { ctrlKey: true });
    expect(grid.cols[0].dest).toEqual(d('Q'));
  });
});
