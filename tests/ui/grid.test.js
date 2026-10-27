// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadAppMarkup } from './dom-setup.js';
import { app } from '../../src/ui/state.js';
import { initShell, setPage, currentPage } from '../../src/ui/shell.js';
import { grid, initGrid, loadGrid, onGridChange, gridData, selectedStopRow, render, onGridRender } from '../../src/ui/grid.js';
import { initPowerTools, setTool, activeTool } from '../../src/ui/power-tools.js';
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

describe('boarding restrictions from the right-click menu (user test 2026-10-17)', () => {
  const at = (/** @type {number} */ r, /** @type {number} */ c) => /** @type {HTMLElement} */ (document.querySelector(`[data-r="${r}"][data-c="${c}"]`));
  const item = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
  beforeEach(() => { initGrid(); });

  it('sets a or p on the selected stops in between (not a trip\'s first or last), ticks it, and takes it away again', () => {
    loadGrid({ stops: [stop('A'), stop('B'), stop('C'), stop('D')], cols: [{ dayCode: 'D', cells: [cell('0700'), cell('0710'), cell('0720'), cell('0730')] }] });
    at(0, 0).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    at(3, 0).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, shiftKey: true }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    at(1, 0).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    item('gc-sfx-a').click();
    expect(grid.cols[0].cells.map((c) => c.suffix)).toEqual(['', 'a', 'a', '']); // the trip's ends are left out (2026-10-27)
    expect(grid.cols[0].cells[1].time).toBe('0710'); // the time stays
    at(1, 0).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    expect(item('gc-sfx-a').textContent).toContain('✓');
    expect(item('gc-sfx-p').textContent).not.toContain('✓');
    item('gc-sfx-none').click();
    expect(grid.cols[0].cells.map((c) => c.suffix)).toEqual(['', '', '', '']);
  });
});

describe('the day-code helper (user test 2026-10-17)', () => {
  beforeEach(() => { initGrid(); });

  it('right-click a day code → Velg dager…: click days, see the code, Apply', () => {
    /** @type {HTMLElement} */ (document.querySelector('.g-dc-cell[data-ci="0"]')).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    /** @type {HTMLElement} */ (document.getElementById('gc-dc-days')).click();
    const box = /** @type {HTMLElement} */ (document.querySelector('.float-box'));
    expect(box.querySelector('.dch-code')?.textContent).toContain('DX67'); // the column's code, as days
    /** @type {HTMLElement} */ (box.querySelector('[data-day="6"]')).click();
    expect(box.querySelector('.dch-code')?.textContent).toContain('DX7');
    /** @type {HTMLElement} */ (box.querySelector('[data-day="H"]')).click(); // not on holidays
    expect(box.querySelector('.dch-code')?.textContent).toContain('DX7H');
    /** @type {HTMLElement} */ (box.querySelector('.fb-apply')).click();
    expect(grid.cols[0].dayCode).toBe('DX7H');
    expect(document.querySelector('.float-box')).toBeNull();
  });

  it('refuses a combination the day codes cannot say', () => {
    /** @type {HTMLElement} */ (document.querySelector('.g-dc-cell[data-ci="0"]')).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    /** @type {HTMLElement} */ (document.getElementById('gc-dc-days')).click();
    const box = /** @type {HTMLElement} */ (document.querySelector('.float-box'));
    for (const d of ['2', '4', 'H']) /** @type {HTMLElement} */ (box.querySelector(`[data-day="${d}"]`)).click(); // 1,3,5 without holidays
    expect(/** @type {HTMLButtonElement} */ (box.querySelector('.fb-apply')).disabled).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(grid.cols[0].dayCode).toBe('DX67');
  });
});

describe('sorting columns (user test 2026-10-17)', () => {
  beforeEach(() => {
    initGrid();
    loadGrid({
      stops: [stop('A'), stop('B')],
      cols: [{ dayCode: '6', footnote: '', footnoteId: null, cells: [cell('0700'), cell('0710')] },
        { dayCode: 'D', footnote: '', footnoteId: null, cells: [cell('0800'), cell('0810')] },
        { dayCode: 'D', footnote: '', footnoteId: null, cells: [cell('0600'), cell('0610')] }],
    }, { readOnly: false });
  });
  const sortBy = (/** @type {string} */ id) => {
    /** @type {HTMLElement} */ (document.querySelector('.g-dc-cell[data-ci="0"]')).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    /** @type {HTMLElement} */ (document.getElementById(id)).click();
  };

  it('by departure time, or in day-code blocks then departure, from the day-code menu', () => {
    sortBy('gc-sort-time');
    expect(grid.cols.map((c) => c.cells[0].time)).toEqual(['0600', '0700', '0800']);
    sortBy('gc-sort-dc');
    expect(grid.cols.map((c) => `${c.dayCode} ${c.cells[0].time}`)).toEqual(['D 0600', 'D 0800', '6 0700']);
  });
});

