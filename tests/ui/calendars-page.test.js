// @vitest-environment jsdom
// Kalendere (calendars page spec, part A): a tab of its own with a list of calendars, and an editor
// with a switcher, a run of months, and save/discard like lines.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadAppMarkup, flush } from './dom-setup.js';
import { app } from '../../src/ui/state.js';
import { initShell, setPage, currentPage } from '../../src/ui/shell.js';
import { initCalendarsPage } from '../../src/ui/calendars-page.js';
import { createMemoryFs, readText } from '../../src/project/fs.js';
import { writeCalendars } from '../../src/project/calendars-store.js';
import { writeRoute, readRoute } from '../../src/project/routes.js';
import { initCalendarReplace } from '../../src/ui/calendar-replace-ui.js';
import { resetListStates } from '../../src/ui/list-view.js';

/** @type {any} */ let fs;
const page = () => /** @type {HTMLElement} */ (document.getElementById('calendars-body'));
const q = (/** @type {string} */ sel) => /** @type {HTMLElement} */ (page().querySelector(sel));
const click = (/** @type {string} */ sel) => q(sel).click();
const rows = () => /** @type {HTMLElement[]} */ ([...page().querySelectorAll('.lv-row')]);
const titles = () => [...page().querySelectorAll('.yv-title')].map((e) => e.textContent);
const day = (/** @type {string} */ d) => q(`.yv-day[data-date="${d}"]`);
/** @param {string} d */
const toggle = (d) => { day(d).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); document.body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); };
const saved = async () => JSON.parse((await readText(fs, 'data/calendars.json')) ?? '[]');
const key = (/** @type {string} */ k) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, altKey: true, bubbles: true, cancelable: true }));

const ROUTE = '#LEV;T;TST\r\n#RUT;-1;10;Oslo - Gol;;1;\r\n#TRA;Oslo - Gol\r\n#PER;;;;;;\r\n#KAL;c1\r\n#TAB;0;;;;\r\n';

beforeEach(() => {
  resetListStates();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-16T12:00:00'));
  loadAppMarkup();
  initShell(); initCalendarsPage(); initCalendarReplace();
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
    expect(document.getElementById('resources-body')).not.toBeNull();
  });

  it('lists the calendars with their span, days, use and status; double-click opens one', () => {
    app.calendars = [{ id: 'c1', name: 'Vinter 26/27', ranges: [['20261201', '20270131']] }, { id: 'c2', name: 'Gammel', ranges: [['20250101', '20250110']] }];
    app.routes = [{ code: 'r', text: ROUTE, status: 'ok', issues: [] }];
    setPage('calendars');
    expect(rows().map((r) => r.querySelector('.lv-c-name')?.textContent)).toEqual(['Gammel', 'Vinter 26/27']);
    const vinter = rows()[1];
    expect(vinter.textContent).toContain('01.12.2026 – 31.01.2027');
    expect(vinter.textContent).toContain('62');
    expect(vinter.querySelector('.lv-c-used')?.textContent).toBe('1 linje · 1 tabellsett');
    expect(rows()[0].querySelector('.lv-c-status')?.textContent).toContain('Utløpt');
    expect(rows()[0].classList.contains('lv-expired')).toBe(true);
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
    click('#cl-new');
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
    click('#cl-new');
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

  it('switches between calendars in the navigator on the right, and goes back to the list', () => {
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

describe('Kalendere list, unified with Linjer', () => {
  const two = () => { app.calendars = [{ id: 'c1', name: 'Vinter', ranges: [['20261201', '20270131']] }, { id: 'c2', name: 'Sommer', ranges: [['20270601', '20270815']] }]; };
  const names = () => rows().map((r) => r.querySelector('.lv-c-name')?.textContent);

  it('selects with a click and opens with a double-click; every row has a validity bar', () => {
    two();
    setPage('calendars');
    rows()[0].click();
    expect(app.calendarSelected).toBeNull();
    expect(rows()[0].classList.contains('selected')).toBe(true);
    expect(rows().every((r) => r.querySelector('.vb'))).toBe(true);
  });

  it('searches, and sorts by a header, remembering the sort', () => {
    two();
    setPage('calendars');
    const search = /** @type {HTMLInputElement} */ (q('#cl-search'));
    search.value = 'som';
    search.dispatchEvent(new Event('input'));
    expect(names()).toEqual(['Sommer']);
    search.value = '';
    search.dispatchEvent(new Event('input'));
    q('.lv-head [data-col="name"]').click();        // already by name: now descending
    expect(names()).toEqual(['Vinter', 'Sommer']);
  });

  it('filters on status: only the unsaved ones', () => {
    two();
    app.calendarDrafts.set('c2', { id: 'c2', name: 'Sommer', ranges: [] });
    setPage('calendars');
    const status = /** @type {HTMLSelectElement} */ (q('#cl-f-status'));
    status.value = 'unsaved';
    status.dispatchEvent(new Event('change'));
    expect(names()).toEqual(['Sommer']);
    expect(rows()[0].textContent).toContain('●');
  });

  it('deletes several at once after asking once; there is no Lagre on the list (saving is in the editor)', async () => {
    two();
    await writeCalendars(fs, app.calendars);
    setPage('calendars');
    expect(page().querySelector('#cl-save')).toBeNull();
    rows()[0].click();
    rows()[1].dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
    click('#cl-del');
    await flush(); await flush();
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(await saved()).toEqual([]);
  });

  it('"Brukes av" goes to Linjer, filtered to the lines that use the calendar', () => {
    two();
    app.routes = [{ code: 'r', text: ROUTE.replace('#KAL;c1', '#KAL;c1'), status: 'ok', issues: [] }];
    setPage('calendars');
    /** @type {HTMLElement} */ (rows().find((r) => r.textContent?.includes('Vinter'))?.querySelector('.cl-used-link')).click();
    expect(currentPage()).toBe('lines');
    expect(app.linesFilterCal).toBe('c1');
  });

  it('with no calendars: a hint and "+ Ny kalender"', () => {
    setPage('calendars');
    expect(page().textContent).toContain('Ingen kalendere ennå');
    expect(q('#cl-new')).not.toBeNull();
  });
});

describe('the editor\'s navigator follows the list', () => {
  it('lists the calendars the list shows, in its order, on the right', () => {
    app.calendars = [{ id: 'c1', name: 'Vinter', ranges: [] }, { id: 'c2', name: 'Sommer', ranges: [] }, { id: 'c3', name: 'Høst', ranges: [] }];
    setPage('calendars');
    const search = /** @type {HTMLInputElement} */ (q('#cl-search'));
    search.value = 'er';
    search.dispatchEvent(new Event('input'));
    rows()[0].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    const nav = [...page().querySelectorAll('.ce-switch [data-cal]')].map((e) => e.textContent);
    expect(nav).toEqual(['Sommer', 'Vinter']);
    const wrap = /** @type {HTMLElement} */ (q('.cl-editor'));
    expect(wrap.lastElementChild?.classList.contains('ce-switch')).toBe(true);
  });
});
