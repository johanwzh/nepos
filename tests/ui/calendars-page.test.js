// @vitest-environment jsdom
// Kalendere (calendars page spec, part A): a tab of its own with a list of calendars, and an editor
// with a switcher, a run of months, and save/discard like lines.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadAppMarkup, flush } from './dom-setup.js';
import { app } from '../../src/ui/state.js';
import { initShell, setPage, currentPage } from '../../src/ui/shell.js';
import { initAssetsNav } from '../../src/ui/assets-nav.js';
import { initCalendarsPage } from '../../src/ui/calendars-page.js';
import { createMemoryFs, readText } from '../../src/project/fs.js';
import { writeCalendars } from '../../src/project/calendars-store.js';
import { writeRoute, readRoute } from '../../src/project/routes.js';
import { initCalendarReplace } from '../../src/ui/calendar-replace-ui.js';

/** @type {any} */ let fs;
const page = () => /** @type {HTMLElement} */ (document.getElementById('calendars-body'));
const q = (/** @type {string} */ sel) => /** @type {HTMLElement} */ (page().querySelector(sel));
const click = (/** @type {string} */ sel) => q(sel).click();
const rows = () => /** @type {HTMLElement[]} */ ([...page().querySelectorAll('.cl-table tbody tr[data-cal]')]);
const titles = () => [...page().querySelectorAll('.yv-title')].map((e) => e.textContent);
const day = (/** @type {string} */ d) => q(`.yv-day[data-date="${d}"]`);
/** @param {string} d */
const toggle = (d) => { day(d).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); document.body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); };
const saved = async () => JSON.parse((await readText(fs, 'data/calendars.json')) ?? '[]');
const key = (/** @type {string} */ k) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, altKey: true, bubbles: true, cancelable: true }));

const ROUTE = '#LEV;T;TST\r\n#RUT;-1;10;Oslo - Gol;;1;\r\n#TRA;Oslo - Gol\r\n#PER;;;;;;\r\n#KAL;c1\r\n#TAB;0;;;;\r\n';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-16T12:00:00'));
  loadAppMarkup();
  initShell(); initAssetsNav(); initCalendarsPage(); initCalendarReplace();
  fs = createMemoryFs();
  Object.assign(app, { fs, meta: { formatVersion: 1, name: 'X', codespace: 'TST' }, calendars: [], calendarsError: null, calendarDrafts: new Map(),
    calendarSelected: null, calendarMonth: '', routes: [], orgs: [], orgsError: null, drafts: new Map(), activeRoute: null, routeState: null });
  window.confirm = vi.fn(() => true);
  setPage('calendars');
});
afterEach(() => vi.useRealTimers());

describe('Kalendere: a page of its own', () => {
  it('is the Alt+3 tab, and Ressurser no longer lists calendars', () => {
    setPage('edit');
    key('3');
    expect(currentPage()).toBe('calendars');
    expect([...document.querySelectorAll('.assets-nav-item')].map((e) => /** @type {HTMLElement} */ (e).dataset.sec)).toEqual(['brandings', 'orgs']);
  });

  it('lists the calendars with their span, days, use and status; double-click opens one', () => {
    app.calendars = [{ id: 'c1', name: 'Vinter 26/27', ranges: [['20261201', '20270131']] }, { id: 'c2', name: 'Gammel', ranges: [['20250101', '20250110']] }];
    app.routes = [{ code: 'r', text: ROUTE, status: 'ok', issues: [] }];
    setPage('calendars');
    expect(rows().map((r) => r.querySelector('.cl-name')?.textContent)).toEqual(['Gammel', 'Vinter 26/27']);
    const vinter = rows()[1];
    expect(vinter.textContent).toContain('01.12.2026 – 31.01.2027');
    expect(vinter.textContent).toContain('62');
    expect(vinter.querySelector('.cl-used')?.textContent).toBe('1 linje · 1 tabellsett');
    expect(rows()[0].querySelector('.cl-status')?.textContent).toContain('Utløpt');
    vinter.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(app.calendarSelected).toBe('c1');
    expect(q('.cl-editor')).not.toBeNull();
  });
});