describe('copying a column at an interval (user test 2026-10-17)', () => {
  beforeEach(() => {
    initGrid();
    loadGrid({
      stops: [stop('A'), stop('B')],
      cols: [{ dayCode: 'D', footnote: '', footnoteId: null, cells: [cell('0700'), cell('0745')] },
        { dayCode: 'D', footnote: '', footnoteId: null, cells: [cell('1000'), cell('1045')] }],
    }, { readOnly: false });
    // the 07:45 arrival connects to the 10:00 column
    grid.cols[0].cells[1].interchange = { targetR: 0, targetC: 1, type: 'guaranteed' };
  });

  it('says how many copies it will make, puts them after the column, and keeps interchanges pointing right', () => {
    /** @type {HTMLElement} */ (document.querySelector('.g-dc-cell[data-ci="0"]')).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    /** @type {HTMLElement} */ (document.getElementById('gc-copy-int')).click();
    const box = /** @type {HTMLElement} */ (document.querySelector('.float-box'));
    const set = (/** @type {string} */ sel, /** @type {string} */ v) => { const i = /** @type {HTMLInputElement} */ (box.querySelector(sel)); i.value = v; i.dispatchEvent(new Event('input')); };
    set('.cpi-interval', '30');
    set('.cpi-last', '09:00');
    expect(box.querySelector('.cpi-sum')?.textContent).toContain('4');
    /** @type {HTMLElement} */ (box.querySelector('.fb-apply')).click();
    expect(grid.cols.map((c) => c.cells[0].time)).toEqual(['0700', '0730', '0800', '0830', '0900', '1000']);
    expect(grid.cols[0].cells[1].interchange.targetC).toBe(5); // still the 10:00 column
  });
});

describe('nudging times with the jog, a power tool (user test 2026-10-17; power tools spec 2026-10-24)', () => {
  beforeEach(() => { initGrid(); initPowerTools(); setTool(''); });
  const at = (/** @type {number} */ r, /** @type {number} */ c) => /** @type {HTMLElement} */ (document.querySelector(`[data-r="${r}"][data-c="${c}"]`));
  const open = () => {
    at(0, 0).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    setTool('jog');
    return /** @type {HTMLElement} */ (document.querySelector('.ts-box .jd'));
  };
  const key = (/** @type {Element} */ el, /** @type {string} */ k, shiftKey = false) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true, cancelable: true }));
  const times = () => grid.cols[0].cells.map((c) => c.time);

  it('only ever moves the selected cells, one minute a notch (Shift: ten)', () => {
    const jog = open(); // one cell selected: only that cell
    key(jog, 'ArrowDown');
    key(jog, 'ArrowDown', true);
    expect(times()).toEqual(['0711', '0745']);
    expect(document.querySelector('.ts-box .pt-read')?.textContent).toBe('+11 min');
  });

  it('stays open as a tool while the selection changes, and acts on the new selection', () => {
    const jog = open();
    at(0, 0).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    at(1, 0).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, shiftKey: true }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    expect(activeTool()).toBe('jog'); // a click in the grid keeps it on
    key(jog, 'ArrowUp');
    expect(times()).toEqual(['0659', '0744']);
  });

  it('while turning, changes only the moved cells; the full redraw waits until the jog rests or closes (user 2026-10-19)', () => {
    vi.useFakeTimers();
    try {
      let renders = 0;
      onGridRender(() => { renders++; });
      const jog = open();
      const before = renders;
      key(jog, 'ArrowDown');
      key(jog, 'ArrowDown');
      key(jog, 'ArrowDown');
      expect(times()).toEqual(['0703', '0745']);
      expect(at(0, 0).textContent).toBe('0703'); // the cell shows it at once
      expect(renders).toBe(before); // nothing else has been redrawn yet
      vi.advanceTimersByTime(1000);
      expect(renders).toBe(before + 1); // one redraw once the jog rests
      key(jog, 'ArrowDown');
      key(jog, 'Escape');
      expect(renders).toBe(before + 2); // turning it off redraws at once
      expect(at(0, 0).textContent).toBe('0704');
    } finally { vi.useRealTimers(); }
  });

  it('turns off with Esc or its button, keeping what was done', () => {
    const jog = open();
    key(jog, 'ArrowDown');
    key(jog, 'Escape');
    expect(activeTool()).toBe('');
    expect(times()).toEqual(['0701', '0745']);
    open();
    /** @type {HTMLElement} */ (document.querySelector('#power-tools .pt-tool[data-tool="jog"]')).click();
    expect(activeTool()).toBe('');
  });
});

