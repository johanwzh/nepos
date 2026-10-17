// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { loadAppMarkup } from './dom-setup.js';
import { app } from '../../src/ui/state.js';
import { initShell, setPage, currentPage } from '../../src/ui/shell.js';
import { grid, initGrid, loadGrid, onGridChange, gridData, selectedStopRow, render } from '../../src/ui/grid.js';
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

  it('sets a, p or x on every timed cell in the selection, ticks it, and takes it away again', () => {
    at(0, 0).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    at(1, 0).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, shiftKey: true }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    at(1, 0).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    item('gc-sfx-a').click();
    expect(grid.cols[0].cells.map((c) => c.suffix)).toEqual(['a', 'a']);
    expect(grid.cols[0].cells[0].time).toBe('0700'); // the time stays
    at(1, 0).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    expect(item('gc-sfx-a').textContent).toContain('✓');
    expect(item('gc-sfx-p').textContent).not.toContain('✓');
    item('gc-sfx-none').click();
    expect(grid.cols[0].cells.map((c) => c.suffix)).toEqual(['', '']);
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

describe('nudging times with the mini-jog (user test 2026-10-17)', () => {
  beforeEach(() => { initGrid(); });
  const open = () => {
    /** @type {HTMLElement} */ (document.querySelector('[data-r="0"][data-c="0"]')).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    /** @type {HTMLElement} */ (document.getElementById('gc-nudge')).click();
    return /** @type {HTMLElement} */ (document.querySelector('.nudge-box .jd'));
  };
  const key = (/** @type {Element} */ el, /** @type {string} */ k, shiftKey = false) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true, cancelable: true }));

  it('moves the whole column live, one minute a notch (Shift: ten), and Enter keeps it', () => {
    const jog = open();
    key(jog, 'ArrowUp');
    key(jog, 'ArrowUp', true);
    expect(grid.cols[0].cells.map((c) => c.time)).toEqual(['0711', '0756']);
    expect(document.querySelector('.nudge-read')?.textContent).toBe('+11 min');
    key(jog, 'Enter');
    expect(document.querySelector('.nudge-box')).toBeNull();
    expect(grid.cols[0].cells.map((c) => c.time)).toEqual(['0711', '0756']);
  });

  it('Esc puts the times back', () => {
    const jog = open();
    key(jog, 'ArrowDown');
    expect(grid.cols[0].cells[0].time).toBe('0659');
    key(jog, 'Escape');
    expect(grid.cols[0].cells.map((c) => c.time)).toEqual(['0700', '0745']);
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

  it('works for a single time too, from the right-click menu', () => {
    /** @type {HTMLElement} */ (document.querySelector('[data-r="1"][data-c="0"]')).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    /** @type {HTMLElement} */ (document.getElementById('gc-cell-dates')).click();
    click(day(12));
    /** @type {HTMLElement} */ (document.querySelector('.float-box .fb-apply')).click();
    expect(grid.cols[0].cells[1].dates).toEqual([{ from: day(12), to: day(12), on: true }]);
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
