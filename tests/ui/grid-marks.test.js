// @vitest-environment jsdom
// Marks on a time (booking spec 2026-10-22): a/p, x (request stop or booking), one note letter. x is never typed.
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadAppMarkup } from './dom-setup.js';
import { app } from '../../src/ui/state.js';
import { initShell } from '../../src/ui/shell.js';
import { grid, initGrid, loadGrid, selectCell, gridData } from '../../src/ui/grid.js';
import { initFootnoteEditor } from '../../src/ui/footnote-editor.js';
import { newRouteState } from '../../src/ui/route-state.js';

const stop = (name) => ({ name, stopId: null, bold: false, sep: false, isDwellArr: false, price: null });
const cell = (time, more = {}) => ({ time, dayOffset: 0, suffix: '', interchange: null, ...more });
const press = (key, opts = {}) => document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...opts }));
const td = (/** @type {number} */ r, /** @type {number} */ c) => /** @type {HTMLElement} */ (document.querySelector(`td[data-r="${r}"][data-c="${c}"]`));
const marks = (/** @type {number} */ r, /** @type {number} */ c) => td(r, c)?.querySelector('.g-m')?.textContent ?? '';

let wired = false;
beforeEach(() => {
  loadAppMarkup();
  initShell();
  initGrid();
  if (!wired) { initFootnoteEditor(); wired = true; }
  app.routeState = newRouteState('no');
  loadGrid({ stops: [stop('S'), stop('A'), stop('B'), stop('E')], cols: [
    { dayCode: 'D', cells: [cell('0650'), cell('0700', { suffix: 'a', req: true }), cell('0710', { suffix: 'x' }), cell('0720')], note: '', dates: [] },
  ] });
});

