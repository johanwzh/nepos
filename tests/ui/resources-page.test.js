// @vitest-environment jsdom
// Ressurser (list pages, 2026-10-16): merkevarer and organisations in one list on the shared frame;
// each opens its own editor (merkevare: every field; organisation: only the export alias), with the
// navigator on the right. The organisation register's status lives in Prosjektinnstillinger.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadAppMarkup, flush } from './dom-setup.js';
import { app } from '../../src/ui/state.js';
import { initShell, setPage, openProjectSettings, refreshAll } from '../../src/ui/shell.js';
import { initResourcesPage } from '../../src/ui/resources-page.js';
import { resetListStates } from '../../src/ui/list-view.js';
import { initEnturSettings } from '../../src/ui/entur-settings.js';
import { initMenus } from '../../src/ui/menus.js';
import { createMemoryFs, readText } from '../../src/project/fs.js';
import { writeOrgs } from '../../src/project/orgs-store.js';
import { writeBrandings } from '../../src/project/brandings-store.js';
import { registerCompanies, projectCopy } from '../fixtures/orgs.js';

/** @type {any} */ let fs;
const page = () => /** @type {HTMLElement} */ (document.getElementById('resources-body'));
const q = (/** @type {string} */ sel) => /** @type {HTMLElement} */ (page().querySelector(sel));
const rows = () => /** @type {HTMLElement[]} */ ([...page().querySelectorAll('.lv-row')]);
const names = () => rows().map((r) => r.querySelector('.lv-c-name')?.textContent);
const click = (/** @type {HTMLElement} */ el, opts = {}) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, ...opts }));
const dbl = (/** @type {HTMLElement} */ el) => el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
const BRANDING = { id: 'TST:Branding:x', name: 'Ekspressen', shortName: '', description: '', url: 'https://ex.no', imageUrl: '' };

beforeEach(async () => {
  resetListStates();
  loadAppMarkup();
  initShell();
  initResourcesPage();
  initEnturSettings();
  fs = createMemoryFs();
  await writeOrgs(fs, projectCopy());
  await writeBrandings(fs, [BRANDING]);
  Object.assign(app, { fs, meta: { formatVersion: 1, name: 'X', codespace: 'TST' }, orgs: projectCopy(), orgsError: null,
    brandings: [{ ...BRANDING }], brandingsError: null, resourceSelected: null, resourceDrafts: new Map(),
    orgRegister: { companies: registerCompanies(), fetchedAt: '2026-10-14T12:40:00Z' }, orgRegisterStatus: 'ok',
    orgChanges: { changed: [], missing: [] },
    routes: [{ code: '1', text: '#SEK;NOG:Operator:bbbbbbbbbb2;Eksempel Buss AS;0;1;0;0\r\n#BRA;TST:Branding:x\r\n', status: 'ok', issues: [] }] });
  window.confirm = vi.fn(() => true);
  setPage('assets');
});

describe('Ressurser: merkevarer and organisations in one list', () => {
  it('lists both by name on the shared frame, with a type, and no submenu', () => {
    expect(document.querySelector('.assets-nav')).toBeNull();
    expect(names()).toEqual(['Eksempel Buss AS', 'Eksempel fylkeskommune', 'Ekspressen']);
    expect(rows()[2].querySelector('.lv-c-type')?.textContent).toBe('Merkevare');
    // an organisation is listed by its role, as in NeTEx
    expect(rows()[0].querySelector('.lv-c-type')?.textContent).toBe('Operatør');
    expect(rows()[1].querySelector('.lv-c-type')?.textContent).toBe('Autoritet');
    expect(rows()[0].querySelector('.lv-band')).toBeNull(); // no calendar, no timeline
    expect(rows()[2].querySelector('.lv-c-used')?.textContent).toContain('1');
  });

  it('lists a company with both roles twice, one row per role and export ID', () => {
    app.orgs = [...projectCopy(), ...registerCompanies().slice(2).map((c) => ({ ...c, authority: c.authority && { ...c.authority, alias: '' }, operator: c.operator && { ...c.operator, alias: '' } }))];
    setPage('edit');
    setPage('assets');
    const fjord = rows().filter((r) => r.querySelector('.lv-c-name')?.textContent === 'Fjord AS');
    expect(fjord.map((r) => r.querySelector('.lv-c-type')?.textContent)).toEqual(['Autoritet', 'Operatør']);
    expect(fjord.map((r) => r.querySelector('.lv-c-export')?.textContent)).toEqual(['TST:Authority:ccccccccc3', 'TST:Operator:ddddddddd4']);
  });

  it('filters on type and searches', () => {
    const type = /** @type {HTMLSelectElement} */ (q('#rs-f-type'));
    type.value = 'branding';
    type.dispatchEvent(new Event('change'));
    expect(names()).toEqual(['Ekspressen']);
    type.value = 'authority';
    type.dispatchEvent(new Event('change'));
    expect(names()).toEqual(['Eksempel fylkeskommune']);
    type.value = '';
    type.dispatchEvent(new Event('change'));
    const search = /** @type {HTMLInputElement} */ (q('#rs-search'));
    search.value = 'fylke';
    search.dispatchEvent(new Event('input'));
    expect(names()).toEqual(['Eksempel fylkeskommune']);
  });

  it('deletes only merkevarer, after asking how many lines use them', async () => {
    click(rows()[0]); // an organisation
    expect(/** @type {HTMLButtonElement} */ (q('#rs-del')).disabled).toBe(true);
    click(rows()[2]); // the merkevare
    expect(/** @type {HTMLButtonElement} */ (q('#rs-del')).disabled).toBe(false);
    q('#rs-del').click();
    await flush(); await flush();
    expect(/** @type {any} */ (window.confirm).mock.calls[0][0]).toContain('1');
    expect(JSON.parse(/** @type {string} */ (await readText(fs, 'data/brandings.json')))).toEqual([]);
  });
});