describe('the date picker (user test 2026-10-17)', () => {
  beforeEach(() => { initGrid(); });
  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const day = (/** @type {number} */ n) => `${ym}${String(n).padStart(2, '0')}`;
  const click = (/** @type {string} */ d) => {
    /** @type {HTMLElement} */ (document.querySelector(`.float-box .yv-day[data-date="${d}"]`)).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  };
  const openForColumn = () => {
    /** @type {HTMLElement} */ (document.querySelector('.g-dc-cell[data-ci="0"]')).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    /** @type {HTMLElement} */ (document.getElementById('gc-dc-dates')).click();
    return /** @type {HTMLElement} */ (document.querySelector('.float-box'));
  };

  it('shows six months (3 × 2), adds days in "Legg til" mode and removes in "Fjern" mode, Apply keeps them as ranges', () => {
    const box = openForColumn();
    expect(box.querySelectorAll('.yv-title')).toHaveLength(6);
    expect(box.querySelector('.dp-mode.on')?.getAttribute('data-mode')).toBe('add');
    click(day(10));
    click(day(11));
    expect(box.querySelector(`.yv-day[data-date="${day(10)}"]`)?.classList.contains('dp-added')).toBe(true);
    /** @type {HTMLElement} */ (box.querySelector('.dp-mode[data-mode="remove"]')).click();
    click(day(20));
    /** @type {HTMLElement} */ (box.querySelector('.fb-apply')).click();
    expect(grid.cols[0].dates).toEqual([{ from: day(10), to: day(11), on: true }, { from: day(20), to: day(20), on: false }]);
  });

  it('clicking a marked day again in its mode unmarks it; Esc keeps the old dates', () => {
    grid.cols[0].dates = [{ from: day(10), to: day(10), on: true }];
    const box = openForColumn();
    click(day(10));
    expect(box.querySelector(`.yv-day[data-date="${day(10)}"]`)?.classList.contains('dp-added')).toBe(false);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(grid.cols[0].dates).toEqual([{ from: day(10), to: day(10), on: true }]);
  });

  it('works for a single time too, from the right-click menu, switching it off only', () => {
    /** @type {HTMLElement} */ (document.querySelector('[data-r="1"][data-c="0"]')).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    /** @type {HTMLElement} */ (document.getElementById('gc-cell-dates')).click();
    click(day(12));
    /** @type {HTMLElement} */ (document.querySelector('.float-box .fb-apply')).click();
    expect(grid.cols[0].cells[1].dates).toEqual([{ from: day(12), to: day(12), on: false }]);
  });
});

describe('the trip-number row (user test 2026-10-17)', () => {
  beforeEach(() => { initGrid(); window.confirm = () => true; });
  const dcMenu = () => /** @type {HTMLElement} */ (document.querySelector('.g-dc-cell[data-ci="0"]')).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  const tn = (/** @type {number} */ ci) => /** @type {HTMLElement} */ (document.querySelector(`.g-tn-cell[data-ci="${ci}"]`));

  it('is shown from the day-code menu, between the day codes and the first stop, and takes typed numbers', () => {
    expect(document.querySelector('.g-row-tn')).toBeNull();
    dcMenu();
    expect(document.getElementById('gc-tripno')?.textContent).toBe('Vis turnummer');
    /** @type {HTMLElement} */ (document.getElementById('gc-tripno')).click();
    const row = /** @type {HTMLElement} */ (document.querySelector('.g-row-tn'));
    expect(row.textContent).toContain('Turnummer');
    expect(row.previousElementSibling?.querySelector('.g-dc-cell')).not.toBeNull();
    tn(0).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    typeKeys('101');
    press('Enter');
    expect(grid.cols[0].tripNo).toBe('101');
    expect(gridData().tripRow).toBe(true);
  });

  it('is a row like the others for the arrow keys: day codes → trip numbers → first stop', () => {
    grid.tripRow = true;
    /** @type {HTMLElement} */ (document.querySelector('.g-dc-cell[data-ci="0"]')).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    press('ArrowDown');
    expect(tn(0).classList.contains('tn-sel')).toBe(true);
    press('ArrowDown');
    expect(/** @type {HTMLElement} */ (document.querySelector('.is-anchor')).dataset.r).toBe('0');
    press('ArrowUp');
    expect(tn(0).classList.contains('tn-sel')).toBe(true);
  });

  it('hides again, taking its numbers away after asking', () => {
    grid.tripRow = true;
    grid.cols[0].tripNo = '7';
    dcMenu();
    expect(document.getElementById('gc-tripno')?.textContent).toBe('Skjul turnummer');
    /** @type {HTMLElement} */ (document.getElementById('gc-tripno')).click();
    expect(document.querySelector('.g-row-tn')).toBeNull();
    expect(grid.cols[0].tripNo).toBe('');
  });
});

