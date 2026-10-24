// @vitest-environment jsdom
// Delete several columns or rows at once (backlog 74, user 2026-10-24): select a run of column heads (day codes) or
// stops, then the × on any of them (or Delete in the day-code row) removes all of them after one question.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadAppMarkup } from './dom-setup.js';
import { app } from '../../src/ui/state.js';
import { initShell } from '../../src/ui/shell.js';
import { grid, initGrid, loadGrid, gridData } from '../../src/ui/grid.js';
import { initFootnoteEditor } from '../../src/ui/footnote-editor.js';
import { newRouteState } from '../../src/ui/route-state.js';

const stop = (name) => ({ name, stopId: null, bold: false, sep: false, isDwellArr: false, price: null });
const cell = (time) => ({ time, dayOffset: 0, suffix: '', interchange: null });
const col = (t0, more = {}) => ({ dayCode: 'D', note: '', dates: [], uid: crypto.randomUUID(), cells: [cell(t0), cell(t0.slice(0, 2) + '10'), cell(t0.slice(0, 2) + '20')], ...more });
const press = (key, opts = {}) => document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts }));
const down = (/** @type {Element} */ el, opts = {}) => el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, ...opts }));
const dc = (/** @type {number} */ ci) => /** @type {HTMLElement} */ (document.querySelector(`.g-dc-cell[data-ci="${ci}"]`));
const stopCell = (/** @type {number} */ ri) => /** @type {HTMLElement} */ (document.querySelectorAll('.g-td-name')[ri]);
const colX = () => [...document.querySelectorAll('.g-row-bot .g-ibtn-del')];
const rowX = () => [...document.querySelectorAll('.g-ibtn-del')].filter((x) => !x.closest('.g-row-bot'));
const times = () => gridData().cols.map((c) => c.cells[0]?.time);
let asked = /** @type {string[]} */ ([]);

let wired = false;
beforeEach(() => {
  loadAppMarkup();
  initShell();
  initGrid();
  if (!wired) { initFootnoteEditor(); wired = true; }
  app.routeState = newRouteState('no');
  asked = [];
  window.confirm = (/** @type {string} */ q) => { asked.push(q); return true; };
  loadGrid({ stops: [stop('A'), stop('B'), stop('C')], cols: [col('0600'), col('0700'), col('0800'), col('0900')] });
});

describe('deleting several columns', () => {
  it('Shift+click two day codes, then the × on one of them: both go, after one question', () => {
    down(dc(1));
    down(dc(2), { shiftKey: true });
    down(colX()[2]);
    expect(times()).toEqual(['0600', '0900']);
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatch(/2 kolonner/);
  });

  it('Delete in the day-code row removes the selected columns', () => {
    down(dc(0));
    press('ArrowRight', { shiftKey: true });
    press('ArrowRight', { shiftKey: true });
    press('Delete');
    expect(times()).toEqual(['0900']);
  });

  it('the × on a column outside the selection deletes just that one', () => {
    down(dc(1));
    down(dc(2), { shiftKey: true });
    down(colX()[3]);
    expect(times()).toEqual(['0600', '0700', '0800']);
  });

  it('skips a block\'s band and end; a selected parent takes its block along', () => {
    loadGrid({ stops: [stop('A'), stop('B'), stop('C')], cols: [col('0500'), col('0605', { block: { every: 60, span: 120 } }), col('0900')] });
    down(dc(1));
    down(dc(3), { shiftKey: true }); // parent, band, end
    press('Delete');
    expect(times()).toEqual(['0500', '0900']);
    expect(grid.cols.every((c) => !c.virt)).toBe(true);
  });

  it('keeps interchanges to the columns that stay', () => {
    const cols = gridData().cols;
    cols[0].cells[0].interchange = { targetC: 3, targetR: 1, type: 'guaranteed' };
    loadGrid({ stops: [stop('A'), stop('B'), stop('C')], cols });
    down(dc(1));
    down(dc(2), { shiftKey: true });
    press('Delete');
    expect(gridData().cols[0].cells[0].interchange).toEqual({ targetC: 1, targetR: 1, type: 'guaranteed' });
  });
});

describe('deleting several rows', () => {
  it('Shift+click two stops, then the × on one of them: both rows go, after one question', () => {
    down(stopCell(0));
    down(stopCell(1), { shiftKey: true });
    down(rowX()[1]);
    expect(gridData().stops.map((s) => s.name)).toEqual(['C']);
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatch(/2 rader/);
  });

  it('Shift+arrows extend the stop selection', () => {
    down(stopCell(1));
    press('ArrowDown', { shiftKey: true });
    down(rowX()[2]);
    expect(gridData().stops.map((s) => s.name)).toEqual(['A']);
  });
});
