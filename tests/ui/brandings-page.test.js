// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadAppMarkup, flush } from './dom-setup.js';
import { app } from '../../src/ui/state.js';
import { initShell, setPage } from '../../src/ui/shell.js';
import { initAssetsNav } from '../../src/ui/assets-nav.js';
import { initOrgsPage } from '../../src/ui/orgs-page.js';
import { initBrandingsPage } from '../../src/ui/brandings-page.js';
import { createMemoryFs, readText } from '../../src/project/fs.js';

/** @type {any} */ let fs;
const body = () => /** @type {HTMLElement} */ (document.getElementById('assets-body'));
const openSection = () => /** @type {HTMLElement} */ (document.querySelector('.assets-nav-item[data-sec="brandings"]')).click();

beforeEach(() => {
  loadAppMarkup();
  initShell(); initAssetsNav(); initOrgsPage(); initBrandingsPage();
  fs = createMemoryFs();
  Object.assign(app, { fs, meta: { formatVersion: 1, name: 'X', codespace: 'TST' }, brandings: [], brandingsError: null, assetsSection: 'orgs',
    routes: [{ code: 'r1', text: '#RUT;-1;1;A;;1;\r\n#BRA;TST:Branding:x\r\n', status: 'ok', issues: [] }], orgs: [], orgsError: null });
  window.confirm = vi.fn(() => true);
  app.assetsSection = 'brandings'; // the default
  setPage('assets');
});

describe('brandings page', () => {
  it('lists brandings and organisations (calendars have their own tab), opening on brandings', () => {
    expect([...document.querySelectorAll('.assets-nav-item')].map((e) => /** @type {HTMLElement} */ (e).dataset.sec)).toEqual(['brandings', 'orgs']);
    expect(document.querySelector('.assets-nav-item.active')?.getAttribute('data-sec')).toBe('brandings');
  });

  it('switches section from calendars to brandings', () => {
    openSection();
    expect(body().textContent).toContain('Ingen merkevarer ennå');
  });

  it('adds a branding, saves it once it has a name, and keeps the field in place', async () => {
    openSection();
    /** @type {HTMLElement} */ (body().querySelector('.brand-add')).click();
    const name = /** @type {HTMLInputElement} */ (body().querySelector('.brand-in[data-field="name"]'));
    await flush();
    expect(await readText(fs, 'data/brandings.json')).toBe(null);
    name.value = 'Sørlandsekspressen';
    name.dispatchEvent(new Event('change'));
    await flush();
    expect(body().querySelector('.brand-in[data-field="name"]')).toBe(name);
    const saved = JSON.parse(await readText(fs, 'data/brandings.json'));
    expect(saved[0].name).toBe('Sørlandsekspressen');
    expect(saved[0].id).toMatch(/^TST:Branding:/);
  });

  it('asks before deleting a branding lines use, naming how many', async () => {
    app.brandings = [{ id: 'TST:Branding:x', name: 'Profil X', shortName: '', description: '', url: '', imageUrl: '' }];
    openSection();
    /** @type {HTMLElement} */ (body().querySelector('.brand-del')).click();
    await flush();
    expect(/** @type {any} */ (window.confirm).mock.calls[0][0]).toContain('1 linjer');
    expect(JSON.parse(await readText(fs, 'data/brandings.json'))).toEqual([]);
  });
});

describe('the branding list (user test 2026-10-16)', () => {
  it('shows only name and website, with headers over the columns instead of text inside the fields', () => {
    app.brandings = [{ id: 'TST:Branding:x', name: 'Ekspressen', shortName: 'EX', description: 'd', url: '', imageUrl: '' }];
    openSection();
    expect([...body().querySelectorAll('.brand-row .brand-in')].map((i) => /** @type {HTMLElement} */ (i).dataset.field)).toEqual(['name', 'url']);
    expect([...body().querySelectorAll('.brand-head .brand-h')].map((s) => s.textContent)).toEqual(['Navn', 'Nettside']);
    expect(/** @type {HTMLInputElement} */ (body().querySelector('.brand-in')).placeholder).toBe('');
  });
});