describe('review fixes: cut and paste never reach hidden times', () => {
  beforeEach(() => { initGrid(); });
  it('Ctrl+X in the day-code or trip-number row leaves the times alone', async () => {
    grid.tripRow = true;
    render();
    /** @type {HTMLElement} */ (document.querySelector('.g-tn-cell[data-ci="0"]')).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    press('x', { ctrlKey: true });
    /** @type {HTMLElement} */ (document.querySelector('.g-dc-cell[data-ci="0"]')).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    press('x', { ctrlKey: true });
    for (let i = 0; i < 4; i++) await new Promise((res) => setTimeout(res, 0)); // a cut finishes after the copy
    expect(grid.cols[0].cells.map((c) => c?.time)).toEqual(['0700', '0745']);
  });
  it('a paste in the trip-number row does not change the times', () => {
    grid.tripRow = true;
    render();
    /** @type {HTMLElement} */ (document.querySelector('.g-tn-cell[data-ci="0"]')).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    const ev = new Event('paste', { bubbles: true, cancelable: true });
    /** @type {any} */ (ev).clipboardData = { getData: () => '0900\n0930' };
    document.dispatchEvent(ev);
    expect(grid.cols[0].cells.map((c) => c?.time)).toEqual(['0700', '0745']);
  });
});

describe('the right-click menu stays inside the window (user test 2026-10-17)', () => {
  beforeEach(() => { initGrid(); });
  it('opens upwards when there is no room below, and leftwards near the right edge', () => {
    Object.defineProperty(window, 'innerHeight', { value: 600, configurable: true });
    Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true });
    const menu = /** @type {HTMLElement} */ (document.getElementById('grid-ctx'));
    Object.defineProperty(menu, 'offsetHeight', { value: 400, configurable: true });
    Object.defineProperty(menu, 'offsetWidth', { value: 220, configurable: true });
    /** @type {HTMLElement} */ (document.querySelector('[data-r="1"][data-c="0"]')).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 700, clientY: 560 }));
    expect(parseInt(menu.style.top, 10) + 400).toBeLessThanOrEqual(600);
    expect(parseInt(menu.style.left, 10) + 220).toBeLessThanOrEqual(800);
  });
});

describe('loose ends (2026-10-17)', () => {
  beforeEach(() => { initGrid(); });
  const at = (/** @type {number} */ r, /** @type {number} */ c) => /** @type {HTMLElement} */ (document.querySelector(`[data-r="${r}"][data-c="${c}"]`));

  it('after copying at an interval, the marker stays on the column it was on', () => {
    loadGrid({ stops: [stop('A'), stop('B')], cols: [
      { dayCode: 'D', note: '', dates: [], cells: [cell('0700'), cell('0745')] },
      { dayCode: 'D', note: '', dates: [], cells: [cell('1000'), cell('1045')] }] }, { readOnly: false });
    at(0, 1).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    /** @type {HTMLElement} */ (document.querySelector('.g-dc-cell[data-ci="0"]')).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    /** @type {HTMLElement} */ (document.getElementById('gc-copy-int')).click();
    const box = /** @type {HTMLElement} */ (document.querySelector('.float-box'));
    const set = (/** @type {string} */ sel, /** @type {string} */ v) => { const i = /** @type {HTMLInputElement} */ (box.querySelector(sel)); i.value = v; i.dispatchEvent(new Event('input')); };
    set('.cpi-interval', '30');
    set('.cpi-last', '08:00');
    /** @type {HTMLElement} */ (box.querySelector('.fb-apply')).click();
    press('ArrowDown'); press('ArrowUp'); // back on the time grid
    expect(/** @type {HTMLElement} */ (document.querySelector('.is-anchor')).textContent).toBe('1000');
  });

  it('a drag released outside the window stops at the next move', () => {
    at(0, 0).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    at(1, 0).dispatchEvent(new MouseEvent('mouseover', { bubbles: true, buttons: 0 })); // no button held any more
    expect(at(1, 0).classList.contains('in-range')).toBe(false);
  });

  it('a trip number in a read-only table cannot be selected', () => {
    loadGrid({ stops: [stop('A')], cols: [{ dayCode: 'D', note: '', dates: [], tripNo: '5', cells: [cell('0700')] }], tripRow: true }, { readOnly: true });
    /** @type {HTMLElement} */ (document.querySelector('.g-tn-cell[data-ci="0"]')).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    expect(document.querySelector('.tn-sel')).toBeNull();
  });
});

