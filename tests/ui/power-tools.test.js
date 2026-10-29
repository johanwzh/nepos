// @vitest-environment jsdom
// The power toolbox (power tools spec 2026-10-24): at the bottom of the line navigator panel, always visible; turning a
// tool on changes the editing context, and while a tool is on only that tool works. The jog lives here now.
import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadAppMarkup } from './dom-setup.js';
import { app } from '../../src/ui/state.js';
import { initShell, currentPage } from '../../src/ui/shell.js';
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
  it('sits at the bottom of the line navigator panel with its tools, none on', () => {
    const box = /** @type {HTMLElement} */ (document.getElementById('power-tools'));
    expect(box.closest('#panel-left')).not.toBeNull();
    expect([...box.querySelectorAll('.pt-tool')].map((b) => /** @type {HTMLElement} */ (b).dataset.tool)).toEqual(['jog', 'intervals', 'record', 'optimize']);
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

  it('while Virtual intervals is on, typing, Ctrl+V and the context menu do nothing', () => {
    selectCell(0, 0);
    tool('intervals').click();
    for (const k of ['0', '9', '0', '0']) press(k);
    press('Enter');
    expect(grid.cols[0].cells[0].time).toBe('0700');
    const td = /** @type {HTMLElement} */ (document.querySelector('td[data-r="0"][data-c="0"]'));
    td.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
    expect(/** @type {HTMLElement} */ (document.getElementById('grid-ctx')).style.display).not.toBe('block');
  });

  it('while the Tidsforskyver is on, the cells stay editable: typing and the cell menu work (hypothesis, user 2026-10-28)', () => {
    selectCell(0, 0);
    tool('jog').click();
    for (const k of ['0', '6', '5', '5']) press(k);
    press('Enter');
    expect(grid.cols[0].cells[0].time).toBe('0655');
    expect(activeTool()).toBe('jog');
    const td = /** @type {HTMLElement} */ (document.querySelector('td[data-r="0"][data-c="0"]'));
    td.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
    expect(/** @type {HTMLElement} */ (document.getElementById('grid-ctx')).style.display).toBe('block');
  });

  it('Esc while typing a time cancels the typing and keeps the Tidsforskyver on', () => {
    selectCell(0, 0);
    tool('jog').click();
    press('0'); press('9');
    press('Escape');
    expect(activeTool()).toBe('jog');
    expect(grid.cols[0].cells[0].time).toBe('0700');
    press('Escape');
    expect(activeTool()).toBe('');
  });

  it('the jog: a big dial in a box in the middle of the page (not in the panel), moving the selected times', () => {
    selectCell(0, 0);
    press('ArrowDown', { shiftKey: true });
    tool('jog').click();
    const dial = /** @type {HTMLElement} */ (document.querySelector('.ts-box .jd'));
    expect(dial).not.toBeNull();
    expect(dial.closest('#power-tools')).toBeNull();
    expect(Number(dial.querySelector('svg')?.getAttribute('width'))).toBeGreaterThanOrEqual(56); // sized to the space above the timetable (user 2026-10-25)
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

  it('the tool is called Tidsforskyver (Time shifter); the jog is its dial', () => {
    expect(tool('jog').textContent).toContain('Tidsforskyver');
  });

  it('dragging the jog down (or the down arrow, or the wheel down) makes times later', () => {
    selectCell(0, 0);
    tool('jog').click();
    const dial = /** @type {HTMLElement} */ (document.querySelector('.ts-box .jd'));
    dial.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(grid.cols[0].cells[0].time).toBe('0701');
    dial.querySelector('svg')?.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true }));
    expect(grid.cols[0].cells[0].time).toBe('0702');
    dial.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(grid.cols[0].cells[0].time).toBe('0701');
  });

  it('the readout counts the current selection only: a new selection fades it out and starts again', () => {
    vi.useFakeTimers();
    try {
      selectCell(0, 0);
      tool('jog').click();
      const dial = /** @type {HTMLElement} */ (document.querySelector('.ts-box .jd'));
      dial.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      const read = () => /** @type {HTMLElement} */ (document.querySelector('.ts-box .pt-read'));
      expect(read().textContent).toBe('+1 min');
      selectCell(1, 0);
      expect(read().classList.contains('pt-fade')).toBe(true);
      vi.advanceTimersByTime(1100);
      expect(read().textContent).toBe('0 min');
      dial.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      expect(read().textContent).toBe('+1 min');
    } finally { vi.useRealTimers(); }
  });

  it('while a tool is on, the rest of the page is locked (body class) and the page keys do nothing', () => {
    tool('jog').click();
    expect(document.body.classList.contains('pt-on')).toBe(true);
    expect(document.body.classList.contains('pt-jog')).toBe(true);
    press('2', { altKey: true });
    expect(currentPage()).toBe('edit');
    press('Escape');
    expect(document.body.classList.contains('pt-on')).toBe(false);
  });

  it('the box has a ✕ that turns the tool off', () => {
    tool('jog').click();
    /** @type {HTMLElement} */ (document.querySelector('.ts-box .ts-x')).click();
    expect(activeTool()).toBe('');
    expect(document.querySelector('.ts-box')).toBeNull();
  });

  it('the box goes when the tool is turned off', () => {
    tool('jog').click();
    expect(document.querySelector('.ts-box')).not.toBeNull();
    press('Escape');
    expect(document.querySelector('.ts-box')).toBeNull();
  });

  it('Esc puts everything back: the end jogs of the blocks go away', () => {
    loadGrid({ stops: [stop('A'), stop('B')], cols: [{ dayCode: 'D', note: '', dates: [], uid: crypto.randomUUID(), block: { every: 60, span: 120 }, cells: [cell('0700'), cell('0710')] }] });
    tool('intervals').click();
    expect(document.querySelector('.g-dc-cell .jd')).not.toBeNull();
    press('Escape');
    expect(document.querySelector('.g-dc-cell .jd')).toBeNull();
  });

  it('the jog\'s dot is the same size whatever the dial\'s size', async () => {
    const { jogDial } = await import('../../src/ui/jog/jogDial.js');
    const dotPx = (/** @type {number} */ size) => {
      const el = jogDial({ size, detents: true, onNudge: () => {} });
      return Number(el.querySelector('.jd-dot')?.getAttribute('r')) * size / 100;
    };
    expect(dotPx(18)).toBeCloseTo(dotPx(44), 2);
    expect(dotPx(18)).toBeGreaterThanOrEqual(1.2);
    expect(dotPx(18)).toBeLessThanOrEqual(1.8); // about 3 px across: an indicator, not an eye (user 2026-10-24)
  });

  it('is called Spesialverktøy, and follows a change of language (user 2026-10-26)', async () => {
    const { setLang } = await import('../../src/i18n/strings.js');
    const { applyLang } = await import('../../src/ui/shell.js');
    expect(document.querySelector('#power-tools .pt-head')?.textContent).toBe('Spesialverktøy');
    app.settings.lang = 'en';
    applyLang();
    expect(document.querySelector('#power-tools .pt-head')?.textContent).toBe('Power tools');
    expect(tool('jog').textContent).toContain('Time shifter');
    app.settings.lang = 'no';
    applyLang();
    setLang('no');
  });

  it('the context menu no longer has the jog', () => {
    expect(document.getElementById('gc-nudge')).toBeNull();
  });
});