describe('a/p and x on a time', () => {
  it('shows a then x', () => {
    expect(marks(1, 0)).toBe('ax');
  });

  it('turns a 2.3 x suffix into a request stop on load', () => {
    expect(grid.cols[0].cells[2]).toMatchObject({ suffix: '', req: true });
    expect(gridData().cols[0].cells[2].suffix).toBe('');
  });

  it('shows a/p, x and the note letter, with no hover text', () => {
    loadGrid({ stops: [stop('S'), stop('A'), stop('B'), stop('E')], cols: [
      { dayCode: 'D', cells: [cell('0600'), cell('0605', { suffix: 'a', req: true, note: 'Bytt her' }), cell('0610', { dates: [{ from: '20260101', to: '20260101', on: false }] }), cell('0620')], note: '', dates: [] },
    ] });
    expect(marks(1, 0)).toBe('axb');
    expect(marks(2, 0)).toBe('c');
    expect(td(1, 0).title).toBe('');
    expect(td(2, 0).title).toBe('');
  });

  it('F8 sets a request stop on every selected time at once', () => {
    loadGrid({ stops: [stop('A'), stop('B')], cols: [{ dayCode: 'D', cells: [cell('0700'), cell('0710')], note: '', dates: [] }] });
    selectCell(0, 0);
    press('ArrowDown', { shiftKey: true });
    press('F8');
    const req = /** @type {HTMLInputElement} */ (document.querySelector('.bk-kind[value="req"]'));
    req.checked = true; req.dispatchEvent(new Event('change', { bubbles: true }));
    /** @type {HTMLElement} */ (document.querySelector('.fb-apply')).click();
    expect(grid.cols[0].cells.map((c) => !!c.req)).toEqual([true, true]);
    expect(marks(0, 0)).toBe('x');
  });

  it('F8 booking starts as a copy of the trip booking and shows x on the time', () => {
    loadGrid({ stops: [stop('A'), stop('B')], cols: [{ dayCode: 'D', cells: [cell('0700'), cell('0710')], note: '', dates: [], booking: { access: 'public', phone: '77', methods: ['callOffice'], minAhead: 'PT1H' } }] });
    selectCell(1, 0);
    press('F8');
    const bk = /** @type {HTMLInputElement} */ (document.querySelector('.bk-kind[value="booking"]'));
    bk.checked = true; bk.dispatchEvent(new Event('change', { bubbles: true }));
    expect(/** @type {HTMLInputElement} */ (document.querySelector('.bk-phone')).value).toBe('77');
    /** @type {HTMLElement} */ (document.querySelector('.fb-apply')).click();
    expect(grid.cols[0].cells[1].booking).toEqual({ access: 'public', phone: '77', methods: ['callOffice'], minAhead: 'PT1H' });
    expect(marks(1, 0)).toBe('x');
    expect(marks(0, 0)).toBe(''); // a bookable trip puts no x on its times
  });

  it('a guaranteed interchange asks for its maximum wait time, and the menu can change it (user 2026-10-24)', () => {
    loadGrid({ stops: [stop('A'), stop('B')], cols: [{ dayCode: 'D', cells: [cell('0700'), cell('0710')], note: '', dates: [] }, { dayCode: 'D', cells: [cell('0715'), cell('0725')], note: '', dates: [] }] });
    const answers = ['5', '8'];
    window.prompt = () => answers.shift() ?? null;
    td(1, 0).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    /** @type {HTMLElement} */ (document.getElementById('gc-ix-g')).click();
    td(0, 1).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
    expect(grid.cols[0].cells[1].interchange).toMatchObject({ type: 'guaranteed', maxWait: 5 });
    td(1, 0).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    /** @type {HTMLElement} */ (document.getElementById('gc-ix-wait')).click();
    expect(grid.cols[0].cells[1].interchange.maxWait).toBe(8);
  });

  it('a trip\'s booking from its day code: F8, or right-click → Bestilling for turen (user 2026-10-26)', () => {
    loadGrid({ stops: [stop('A'), stop('B')], cols: [{ dayCode: 'D', cells: [cell('0700'), cell('0710')], note: '', dates: [] }] });
    const dc = /** @type {HTMLElement} */ (document.querySelector('.g-dc-cell[data-ci="0"]'));
    dc.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    press('F8');
    expect(document.querySelector('.bk-form')).not.toBeNull();
    expect(/** @type {HTMLInputElement} */ (document.querySelector('.bk-kind[value="req"]')).disabled).toBe(true);
    /** @type {HTMLElement} */ (document.querySelector('.fb-cancel')).click();
    dc.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    /** @type {HTMLElement} */ (document.getElementById('gc-dc-booking')).click();
    expect(document.querySelector('.bk-form')).not.toBeNull();
  });

  it('the note bar shows a guaranteed interchange\'s maximum wait time (user 2026-10-26)', () => {
    loadGrid({ stops: [stop('A'), stop('B')], cols: [
      { dayCode: 'D', cells: [cell('0700'), cell('0710', { interchange: { targetC: 1, targetR: 0, type: 'guaranteed', maxWait: 15 } })], note: '', dates: [] },
      { dayCode: 'D', cells: [cell('0715'), cell('0725')], note: '', dates: [] },
    ] });
    selectCell(1, 0);
    expect(document.getElementById('fn-preview')?.textContent).toContain('15 min');
  });

  it('the note row: F8 sets the trip booking, shown as an icon next to the dates', () => {
    loadGrid({ stops: [stop('A'), stop('B')], cols: [{ dayCode: 'D', cells: [cell('0700'), cell('0710')], note: '', dates: [] }] });
    const fnCell = /** @type {HTMLElement} */ (document.querySelector('.g-fn-cell[data-ci="0"]'));
    fnCell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    press('F8');
    expect(/** @type {HTMLInputElement} */ (document.querySelector('.bk-kind[value="req"]')).disabled).toBe(true); // a trip has no request stop
    const bk = /** @type {HTMLInputElement} */ (document.querySelector('.bk-kind[value="booking"]'));
    bk.checked = true; bk.dispatchEvent(new Event('change', { bubbles: true }));
    /** @type {HTMLElement} */ (document.querySelector('.bk-access .bk-chip[data-v="public"]')).click();
    /** @type {HTMLElement} */ (document.querySelector('.bk-methods .bk-chip[data-v="callOffice"]')).click();
    const phone = /** @type {HTMLInputElement} */ (document.querySelector('.bk-phone'));
    phone.value = '55';
    const ahead = /** @type {HTMLInputElement} */ (document.querySelector('.bk-mode[value="ahead"]'));
    ahead.checked = true; ahead.dispatchEvent(new Event('change', { bubbles: true }));
    /** @type {HTMLElement} */ (document.querySelector('.bk-dur[data-k="minAhead"] .bk-dur-read')).click();
    const dur = /** @type {HTMLInputElement} */ (document.querySelector('.bk-dur-input'));
    dur.value = '1t';
    dur.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    phone.dispatchEvent(new Event('input', { bubbles: true }));
    /** @type {HTMLElement} */ (document.querySelector('.fb-apply')).click();
    expect(grid.cols[0].booking).toEqual({ access: 'public', methods: ['callOffice'], phone: '55', minAhead: 'PT1H' });
    expect(document.querySelector('.g-fn-cell[data-ci="0"] .bk-col-mark')).not.toBeNull();
  });

  it('the note bar shows the note, dates, boarding rule, request stop and booking in full', () => {
    loadGrid({ stops: [stop('S'), stop('A'), stop('B'), stop('E')], cols: [{ dayCode: 'D', note: '', dates: [], booking: { url: 'https://t.no' }, cells: [
      cell('0650'),
      cell('0700', { suffix: 'a', req: true, note: 'Bytt her', dates: [{ from: '20260101', to: '20260101', on: false }] }),
      cell('0710', { suffix: 'p', booking: { phone: '22', methods: ['callOffice', 'online'], bookWhen: 'untilPreviousDay', latest: '1800' } }),
      cell('0720'),
    ] }] });
    selectCell(1, 0);
    const bar = () => /** @type {HTMLElement} */ (document.getElementById('fn-preview')).textContent ?? '';
    expect(bar()).toContain('Bytt her');
    expect(bar()).toContain('Kun avstigning');
    expect(bar()).toContain('Stopper ved behov');
    expect(bar()).toContain('1 fjernet');
    selectCell(2, 0);
    expect(bar()).toContain('Kun påstigning');
    expect(bar()).toContain('Bestilling');
    expect(bar()).toContain('22');
    expect(bar()).toContain('Ring kontoret, På nett');
    expect(bar()).toContain('Innen dagen før');
    expect(bar()).toContain('18:00');
  });

  it('the note bar shows the trip\'s booking on a time of a bookable trip', () => {
    loadGrid({ stops: [stop('A')], cols: [{ dayCode: 'D', note: '', dates: [], booking: { url: 'https://t.no' }, cells: [cell('0700')] }] });
    selectCell(0, 0);
    expect(document.getElementById('fn-preview')?.textContent).toContain('https://t.no');
  });

  it('a and p only on the stops in between: not on a trip\'s first or last stop (user 2026-10-27)', () => {
    loadGrid({ stops: [stop('A'), stop('B'), stop('C')], cols: [{ dayCode: 'D', cells: [cell('0700'), cell('0710'), cell('0720')], note: '', dates: [] }] });
    const ctx = (/** @type {number} */ r) => td(r, 0).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    ctx(0);
    expect(document.getElementById('gc-sfx-a')?.className).toContain('dis');
    expect(document.getElementById('gc-sfx-p')?.className).toContain('dis');
    ctx(1);
    expect(document.getElementById('gc-sfx-a')?.className).not.toContain('dis');
    // the whole column selected: only the middle stop gets it
    selectCell(0, 0);
    press('ArrowDown', { shiftKey: true });
    press('ArrowDown', { shiftKey: true });
    td(1, 0).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    /** @type {HTMLElement} */ (document.getElementById('gc-sfx-p')).click();
    expect(grid.cols[0].cells.map((c) => c.suffix)).toEqual(['', 'p', '']);
    // typed on a first or last stop: the time stays, the a or p does not
    selectCell(2, 0);
    for (const k of ['0', '7', '2', '5', 'a']) press(k);
    press('Enter');
    expect(grid.cols[0].cells[2]).toMatchObject({ time: '0725', suffix: '' });
  });

  it('a and p never stay on a trip\'s first or last stop: also when the ends move, and when a file has them (user 2026-10-27)', () => {
    loadGrid({ stops: [stop('A'), stop('B'), stop('C'), stop('D')], cols: [{ dayCode: 'D', cells: [cell('0700'), cell('0710', { suffix: 'p' }), cell('0720', { suffix: 'a' }), cell('0730', { suffix: 'a' })], note: '', dates: [] }] });
    expect(grid.cols[0].cells.map((c) => c.suffix)).toEqual(['', 'p', 'a', '']); // tidied on open: a on the last stop
    selectCell(0, 0);
    press('Delete'); // the trip now starts at B
    expect(grid.cols[0].cells[1].suffix).toBe('');
    expect(grid.cols[0].cells[2].suffix).toBe('a');
  });

  it('keeps the request stop when the time is typed again', () => {
    selectCell(1, 0);
    for (const k of ['0', '7', '0', '5', 'p']) press(k);
    press('Enter');
    expect(grid.cols[0].cells[1]).toMatchObject({ time: '0705', suffix: 'p', req: true });
  });
});