describe('copying a stop between rows with Ctrl+C / Ctrl+V (user test 2026-10-17)', () => {
  beforeEach(() => { initGrid(); });
  const nameCell = (/** @type {number} */ ri) => /** @type {HTMLElement} */ (document.querySelector(`.g-td-name[data-ri="${ri}"]`));

  it('copies the stop (its Quay ID) and pastes it on another row', async () => {
    /** @type {string[]} */ const wrote = [];
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (/** @type {string} */ s) => { wrote.push(s); } }, configurable: true });
    nameCell(0).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    press('c', { ctrlKey: true });
    await new Promise((res) => setTimeout(res, 0));
    expect(wrote).toEqual(['NSR:Quay:7203']);
    nameCell(1).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    const ev = new Event('paste', { bubbles: true, cancelable: true });
    /** @type {any} */ (ev).clipboardData = { getData: () => 'NSR:Quay:7203' };
    document.dispatchEvent(ev);
    expect(grid.stops[1]).toMatchObject({ stopId: 'NSR:Quay:7203', name: 'Sentrum' });
    expect(grid.cols[0].cells[1].time).toBe('0745'); // the times are not touched
  });

  it('pastes nothing that is not a Quay ID into a stop', () => {
    nameCell(1).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    const ev = new Event('paste', { bubbles: true, cancelable: true });
    /** @type {any} */ (ev).clipboardData = { getData: () => '0800' };
    document.dispatchEvent(ev);
    expect(grid.stops[1].stopId).toBe(null);
    expect(grid.cols[0].cells[1].time).toBe('0745');
  });
});

describe('code review 2026-10-17', () => {
  beforeEach(() => { initGrid(); });

  it('a pasted time keeps the cell\'s note and dates, as a typed time does', () => {
    grid.cols[0].cells[1].note = 'Bytt';
    grid.cols[0].cells[1].dates = [{ from: '20261224', to: '20261224', on: false }];
    /** @type {HTMLElement} */ (document.querySelector('[data-r="1"][data-c="0"]')).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    const ev = new Event('paste', { bubbles: true, cancelable: true });
    /** @type {any} */ (ev).clipboardData = { getData: () => '0750' };
    document.dispatchEvent(ev);
    expect(grid.cols[0].cells[1]).toMatchObject({ time: '0750', note: 'Bytt', dates: [{ from: '20261224', to: '20261224', on: false }] });
  });

  it('deleting the departure row of a dwell stop leaves its arrival row as an ordinary stop', () => {
    loadGrid({ stops: [stop('A'), { ...stop('X', 'NSR:Quay:9'), isDwellArr: true }, stop('X', 'NSR:Quay:9'), stop('Y')],
      cols: [{ dayCode: 'D', note: '', dates: [], cells: [cell('0700'), cell('0710'), null, cell('0730')] }] }, { readOnly: false });
    window.confirm = () => true;
    /** @type {HTMLElement} */ (document.querySelectorAll('.g-ibtn-del')[2]).dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(grid.stops.map((s) => s.name)).toEqual(['A', 'X', 'Y']);
    expect(grid.stops[1].isDwellArr).toBe(false);
  });
});

describe('day codes: copy and paste between columns (39)', () => {
  it('copies a column\'s day code and pastes it on another', () => {
    loadGrid({ stops: [stop('A'), stop('B')], cols: [{ dayCode: 'DX67', cells: [cell('0700'), cell('0710')] }, { dayCode: '6', cells: [cell('0800'), cell('0810')] }] });
    const dc = (/** @type {number} */ ci) => /** @type {HTMLElement} */ (document.querySelector(`.g-dc-cell[data-ci="${ci}"]`));
    dc(0).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    press('c', { ctrlKey: true });
    dc(1).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    press('v', { ctrlKey: true });
    expect(grid.cols[1].dayCode).toBe('DX67');
  });
});

