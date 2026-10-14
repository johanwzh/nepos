// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadAppMarkup } from './dom-setup.js';
import { app } from '../../src/ui/state.js';
import { initShell } from '../../src/ui/shell.js';
import { grid, initGrid, loadGrid, onGridRender } from '../../src/ui/grid.js';
import { initFootnoteEditor } from '../../src/ui/footnote-editor.js';
import { newRouteState } from '../../src/ui/route-state.js';
import { quayInfo } from '../../src/ui/quays.js';

const stop = (/** @type {string} */ id) => ({ name: id, stopId: id, bold: false, sep: false, isDwellArr: false, price: null });
const cell = (/** @type {string} */ time) => ({ time, dayOffset: 0, suffix: '', interchange: null, footnoteId: null });
const at = (/** @type {number} */ lat) => ({ quayId: '', publicCode: '', stopPlaceId: '', stopPlaceName: '', mode: 'bus', lat, lon: 10 });
const menu = async (/** @type {number} */ r, /** @type {number} */ c) => {
  document.querySelector(`[data-r="${r}"][data-c="${c}"]`)?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
};
const item = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));

let footnotesWired = false;

beforeEach(() => {
  loadAppMarkup();
  initShell();
  initGrid();
  if (!footnotesWired) { initFootnoteEditor(); footnotesWired = true; }
  app.routeState = newRouteState('no'); // a bus line
  quayInfo.clear();
  // 0.09° latitude ≈ 10 km
  quayInfo.set('NSR:Quay:1', at(60)).set('NSR:Quay:2', at(60.09)).set('NSR:Quay:3', at(60.18));
  loadGrid({ stops: [stop('NSR:Quay:1'), stop('NSR:Quay:2'), stop('NSR:Quay:3')], cols: [{ dayCode: 'D', footnote: '', footnoteId: null, cells: [cell('0700'), null, cell('0720')] }] });
});

describe('filling times', () => {
  it('interpolates an empty cell between two times', async () => {
    await menu(1, 0);
    expect(item('gc-interp').classList.contains('dis')).toBe(false);
    item('gc-interp').click();
    expect(grid.cols[0].cells[1]?.time).toBe('0710');
  });

  it('extrapolates forwards at a speed in km/h for a bus', async () => {
    grid.cols[0].cells[2] = null;
    window.prompt = vi.fn(() => '60');
    await menu(2, 0);
    item('gc-extrap-fwd').click();
    expect(window.prompt).toHaveBeenCalledWith(expect.stringContaining('km/t'), expect.anything());
    expect(grid.cols[0].cells[2]?.time).toBe('0720'); // 20 km at 60 km/h from 0700 (row 1 is empty, row 0 is the anchor)
  });

  it('offers nothing for a cell that already has a time', async () => {
    await menu(0, 0);
    for (const id of ['gc-interp', 'gc-extrap-fwd', 'gc-extrap-bwd']) expect(item(id).classList.contains('dis')).toBe(true);
    item('gc-interp').click();
    expect(grid.cols[0].cells[0]?.time).toBe('0700');
  });

  it('offers no interpolation without positions', async () => {
    quayInfo.clear();
    await menu(1, 0);
    expect(item('gc-interp').classList.contains('dis')).toBe(true);
  });

  it('tells the map after every render', () => {
    let renders = 0;
    onGridRender(() => { renders++; });
    loadGrid({ stops: [stop('NSR:Quay:1')], cols: [] });
    expect(renders).toBeGreaterThan(0);
  });
});