describe('+ and − step the selected times one minute (user 2026-10-28)', () => {
  const times = () => grid.cols[0].cells.map((c) => c.time);
  const td = (/** @type {number} */ r) => /** @type {HTMLElement} */ (document.querySelector(`td[data-r="${r}"][data-c="0"]`));

  it('+ moves the selection a minute later and turns the Tidsforskyver on; its readout counts the steps', () => {
    selectCell(0, 0);
    press('ArrowDown', { shiftKey: true });
    press('+');
    press('+');
    expect(times()).toEqual(['0702', '0712']);
    expect(activeTool()).toBe('jog');
    expect(document.querySelector('.ts-box .pt-read')?.textContent).toBe('+2 min');
  });

  it('− moves it a minute earlier', () => {
    selectCell(1, 0);
    press('-');
    expect(times()).toEqual(['0700', '0709']);
  });

  it('the moved cells flash: one colour for +, another for −', () => {
    selectCell(1, 0);
    press('+');
    expect(td(1).classList.contains('g-flash-up')).toBe(true);
    press('-');
    expect(td(1).classList.contains('g-flash-down')).toBe(true);
    expect(td(1).classList.contains('g-flash-up')).toBe(false);
    expect(td(0).classList.contains('g-flash-down')).toBe(false);
  });

  it('past midnight the day offset follows', () => {
    loadGrid({ stops: [stop('A'), stop('B')], cols: [{ dayCode: 'D', note: '', dates: [], cells: [cell('2350'), cell('2359')] }] });
    selectCell(1, 0);
    press('+');
    expect(grid.cols[0].cells[1]).toMatchObject({ time: '0000', dayOffset: 1 });
  });

  it('copy a time down and step it: the use case', () => {
    selectCell(1, 0);
    press('Delete');
    selectCell(0, 0);
    press('c', { ctrlKey: true });
    selectCell(1, 0);
    const ev = new Event('paste', { bubbles: true, cancelable: true });
    /** @type {any} */ (ev).clipboardData = { getData: () => '0700' };
    document.dispatchEvent(ev);
    press('+'); press('+'); press('+');
    expect(times()).toEqual(['0700', '0703']);
    press('ArrowDown'); // a new selection: the readout starts again
    expect(activeTool()).toBe('jog');
  });

  it('does nothing in Virtual intervals, or with Ctrl (browser zoom)', () => {
    selectCell(0, 0);
    press('+', { ctrlKey: true });
    expect(times()).toEqual(['0700', '0710']);
    tool('intervals').click();
    press('+');
    expect(times()).toEqual(['0700', '0710']);
    expect(activeTool()).toBe('intervals');
  });
});

describe('Registrer stopp and Optimalisering in the toolbox (stop picking 2, 2.5)', () => {
  it('Registrer stopp is a power tool (Alt+R); Optimalisering is there, disabled', () => {
    expect(/** @type {HTMLButtonElement} */ (tool('optimize')).disabled).toBe(true);
    tool('optimize').click();
    expect(activeTool()).toBe('');
    press('r', { altKey: true });
    expect(activeTool()).toBe('record');
    expect(document.body.classList.contains('pt-record')).toBe(true);
  });

  it('while recording, the map pane is not locked', () => {
    const css = readFileSync('src/ui/styles.css', 'utf8');
    expect(css).toMatch(/body\.pt-record :is\(#panel-right, #map-strip\) \{ opacity: 1; pointer-events: auto; \}/);
  });
});