describe('day codes tidy themselves (44)', () => {
  it('turns a typed DX76 into DX67', () => {
    loadGrid({ stops: [stop('A'), stop('B')], cols: [{ dayCode: 'D', cells: [cell('0700'), cell('0710')] }] });
    /** @type {HTMLElement} */ (document.querySelector('.g-dc-cell[data-ci="0"]')).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    typeKeys('DX76');
    press('Enter');
    expect(grid.cols[0].dayCode).toBe('DX67');
  });
});

describe('frozen rows and stop column (49)', () => {
  it('stacks the header rows from the measured heights and tells the scroll area how much is frozen', () => {
    loadGrid({ stops: [stop('A'), stop('B')], cols: [{ dayCode: 'D', cells: [cell('0700'), cell('0710')] }] });
    const rows = [...document.querySelectorAll('#tbl tr')].slice(0, 3);
    for (const tr of rows) expect(/** @type {HTMLElement} */ (tr).style.top).toMatch(/^\d+px$/);
    const wrap = /** @type {HTMLElement} */ (document.getElementById('tbl-wrap'));
    expect(wrap.style.scrollPaddingTop).toMatch(/^\d+px$/);
    expect(wrap.style.scrollPaddingLeft).toMatch(/^\d+px$/);
  });
});

describe('a note on several cells at once (47)', () => {
  it('puts the note on every time in the selection', () => {
    loadGrid({ stops: [stop('A'), stop('B'), stop('C')], cols: [{ dayCode: 'D', cells: [cell('0700'), cell('0710'), null] }, { dayCode: 'D', cells: [cell('0800'), cell('0810'), cell('0820')] }] });
    const td = (/** @type {number} */ r, /** @type {number} */ c) => /** @type {HTMLElement} */ (document.querySelector(`[data-r="${r}"][data-c="${c}"]`));
    td(0, 0).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    td(2, 1).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, shiftKey: true }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    press('F7');
    const input = /** @type {HTMLInputElement} */ (document.querySelector('.float-box .note-text'));
    expect(document.querySelector('.float-box')?.textContent).toContain('5');
    input.value = 'Bytt buss';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect([grid.cols[0].cells[0].note, grid.cols[0].cells[1].note, grid.cols[1].cells[0].note, grid.cols[1].cells[1].note, grid.cols[1].cells[2].note]).toEqual(Array(5).fill('Bytt buss'));
    expect(grid.cols[0].cells[2]).toBe(null); // an empty cell gets no note
  });
});

describe('times aligned, with room for marks (35)', () => {
  it('puts the time and its marks (a/p/x, +1) in two parts, so every time starts at the same place', () => {
    loadGrid({ stops: [stop('A'), stop('B')], cols: [{ dayCode: 'D', cells: [cell('0700'), { ...cell('0010'), suffix: 'p', dayOffset: 1 }] }] });
    const td = (/** @type {number} */ r) => /** @type {HTMLElement} */ (document.querySelector(`[data-r="${r}"][data-c="0"]`));
    expect(td(0).querySelector('.g-t')?.textContent).toBe('0700');
    expect(td(0).querySelector('.g-m')?.textContent).toBe('');
    expect(td(1).querySelector('.g-t')?.textContent).toBe('0010');
    expect(td(1).querySelector('.g-m')?.textContent).toBe('p+1');
    expect(td(1).textContent).toBe('0010p+1');
  });
});

describe('platform code beside the stop name (63)', () => {
  it('shows the Quay\'s platform code when NSR has one, and nothing when it has none', async () => {
    const { quayInfo } = await import('../../src/ui/quays.js');
    quayInfo.set('NSR:Quay:7203', { quayId: 'NSR:Quay:7203', publicCode: 'B', stopPlaceId: 'NSR:StopPlace:1', stopPlaceName: 'Sentrum', mode: 'bus', lat: 0, lon: 0 });
    quayInfo.set('NSR:Quay:9', { quayId: 'NSR:Quay:9', publicCode: '', stopPlaceId: 'NSR:StopPlace:2', stopPlaceName: 'Flyplass', mode: 'bus', lat: 0, lon: 0 });
    loadGrid({ stops: [stop('Sentrum', 'NSR:Quay:7203'), stop('Flyplass', 'NSR:Quay:9'), stop('Uten ID')], cols: [{ dayCode: 'D', cells: [cell('0700'), cell('0745'), null] }] });
    const names = [...document.querySelectorAll('.g-td-name')];
    expect(names[0].querySelector('.g-plat')?.textContent).toBe('B');
    expect(names[0].textContent).toBe('SentrumB');
    expect(names[1].querySelector('.g-plat')).toBeNull();
    expect(names[2].querySelector('.g-plat')).toBeNull();
  });
});

