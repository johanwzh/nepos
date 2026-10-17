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
  if (!initialised) { initGrid(); initFootnoteEditor(); initialised = true; }
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