describe('the calendar editor', () => {
  it('opens at the first valid month with the span as its heading, and steps a row of three months', () => {
    app.calendars = [{ id: 'c1', name: 'V', ranges: [['20270104', '20270619']] }];
    app.calendarSelected = 'c1';
    setPage('calendars');
    expect(q('.ce-span').textContent).toBe('04.01.2027 – 19.06.2027');
    expect(titles()).toHaveLength(12);
    expect(titles()[0]).toContain('Januar 2027');
    click('.ce-next');
    expect(titles()[0]).toContain('April 2027');
    click('.ce-prev');
    click('.ce-prev');
    expect(titles()[0]).toContain('Oktober 2026');
  });

  it('never moves the months when days change; "I dag" puts this month in the middle of the second row', () => {
    app.calendars = [{ id: 'c1', name: 'V', ranges: [['20261201', '20270301']] }];
    app.calendarSelected = 'c1';
    setPage('calendars');
    expect(titles()[0]).toContain('Desember 2026');
    toggle('20261201');                 // take the first day away: the view stays
    toggle('20261202');
    expect(titles()[0]).toContain('Desember 2026');
    click('.ce-today');
    expect(titles()[4]).toContain('Oktober 2026'); // today is 16 Oct 2026
    expect(titles()[0]).toContain('Juni 2026');
  });

  it('opens an empty calendar at the current month', () => {
    click('.cl-new');
    expect(titles()[0]).toContain('Oktober 2026');
    expect(q('.ce-span').textContent).toBe('Ingen datoer');
  });

  it('keeps edits unsaved until Lagre, marks them, and Forkast throws them away', async () => {
    app.calendars = [{ id: 'c1', name: 'V', ranges: [['20270104', '20270105']] }];
    await writeCalendars(fs, app.calendars);
    app.calendarSelected = 'c1';
    setPage('calendars');
    toggle('20270106');
    expect(app.calendars[0].ranges).toEqual([['20270104', '20270105']]); // lines still see the saved one
    expect(q('.ce-switch .active')?.textContent).toContain('●');
    click('.ce-discard');
    expect(app.calendarDrafts.size).toBe(0);
    expect(day('20270106').classList.contains('on')).toBe(false);
    toggle('20270106');
    click('.ce-save');
    await flush(); await flush();
    expect((await saved())[0].ranges).toEqual([['20270104', '20270106']]);
    expect(app.calendarDrafts.size).toBe(0);
  });

  it('a new calendar is unsaved until it has a name and is saved', async () => {
    click('.cl-new');
    expect(/** @type {HTMLButtonElement} */ (q('.ce-save')).disabled).toBe(true);
    const name = /** @type {HTMLInputElement} */ (q('.ce-name'));
    name.value = 'Sommer';
    name.dispatchEvent(new Event('input'));
    toggle('20261020');
    expect(await saved()).toEqual([]);
    click('.ce-save');
    await flush(); await flush();
    expect(await saved()).toMatchObject([{ name: 'Sommer', ranges: [['20261020', '20261020']] }]);
  });

  it('switches between calendars on the left, and goes back to the list', () => {
    app.calendars = [{ id: 'c1', name: 'A', ranges: [] }, { id: 'c2', name: 'B', ranges: [] }];
    app.calendarSelected = 'c1';
    setPage('calendars');
    /** @type {HTMLElement} */ ([...page().querySelectorAll('.ce-switch [data-cal]')].find((e) => e.textContent?.includes('B'))).click();
    expect(app.calendarSelected).toBe('c2');
    click('.ce-back');
    expect(app.calendarSelected).toBeNull();
    expect(rows()).toHaveLength(2);
  });

  it('duplicates as next season, 52 weeks later, as an unsaved calendar', async () => {
    app.calendars = [{ id: 'c1', name: 'Vinter 26/27', ranges: [['20260817', '20261220']] }];
    app.calendarSelected = 'c1';
    setPage('calendars');
    click('.ce-dup');
    const copy = app.calendarDrafts.get(/** @type {string} */ (app.calendarSelected));
    expect(copy).toMatchObject({ name: 'Vinter 26/27 (kopi)', ranges: [['20270816', '20271219']] });
    click('.ce-save');
    await flush(); await flush();
    expect((await saved())).toHaveLength(2);
  });

  it('asks before deleting a calendar lines use, naming them', async () => {
    app.calendars = [{ id: 'c1', name: 'Vinter', ranges: [] }];
    await writeCalendars(fs, app.calendars);
    app.routes = [{ code: 'r', text: ROUTE, status: 'ok', issues: [] }];
    app.calendarSelected = 'c1';
    setPage('calendars');
    click('.ce-del');
    await flush();
    expect(/** @type {any} */ (window.confirm).mock.calls[0][0]).toContain('10 Oslo - Gol · Oslo - Gol');
    expect(await saved()).toEqual([]);
    expect(app.calendarSelected).toBeNull();
  });

  it('replaces a calendar in every saved route, telling which file could not be saved', async () => {
    const r1 = '#TRA;A\r\n#PER;;;;;;\r\n#KAL;c1\r\n#TAB;0;;;;\r\n', r2 = '#TRA;B\r\n#PER;;;;;;\r\n#KAL;c1\r\n#TAB;0;;;;\r\n';
    await writeRoute(fs, 'r1', r1);
    await writeRoute(fs, 'r2', r2);
    app.routes = [{ code: 'r1', text: r1, status: 'ok', issues: [] }, { code: 'r2', text: r2, status: 'ok', issues: [] }];
    app.calendars = [{ id: 'c1', name: 'Gammel', ranges: [] }, { id: 'c2', name: 'Ny', ranges: [] }];
    app.calendarSelected = 'c1';
    const write = fs.writeBytes;
    fs.writeBytes = async (/** @type {string} */ p, /** @type {Uint8Array} */ b) => { if (p.includes('r2')) throw new Error('låst'); return write(p, b); };
    setPage('calendars');
    click('.ce-replace');
    /** @type {HTMLSelectElement} */ (document.getElementById('cal-replace-to')).value = 'c2';
    /** @type {HTMLElement} */ (document.getElementById('cal-replace-ok')).click();
    await flush(); await flush();
    expect(await readRoute(fs, 'r1')).toContain('#KAL;c2');
    expect(document.getElementById('msg-text')?.textContent).toContain('r2');
  });
});