describe('pasting lists (57, and wider pastes)', () => {
  const paste = (/** @type {string} */ text) => {
    const ev = new Event('paste', { bubbles: true, cancelable: true });
    /** @type {any} */ (ev).clipboardData = { getData: () => text };
    document.dispatchEvent(ev);
  };
  const nameCell = (/** @type {number} */ ri) => /** @type {HTMLElement} */ (document.querySelector(`.g-td-name[data-ri="${ri}"]`));
  const JSON_PASTE = '{"data":{"lines":[{"id":"VIL:Line:1","journeyPatterns":[{"quays":[{"id":"NSR:Quay:459"},{"id":"NSR:Quay:21652"},{"id":"NSR:Quay:21647"}]}]}';

  it('puts every Quay ID in the pasted text into the stop rows from the selected one down, adding rows', () => {
    loadGrid({ stops: [stop('A'), stop('B')], cols: [{ dayCode: 'D', cells: [cell('0700'), cell('0710')] }] });
    nameCell(1).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    paste(JSON_PASTE); // sloppy: not even valid JSON
    expect(grid.stops.map((s) => s.stopId)).toEqual([null, 'NSR:Quay:459', 'NSR:Quay:21652', 'NSR:Quay:21647']);
    expect(grid.cols[0].cells.map((c) => c?.time ?? null)).toEqual(['0700', '0710', null, null]); // times stay
    expect(grid.cols[0].dests).toHaveLength(4);
  });

  it('takes IDs from lines, commas and semicolons alike', () => {
    loadGrid({ stops: [stop('A')], cols: [{ dayCode: 'D', cells: [cell('0700')] }] });
    nameCell(0).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    paste('NSR:Quay:1;NSR:Quay:2, NSR:Quay:3\nNSR:Quay:4');
    expect(grid.stops.map((s) => s.stopId)).toEqual(['NSR:Quay:1', 'NSR:Quay:2', 'NSR:Quay:3', 'NSR:Quay:4']);
  });

  it('asks before adding more than 50 rows, and adds nothing on no', () => {
    loadGrid({ stops: [stop('A')], cols: [{ dayCode: 'D', cells: [cell('0700')] }] });
    nameCell(0).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    const asked = [];
    window.confirm = (/** @type {string} */ m) => { asked.push(m); return false; };
    paste(Array.from({ length: 60 }, (_, i) => `NSR:Quay:${i + 1}`).join('\n'));
    expect(asked[0]).toContain('59');
    expect(grid.stops).toHaveLength(1);
    window.confirm = () => true;
  });

  it('adds the columns and rows a pasted block of times needs', () => {
    loadGrid({ stops: [stop('A'), stop('B')], cols: [{ dayCode: 'D', cells: [cell('0700'), cell('0710')] }] });
    /** @type {HTMLElement} */ (document.querySelector('[data-r="0"][data-c="0"]')).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    paste('0800\t0900\t1000\n0810\t0910\t1010\n0820\t0920\t1020');
    expect(grid.cols).toHaveLength(3);
    expect(grid.stops).toHaveLength(3);
    expect(grid.cols.map((c) => c.cells.map((x) => x?.time))).toEqual([['0800', '0810', '0820'], ['0900', '0910', '0920'], ['1000', '1010', '1020']]);
    expect(grid.cols[2].dests).toHaveLength(3);
    expect(grid.cols[2].uid).toBeTruthy();
  });

  it('asks before adding more than 50 columns', () => {
    loadGrid({ stops: [stop('A')], cols: [{ dayCode: 'D', cells: [cell('0700')] }] });
    /** @type {HTMLElement} */ (document.querySelector('[data-r="0"][data-c="0"]')).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    const asked = [];
    window.confirm = (/** @type {string} */ m) => { asked.push(m); return false; };
    paste(Array.from({ length: 60 }, () => '0800').join('\t'));
    expect(asked[0]).toContain('59');
    expect(grid.cols).toHaveLength(1);
    window.confirm = () => true;
  });
});

