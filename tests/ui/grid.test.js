// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { loadAppMarkup } from './dom-setup.js';
import { app } from '../../src/ui/state.js';
import { initShell } from '../../src/ui/shell.js';
import { grid, initGrid, loadGrid, onGridChange, gridData } from '../../src/ui/grid.js';
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
});
