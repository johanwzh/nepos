// @vitest-environment jsdom
// The power toolbox (power tools spec 2026-10-24): at the bottom of the line navigator panel, always visible; turning a
// tool on changes the editing context, and while a tool is on only that tool works. The jog lives here now.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadAppMarkup } from './dom-setup.js';
import { app } from '../../src/ui/state.js';
import { initShell } from '../../src/ui/shell.js';
import { grid, initGrid, loadGrid, selectCell } from '../../src/ui/grid.js';
import { initFootnoteEditor } from '../../src/ui/footnote-editor.js';
import { newRouteState } from '../../src/ui/route-state.js';
import { initPowerTools, activeTool, setTool } from '../../src/ui/power-tools.js';

const stop = (name) => ({ name, stopId: null, bold: false, sep: false, isDwellArr: false, price: null });
const cell = (time) => ({ time, dayOffset: 0, suffix: '', interchange: null });
const press = (key, opts = {}) => document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts }));
const tool = (/** @type {string} */ name) => /** @type {HTMLElement} */ (document.querySelector(`#power-tools .pt-tool[data-tool="${name}"]`));

let wired = false;
beforeEach(() => {
  loadAppMarkup();
  initShell();
  initGrid();
  initPowerTools();
  if (!wired) { initFootnoteEditor(); wired = true; }
  setTool('');
  app.routeState = newRouteState('no');
  loadGrid({ stops: [stop('A'), stop('B')], cols: [{ dayCode: 'D', note: '', dates: [], cells: [cell('0700'), cell('0710')] }] });
});

describe('the power toolbox', () => {
  it('sits at the bottom of the line navigator panel with the jog and virtual intervals, none on', () => {
    const box = /** @type {HTMLElement} */ (document.getElementById('power-tools'));
    expect(box.closest('#panel-left')).not.toBeNull();
    expect([...box.querySelectorAll('.pt-tool')].map((b) => /** @type {HTMLElement} */ (b).dataset.tool)).toEqual(['jog', 'intervals']);
    expect(activeTool()).toBe('');
  });

  it('with no tool on, typing works as today', () => {
    selectCell(0, 0);
    for (const k of ['0', '7', '3', '0']) press(k);
    press('Enter');
    expect(grid.cols[0].cells[0].time).toBe('0730');
  });

  it('one tool at a time; Esc turns it off', () => {
    tool('jog').click();
    expect(activeTool()).toBe('jog');
    tool('intervals').click();
    expect(activeTool()).toBe('intervals');
    press('Escape');
    expect(activeTool()).toBe('');
  });

  it('while a tool is on, typing, Ctrl+V and the context menu do nothing', () => {
    selectCell(0, 0);
    tool('jog').click();
    for (const k of ['0', '9', '0', '0']) press(k);
    press('Enter');
    expect(grid.cols[0].cells[0].time).toBe('0700');
    const td = /** @type {HTMLElement} */ (document.querySelector('td[data-r="0"][data-c="0"]'));
    td.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
    expect(/** @type {HTMLElement} */ (document.getElementById('grid-ctx')).style.display).not.toBe('block');
  });

  it('the jog: its dial is in the panel and moves the selected times', () => {
    selectCell(0, 0);
    press('ArrowDown', { shiftKey: true });
    tool('jog').click();
    const dial = /** @type {HTMLElement} */ (document.querySelector('#power-tools .pt-body .jd'));
    expect(dial).not.toBeNull();
    dial.focus();
    dial.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(grid.cols[0].cells.map((c) => c.time)).toEqual(['0701', '0711']);
  });

  it('Alt+J and Alt+I turn the tools on and off', () => {
    press('j', { altKey: true });
    expect(activeTool()).toBe('jog');
    press('j', { altKey: true });
    expect(activeTool()).toBe('');
    press('i', { altKey: true });
    expect(activeTool()).toBe('intervals');
  });

  it('the context menu no longer has the jog', () => {
    expect(document.getElementById('gc-nudge')).toBeNull();
  });
});