describe('the merkevare editor', () => {
  it('"+ Ny merkevare" opens an unsaved one; Lagre writes it once it has a name', async () => {
    q('#rs-new').click();
    expect(q('.re-editor')).not.toBeNull();
    const name = /** @type {HTMLInputElement} */ (q('#re-name'));
    expect(/** @type {HTMLButtonElement} */ (q('.re-save')).disabled).toBe(true);
    name.value = 'Fjordekspressen';
    name.dispatchEvent(new Event('input'));
    q('.re-save').click();
    await flush(); await flush();
    const saved = JSON.parse(/** @type {string} */ (await readText(fs, 'data/brandings.json')));
    expect(saved.map((/** @type {any} */ b) => b.name)).toEqual(['Ekspressen', 'Fjordekspressen']);
  });

  it('edits name and website; Forkast throws the change away; the navigator is on the right', () => {
    dbl(rows()[2]);
    const url = /** @type {HTMLInputElement} */ (q('#re-url'));
    expect(url.value).toBe('https://ex.no');
    url.value = 'https://ny.no';
    url.dispatchEvent(new Event('input'));
    expect(q('.re-state').textContent).toContain('●');
    q('.re-discard').click();
    expect(/** @type {HTMLInputElement} */ (q('#re-url')).value).toBe('https://ex.no');
    const wrap = q('.re-editor');
    expect(wrap.lastElementChild?.classList.contains('re-nav')).toBe(true);
    expect([...page().querySelectorAll('.re-nav [data-id]')].map((e) => e.textContent)).toEqual(['Eksempel Buss AS', 'Eksempel fylkeskommune', 'Ekspressen']);
  });
});

describe('saving everything', () => {
  it('Ctrl+Shift+S saves the unsaved resources too', async () => {
    initMenus();
    q('#rs-new').click();
    const name = /** @type {HTMLInputElement} */ (q('#re-name'));
    name.value = 'Kystbussen';
    name.dispatchEvent(new Event('input'));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'S', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }));
    for (let i = 0; i < 8; i++) await flush();
    const saved = JSON.parse(/** @type {string} */ (await readText(fs, 'data/brandings.json')));
    expect(saved.map((/** @type {any} */ b) => b.name)).toContain('Kystbussen');
    expect(app.resourceDrafts.size).toBe(0);
  });
});

describe('the organisation editor', () => {
  const openBus = () => dbl(/** @type {HTMLElement} */ (rows().find((r) => r.textContent?.includes('Eksempel Buss AS'))));

  it('shows the register details read-only at the top, contact included; the alias has a fixed prefix', () => {
    openBus();
    const facts = q('.re-facts').textContent;
    expect(facts).toContain('NOG:Operator:bbbbbbbbbb2');
    expect(facts).toContain('61245400');
    expect(q('.re-alias-prefix').textContent).toBe('TST:Operator:');
    const alias = /** @type {HTMLInputElement} */ (q('.re-alias[data-nog="NOG:Operator:bbbbbbbbbb2"]'));
    expect(alias.placeholder).toBe('bbbbbbbbbb2');
    expect(q('#re-name')).toBeNull(); // nothing but the alias can be edited
  });

  it('marks an alias with characters an ID cannot have and will not save it; saves a valid one with the prefix', async () => {
    openBus();
    const alias = /** @type {HTMLInputElement} */ (q('.re-alias[data-nog="NOG:Operator:bbbbbbbbbb2"]'));
    alias.value = 'feil:x';
    alias.dispatchEvent(new Event('input'));
    expect(alias.classList.contains('invalid')).toBe(true);
    expect(/** @type {HTMLButtonElement} */ (q('.re-save')).disabled).toBe(true);
    alias.value = 'buss';
    alias.dispatchEvent(new Event('input'));
    q('.re-save').click();
    await flush(); await flush();
    const saved = JSON.parse(/** @type {string} */ (await readText(fs, 'data/orgs.json')));
    expect(saved.companies.find((/** @type {any} */ c) => c.operator?.id === 'NOG:Operator:bbbbbbbbbb2').operator.alias).toBe('TST:Operator:buss');
  });
});