describe('day offsets without +1 text (backlog 78)', () => {
  it('the note bar says how many days after the day code a time is', () => {
    loadGrid({ stops: [stop('A'), stop('B')], cols: [{ dayCode: 'D', cells: [cell('2350'), cell('0150', { dayOffset: 2 })], note: '', dates: [] }] });
    selectCell(1, 0);
    expect(document.getElementById('fn-preview')?.textContent).toContain('2 dager etter dagkoden'); // the test app is in Norwegian
  });

  it('time cells are 56 px', () => {
    const css = readFileSync('src/ui/styles.css', 'utf8');
    expect(css).toMatch(/\.cw-time\s*\{\s*width: 56px; min-width: 56px; max-width: 56px;/);
  });
});

describe('first look at 2.5 (user 2026-10-30)', () => {
  const css = () => readFileSync('src/ui/styles.css', 'utf8');
  it('time cells never draw an ellipsis', () => {
    expect(css()).not.toMatch(/\.cw-time[^{]*\{[^}]*text-overflow: ellipsis/);
  });

  it('with a power tool on, the frozen header cells stay opaque (nothing scrolls through them)', () => {
    const rule = css().split('\n').find((l) => l.startsWith('body.pt-on #tbl :is(.g-row-ins')) ?? '';
    expect(rule).not.toContain('opacity');
  });

  it('the last frozen row is marked, so it gets a bottom edge', () => {
    const last = () => [...document.querySelectorAll('#tbl tr.g-frz-last')].map((tr) => tr.className.split(' ')[0]);
    expect(last()).toEqual(['g-row-dc']);
    grid.vehicleRow = true;
    loadGrid({ stops: [stop('S'), stop('E')], cols: [{ dayCode: 'D', cells: [cell('0700'), cell('0710')], note: '', dates: [] }] });
    grid.vehicleRow = true;
    selectCell(0, 0);
    expect(last()).toEqual(['g-row-lb']);
    grid.vehicleRow = false;
  });
});
