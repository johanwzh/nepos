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
    expect(rows()[0].querySelector('.lv-c-type')?.textContent).toBe('Organisasjon');
    expect(rows()[0].querySelector('.lv-band')).toBeNull(); // no calendar, no timeline
    expect(rows()[2].querySelector('.lv-c-used')?.textContent).toContain('1');
  });

  it('filters on type and searches', () => {
    const type = /** @type {HTMLSelectElement} */ (q('#rs-f-type'));
    type.value = 'branding';
    type.dispatchEvent(new Event('change'));
    expect(names()).toEqual(['Ekspressen']);
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

describe('the organisation editor', () => {
  const openBus = () => dbl(/** @type {HTMLElement} */ (rows().find((r) => r.textContent?.includes('Eksempel Buss AS'))));

  it('shows the register details read-only and the generated alias as placeholder', () => {
    openBus();
    const alias = /** @type {HTMLInputElement} */ (q('.re-alias[data-nog="NOG:Operator:bbbbbbbbbb2"]'));
    expect(alias.placeholder).toMatch(/^TST:Operator:/);
    expect(page().textContent).toContain('NOG:Operator:bbbbbbbbbb2');
    expect(q('#re-name')).toBeNull(); // nothing but the alias can be edited
  });

  it('marks an alias with the wrong role and will not save it; saves a valid one on Lagre', async () => {
    openBus();
    const alias = /** @type {HTMLInputElement} */ (q('.re-alias[data-nog="NOG:Operator:bbbbbbbbbb2"]'));
    alias.value = 'TST:Authority:feil';
    alias.dispatchEvent(new Event('input'));
    expect(alias.classList.contains('invalid')).toBe(true);
    expect(/** @type {HTMLButtonElement} */ (q('.re-save')).disabled).toBe(true);
    alias.value = 'TST:Operator:buss';
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