describe('the organisation register in Prosjektinnstillinger', () => {
  it('shows the register status, a refresh button and the contact note', () => {
    openProjectSettings();
    const dlg = /** @type {HTMLElement} */ (document.getElementById('settings-dlg'));
    expect(dlg.textContent).toContain('3 selskaper');
    expect(dlg.querySelector('#org-refresh')).not.toBeNull();
    expect(dlg.querySelector('a[href="mailto:kollektivdata@entur.org"]')).not.toBeNull();
  });

  it('follows the register while the dialog is open', () => {
    openProjectSettings();
    app.orgRegisterStatus = 'loading';
    refreshAll();
    const btn = /** @type {HTMLButtonElement} */ (document.querySelector('#settings-dlg #org-refresh'));
    expect(btn.disabled).toBe(true);
  });

  it('says so in Ressurser when the organisation file cannot be read', () => {
    app.orgsError = 'unreadable';
    setPage('edit');
    setPage('assets');
    expect(page().textContent).toContain('kan ikke leses');
  });
});

describe('Ressurser: labels (62)', () => {
  it('makes a label with a name and a colour, and saves it to data/labels.json', async () => {
    app.labels = [];
    setPage('edit'); setPage('assets');
    click(/** @type {HTMLElement} */ (document.getElementById('rs-new-label')));
    const name = /** @type {HTMLInputElement} */ (q('#re-name'));
    name.value = 'Rush';
    name.dispatchEvent(new Event('input'));
    const colour = /** @type {HTMLInputElement} */ (q('#re-colour'));
    colour.value = '#123456';
    colour.dispatchEvent(new Event('input'));
    click(q('.re-save'));
    await flush(); await flush();
    expect(app.labels).toEqual([expect.objectContaining({ name: 'Rush', colour: '#123456' })]);
    expect(JSON.parse(/** @type {string} */ (await readText(fs, 'data/labels.json')))[0].name).toBe('Rush');
  });

  it('lists labels with their type, colour and how many lines use them', () => {
    app.labels = [{ id: 'l1', name: 'Normal', colour: '#2e8b57' }];
    app.routes = [{ code: '1', text: '#TTL;-1;0;;10;Etikett;1\r\n#TTC;0;;10;Normal;256\r\n', status: 'ok', issues: [] }];
    setPage('edit'); setPage('assets');
    const row = rows().find((r) => r.querySelector('.lv-c-name')?.textContent === 'Normal');
    expect(row?.querySelector('.lv-c-type')?.textContent).toBe('Etikett');
    expect(row?.querySelector('.lv-c-detail')?.textContent).toBe('#2e8b57');
    expect(row?.querySelector('.lv-c-used')?.textContent).toContain('1');
  });

  it('refuses a second label with the same name', () => {
    app.labels = [{ id: 'l1', name: 'Normal', colour: '#2e8b57' }];
    setPage('edit'); setPage('assets');
    click(/** @type {HTMLElement} */ (document.getElementById('rs-new-label')));
    const name = /** @type {HTMLInputElement} */ (q('#re-name'));
    name.value = 'Normal';
    name.dispatchEvent(new Event('input'));
    expect(name.classList.contains('invalid')).toBe(true);
    expect(/** @type {HTMLButtonElement} */ (q('.re-save')).disabled).toBe(true);
  });

  it('deletes a label', async () => {
    app.labels = [{ id: 'l1', name: 'Normal', colour: '#2e8b57' }];
    setPage('edit'); setPage('assets');
    const row = /** @type {HTMLElement} */ (rows().find((r) => r.querySelector('.lv-c-name')?.textContent === 'Normal'));
    dbl(row);
    click(q('.re-del'));
    await flush(); await flush();
    expect(app.labels).toEqual([]);
  });
});