describe('review fixes 2.2', () => {
  const paste = (/** @type {string} */ text) => {
    const ev = new Event('paste', { bubbles: true, cancelable: true });
    /** @type {any} */ (ev).clipboardData = { getData: () => text };
    document.dispatchEvent(ev);
  };
  it('a stop list keeps a waiting stop\'s two rows as one stop', () => {
    loadGrid({ stops: [{ ...stop('X', 'NSR:Quay:9'), isDwellArr: true }, stop('X', 'NSR:Quay:9'), stop('Y')], cols: [{ dayCode: 'D', cells: [cell('0700'), cell('0705'), cell('0710')] }] });
    /** @type {HTMLElement} */ (document.querySelector('.g-td-name[data-ri="0"]')).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    paste('NSR:Quay:1\nNSR:Quay:2');
    expect(grid.stops.map((s) => s.stopId)).toEqual(['NSR:Quay:1', 'NSR:Quay:1', 'NSR:Quay:2']);
    expect(grid.stops[0].isDwellArr).toBe(true);
  });

  it('keeps the old name of a stop NSR does not know', () => {
    loadGrid({ stops: [stop('Gammel'), stop('B')], cols: [{ dayCode: 'D', cells: [cell('0700'), cell('0710')] }] });
    /** @type {HTMLElement} */ (document.querySelector('.g-td-name[data-ri="0"]')).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    paste('NSR:Quay:77\nNSR:Quay:78');
    expect(grid.stops[0].name).toBe('Gammel');
  });
});

describe('small wave 2', () => {
  it('a paste with nothing that reads as a time adds no rows or columns', () => {
    loadGrid({ stops: [stop('A')], cols: [{ dayCode: 'D', cells: [cell('0700')] }] });
    /** @type {HTMLElement} */ (document.querySelector('[data-r="0"][data-c="0"]')).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    const ev = new Event('paste', { bubbles: true, cancelable: true });
    /** @type {any} */ (ev).clipboardData = { getData: () => 'hei\tpå\tdeg\nhallo\tigjen' };
    document.dispatchEvent(ev);
    expect(grid.cols).toHaveLength(1);
    expect(grid.stops).toHaveLength(1);
  });

  it('the note bar sits above the speed profile', () => {
    const preview = document.getElementById('fn-preview'), strip = document.getElementById('speed-strip');
    expect(preview && strip && (preview.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING)).toBeTruthy();
  });
});

describe('the private code beside the stop name (a view setting)', () => {
  it('shows the Quay\'s private code in its own grey chip only when the setting is on', async () => {
    const { quayInfo } = await import('../../src/ui/quays.js');
    quayInfo.set('NSR:Quay:7203', { quayId: 'NSR:Quay:7203', publicCode: 'B', privateCode: '06', stopPlaceId: 'NSR:StopPlace:1', stopPlaceName: 'Sentrum', mode: 'bus', lat: 0, lon: 0 });
    app.settings.showPrivateCode = false;
    loadGrid({ stops: [stop('Sentrum', 'NSR:Quay:7203')], cols: [{ dayCode: 'D', cells: [cell('0700')] }] });
    expect(document.querySelector('.g-td-name .g-priv')).toBeNull();
    app.settings.showPrivateCode = true;
    render();
    const name = /** @type {HTMLElement} */ (document.querySelector('.g-td-name'));
    expect(name.querySelector('.g-plat')?.textContent).toBe('B');
    expect(name.querySelector('.g-priv')?.textContent).toBe('06');
    app.settings.showPrivateCode = false;
  });
});

describe('interchanges in a big timetable (user 2026-10-19: speed)', () => {
  it('marks the cell an interchange points to, and only that one', () => {
    const from = { ...cell('0700'), interchange: { targetC: 1, targetR: 1, type: 'guaranteed' } };
    loadGrid({ stops: [stop('A'), stop('B')], cols: [{ dayCode: 'D', cells: [from, cell('0710')] }, { dayCode: 'D', cells: [cell('0705'), cell('0715')] }] });
    const td = (/** @type {number} */ r, /** @type {number} */ c) => /** @type {HTMLElement} */ (document.querySelector(`[data-r="${r}"][data-c="${c}"]`));
    expect(td(0, 0).classList.contains('g-ix-g')).toBe(true);
    expect(td(1, 1).classList.contains('g-ix-tg')).toBe(true);
    expect(document.querySelectorAll('.g-ix-tg, .g-ix-ts')).toHaveLength(1);
  });
});
