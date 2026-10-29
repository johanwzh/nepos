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

describe('Ressurser: labels, review fixes', () => {
  it('does not save two new labels with the same name', async () => {
    app.labels = [];
    setPage('edit'); setPage('assets');
    for (let i = 0; i < 2; i++) {
      app.resourceSelected = null; setPage('edit'); setPage('assets'); // back to the list
      click(/** @type {HTMLElement} */ (document.getElementById('rs-new-label')));
      const name = /** @type {HTMLInputElement} */ (q('#re-name'));
      name.value = 'Rush';
      name.dispatchEvent(new Event('input'));
    }
    const { saveAllResources } = await import('../../src/ui/resources-page.js');
    await saveAllResources();
    expect(app.labels.filter((l) => l.name === 'Rush')).toHaveLength(1);
  });

  it('refuses ; in a label name (ERN fields are separated by ;)', () => {
    app.labels = [];
    setPage('edit'); setPage('assets');
    click(/** @type {HTMLElement} */ (document.getElementById('rs-new-label')));
    const name = /** @type {HTMLInputElement} */ (q('#re-name'));
    name.value = 'A;B';
    name.dispatchEvent(new Event('input'));
    expect(name.classList.contains('invalid')).toBe(true);
  });
});

describe('Ressurser: vehicles (user 2026-10-20)', () => {
  it('makes a vehicle with a name and a colour, and saves it to data/vehicles.json', async () => {
    app.vehicles = [];
    setPage('edit'); setPage('assets');
    click(/** @type {HTMLElement} */ (document.getElementById('rs-new-vehicle')));
    expect(q('.re-title').textContent).toMatch(/^Kjøretøy/);
    const name = /** @type {HTMLInputElement} */ (q('#re-name'));
    name.value = 'Buss 7';
    name.dispatchEvent(new Event('input'));
    click(q('.re-save'));
    await flush(); await flush();
    expect(app.vehicles).toEqual([expect.objectContaining({ name: 'Buss 7', colour: expect.stringMatching(/^#[0-9a-f]{6}$/) })]);
    expect(JSON.parse(/** @type {string} */ (await readText(fs, 'data/vehicles.json')))[0].name).toBe('Buss 7');
    expect(await readText(fs, 'data/labels.json')).toBeNull(); // not mixed up with the labels
  });

  it('lists vehicles with their type and how many lines use them (not counting labels of the same name)', () => {
    app.labels = [{ id: 'l1', name: 'Buss 7', colour: '#2e8b57' }];
    app.vehicles = [{ id: 'v1', name: 'Buss 7', colour: '#2f6fb5' }];
    app.routes = [{ code: '1', text: '#TTL;-1;0;;10;Kjøretøy;2\r\n#TTC;0;;10;Buss 7;512\r\n', status: 'ok', issues: [] }];
    setPage('edit'); setPage('assets');
    const typed = (/** @type {string} */ type) => rows().find((r) => r.querySelector('.lv-c-name')?.textContent === 'Buss 7' && r.querySelector('.lv-c-type')?.textContent === type);
    expect(typed('Kjøretøy')?.querySelector('.lv-c-used')?.textContent).toContain('1');
    expect(typed('Etikett')?.querySelector('.lv-c-used')?.textContent).toContain('0');
  });

  it('a vehicle may share a label\'s name, but not another vehicle\'s', () => {
    app.labels = [{ id: 'l1', name: 'Buss 7', colour: '#2e8b57' }];
    app.vehicles = [{ id: 'v1', name: 'Buss 12', colour: '#2f6fb5' }];
    setPage('edit'); setPage('assets');
    click(/** @type {HTMLElement} */ (document.getElementById('rs-new-vehicle')));
    const name = /** @type {HTMLInputElement} */ (q('#re-name'));
    name.value = 'Buss 7';
    name.dispatchEvent(new Event('input'));
    expect(name.classList.contains('invalid')).toBe(false);
    name.value = 'buss 12';
    name.dispatchEvent(new Event('input'));
    expect(name.classList.contains('invalid')).toBe(true);
  });

  it('deletes a vehicle; labels and vehicles are deleted separately', async () => {
    app.labels = [{ id: 'l1', name: 'Normal', colour: '#2e8b57' }];
    app.vehicles = [{ id: 'v1', name: 'Buss 7', colour: '#2f6fb5' }];
    setPage('edit'); setPage('assets');
    const row = /** @type {HTMLElement} */ (rows().find((r) => r.querySelector('.lv-c-name')?.textContent === 'Buss 7'));
    dbl(row);
    click(q('.re-del'));
    await flush(); await flush();
    expect(app.vehicles).toEqual([]);
    expect(app.labels).toHaveLength(1);
  });
});

describe('Ressurser: a vehicle\'s own data (user 2026-10-20)', () => {
  const field = (/** @type {string} */ id) => /** @type {HTMLInputElement} */ (q(`#${id}`));
  const type = (/** @type {string} */ id, /** @type {string} */ v) => { const f = field(id); f.value = v; f.dispatchEvent(new Event('input')); f.dispatchEvent(new Event('change')); };

  it('saves short code, mode, fuel, low floor, seats, size and the VehicleTypeRef after its fixed prefix', async () => {
    app.vehicles = [];
    setPage('edit'); setPage('assets');
    click(/** @type {HTMLElement} */ (document.getElementById('rs-new-vehicle')));
    type('re-name', 'Buss 7');
    type('re-shortCode', 'B7');
    type('re-transportMode', 'bus');
    type('re-fuelType', 'electricity');
    field('re-lowFloor').checked = true; field('re-lowFloor').dispatchEvent(new Event('change'));
    type('re-seats', '45');
    type('re-length', '12,2');
    type('re-width', '2.55');
    type('re-height', '3.3');
    type('re-vehicleTypeRef', 'ABC-12');
    expect(page().textContent).toContain('NMR:VehicleType:');
    click(q('.re-save'));
    await flush(); await flush();
    expect(app.vehicles[0]).toMatchObject({ name: 'Buss 7', shortCode: 'B7', transportMode: 'bus', fuelType: 'electricity', lowFloor: true, seats: 45,
      length: 12.2, width: 2.55, height: 3.3, vehicleTypeRef: 'NMR:VehicleType:ABC-12', vehicleTypeId: expect.stringMatching(/^TST:VehicleType:/) });
  });

  it('says the colour is the timetable label\'s, not the vehicle\'s', () => {
    app.vehicles = [];
    setPage('edit'); setPage('assets');
    click(/** @type {HTMLElement} */ (document.getElementById('rs-new-vehicle')));
    expect(page().textContent).toMatch(/ikke kjøretøyets farge/);
  });

  it('will not save a wrong number', () => {
    app.vehicles = [];
    setPage('edit'); setPage('assets');
    click(/** @type {HTMLElement} */ (document.getElementById('rs-new-vehicle')));
    type('re-name', 'Buss 7');
    type('re-seats', '4.5');
    expect(field('re-seats').classList.contains('invalid')).toBe(true);
    expect(/** @type {HTMLButtonElement} */ (q('.re-save')).disabled).toBe(true);
  });

  it('lists a vehicle with its short code, mode and fuel', () => {
    app.vehicles = [{ id: 'v1', name: 'Buss 7', colour: '#2f6fb5', shortCode: 'B7', transportMode: 'bus', fuelType: 'electricity' }];
    setPage('edit'); setPage('assets');
    const row = rows().find((r) => r.querySelector('.lv-c-name')?.textContent === 'Buss 7');
    expect(row?.querySelector('.lv-c-detail')?.textContent).toBe('B7 · Buss · Elektrisitet');
  });
});

describe('Ressurser: Ctrl+S (user 2026-10-21)', () => {
  const ctrlS = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }));

  it('saves the open vehicle', async () => {
    app.vehicles = [];
    setPage('edit'); setPage('assets');
    click(/** @type {HTMLElement} */ (document.getElementById('rs-new-vehicle')));
    const name = /** @type {HTMLInputElement} */ (q('#re-name'));
    name.value = 'Buss 7';
    name.dispatchEvent(new Event('input'));
    ctrlS();
    await flush(); await flush();
    expect(app.vehicles.map((v) => v.name)).toEqual(['Buss 7']);
  });

  it('saves an organisation\'s alias typed in the field', async () => {
    setPage('edit'); setPage('assets');
    const row = /** @type {HTMLElement} */ (rows().find((r) => r.querySelector('.lv-c-type')?.textContent === 'Operatør'));
    dbl(row);
    const alias = /** @type {HTMLInputElement} */ (q('.re-alias'));
    alias.value = 'Buss1';
    alias.dispatchEvent(new Event('input'));
    ctrlS();
    await flush(); await flush();
    expect(JSON.stringify(app.orgs)).toContain('TST:Operator:Buss1');
    expect(app.resourceDrafts.size).toBe(0);
  });
});

describe('the save / discard bar on Ressurser (2.5)', () => {
  it('is enabled with a draft, and Save empties the drafts', async () => {
    app.resourceDrafts.set('b:TST:Branding:x', { ...BRANDING, name: 'Ekspressen 2' });
    setPage('edit');
    setPage('assets');
    const save = /** @type {HTMLButtonElement} */ (q('.lv-foot-save'));
    expect(save.disabled).toBe(false);
    save.click();
    await vi.waitFor(() => expect(app.resourceDrafts.size).toBe(0));
    expect(app.brandings[0].name).toBe('Ekspressen 2');
  });

  it('Discard changes in list throws the resource drafts away', () => {
    app.resourceDrafts.set('b:TST:Branding:x', { ...BRANDING, name: 'Ekspressen 2' });
    setPage('edit');
    setPage('assets');
    q('.lv-foot-discard').click();
    expect(app.resourceDrafts.size).toBe(0);
    expect(app.brandings[0].name).toBe('Ekspressen');
  });
});
