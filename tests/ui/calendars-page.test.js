// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadAppMarkup, flush } from './dom-setup.js';
import { app } from '../../src/ui/state.js';
import { initShell, setPage } from '../../src/ui/shell.js';
import { initAssetsNav } from '../../src/ui/assets-nav.js';
import { initOrgsPage } from '../../src/ui/orgs-page.js';
import { initCalendarsPage } from '../../src/ui/calendars-page.js';
import { createMemoryFs, readText } from '../../src/project/fs.js';
import { writeCalendars } from '../../src/project/calendars-store.js';

/** @type {any} */ let fs;
const body = () => /** @type {HTMLElement} */ (document.getElementById('assets-body'));
const openSection = () => /** @type {HTMLElement} */ (document.querySelector('.assets-nav-item[data-sec="calendars"]')).click();
/** @param {Element | null} el @param {string} v */
const change = (el, v) => { const i = /** @type {HTMLInputElement} */ (el); i.value = v; i.dispatchEvent(new Event('change')); };

beforeEach(() => {
  loadAppMarkup();
  initShell(); initAssetsNav(); initOrgsPage(); initCalendarsPage();
  fs = createMemoryFs();
  Object.assign(app, { fs, meta: { formatVersion: 1, name: 'X', codespace: 'TST' }, calendars: [], calendarsError: null, assetsSection: 'orgs', calendarSelected: null, calendarYear: 0,
    routes: [], orgs: [], orgsError: null });
  window.confirm = vi.fn(() => true);
  setPage('assets');
});

describe('calendars page', () => {
  it('adds a calendar, names it and switches days on in the year view', async () => {
    openSection();
    /** @type {HTMLElement} */ (body().querySelector('.cal-add')).click();
    change(body().querySelector('.cal-name'), 'Vinter 26/27');
    const y = Number(body().querySelector('.cal-year')?.textContent);
    const d1 = `${y}0817`, d2 = `${y}0818`;
    const cell = (/** @type {string} */ d) => /** @type {HTMLElement} */ (body().querySelector(`.yv-day[data-date="${d}"]`));
    cell(d1).dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    cell(d2).dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    document.body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await flush();
    const saved = JSON.parse(await readText(fs, 'data/calendars.json'));
    expect(saved[0]).toMatchObject({ name: 'Vinter 26/27', ranges: [[d1, d2]] });
    expect(body().querySelector('.cal-days')?.textContent).toContain('2 dager');
  });

  it('pages between years, starting at the calendar\'s first day', () => {
    app.calendars = [{ id: 'c1', name: 'V', ranges: [['20270104', '20270619']] }];
    app.calendarSelected = 'c1';
    openSection();
    expect(body().querySelector('.cal-year')?.textContent).toBe('2027');
    /** @type {HTMLElement} */ (body().querySelector('.cal-year-next')).click();
    expect(body().querySelector('.cal-year')?.textContent).toBe('2028');
  });

  it('duplicates a calendar as next season, 52 weeks later', async () => {
    app.calendars = [{ id: 'c1', name: 'Vinter 26/27', ranges: [['20260817', '20261220']] }];
    app.calendarSelected = 'c1';
    openSection();
    /** @type {HTMLElement} */ (body().querySelector('.cal-dup')).click();
    await flush();
    const saved = JSON.parse(await readText(fs, 'data/calendars.json'));
    expect(saved[1]).toMatchObject({ name: 'Vinter 26/27 (kopi)', ranges: [['20270816', '20271219']] });
    expect(app.calendarSelected).toBe(saved[1].id);
  });

  it('keeps the old name when the name is blanked', async () => {
    app.calendars = [{ id: 'c1', name: 'Vinter', ranges: [['20260101', '20260131']] }];
    app.calendarSelected = 'c1';
    await writeCalendars(fs, app.calendars);
    openSection();
    change(body().querySelector('.cal-name'), '');
    await flush();
    expect(JSON.parse(await readText(fs, 'data/calendars.json'))[0].name).toBe('Vinter');
  });

  it('asks before deleting a calendar periods use', async () => {
    app.calendars = [{ id: 'c1', name: 'Vinter', ranges: [] }];
    app.calendarSelected = 'c1';
    app.routes = [{ code: 'r', text: '#TRA;A\r\n#PER;;;;;;\r\n#KAL;c1\r\n', status: 'ok', issues: [] }];
    openSection();
    /** @type {HTMLElement} */ (body().querySelector('.cal-del')).click();
    await flush();
    expect(/** @type {any} */ (window.confirm).mock.calls[0][0]).toContain('1 perioder');
    expect(JSON.parse(await readText(fs, 'data/calendars.json'))).toEqual([]);
  });
});
