// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadAppMarkup, flush } from './dom-setup.js';
import { app } from '../../src/ui/state.js';
import { initShell, setPage } from '../../src/ui/shell.js';
import { initAssetsNav } from '../../src/ui/assets-nav.js';
import { initOrgsPage } from '../../src/ui/orgs-page.js';
import { initCalendarsPage } from '../../src/ui/calendars-page.js';
import { createMemoryFs, readText } from '../../src/project/fs.js';

/** @type {any} */ let fs;
const body = () => /** @type {HTMLElement} */ (document.getElementById('assets-body'));
const openSection = () => /** @type {HTMLElement} */ (document.querySelector('.assets-nav-item[data-sec="calendars"]')).click();
/** @param {Element | null} el @param {string} v */
const change = (el, v) => { const i = /** @type {HTMLInputElement} */ (el); i.value = v; i.dispatchEvent(new Event('change')); };

beforeEach(() => {
  loadAppMarkup();
  initShell(); initAssetsNav(); initOrgsPage(); initCalendarsPage();
  fs = createMemoryFs();
  Object.assign(app, { fs, meta: { formatVersion: 1, name: 'X', codespace: 'TST' }, calendars: [], calendarsError: null, assetsSection: 'orgs',
    routes: [], orgs: [], orgsError: null });
  window.confirm = vi.fn(() => true);
  setPage('assets');
});

describe('calendars page', () => {
  it('adds a calendar with a date range and saves it once it has a name', async () => {
    openSection();
    expect(body().textContent).toContain('Ingen kalendere ennå');
    /** @type {HTMLElement} */ (body().querySelector('.cal-add')).click();
    change(body().querySelector('.cal-name'), 'Vinter 26/27');
    /** @type {HTMLElement} */ (body().querySelector('.cal-range-add')).click();
    change(body().querySelector('.cal-from'), '2026-08-17');
    change(body().querySelector('.cal-to'), '2026-08-18');
    await flush();
    const saved = JSON.parse(await readText(fs, 'data/calendars.json'));
    expect(saved[0]).toMatchObject({ name: 'Vinter 26/27', ranges: [['20260817', '20260818']] });
    expect(body().textContent).toContain('2 dager');
  });

  it('does not save a calendar without a name', async () => {
    openSection();
    /** @type {HTMLElement} */ (body().querySelector('.cal-add')).click();
    /** @type {HTMLElement} */ (body().querySelector('.cal-range-add')).click();
    change(body().querySelector('.cal-from'), '2026-08-17');
    await flush();
    expect(JSON.parse((await readText(fs, 'data/calendars.json')) ?? '[]')).toEqual([]);
  });

  it('asks before deleting a calendar periods use', async () => {
    app.calendars = [{ id: 'c1', name: 'Vinter', ranges: [] }];
    app.routes = [{ code: 'r', text: '#TRA;A\r\n#PER;;;;;;\r\n#KAL;c1\r\n', status: 'ok', issues: [] }];
    openSection();
    /** @type {HTMLElement} */ (body().querySelector('.cal-del')).click();
    await flush();
    expect(/** @type {any} */ (window.confirm).mock.calls[0][0]).toContain('1 perioder');
    expect(JSON.parse(await readText(fs, 'data/calendars.json'))).toEqual([]);
  });
});
