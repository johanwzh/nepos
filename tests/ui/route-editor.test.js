// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadAppMarkup, flush } from './dom-setup.js';
import { app } from '../../src/ui/state.js';
import { initShell, refreshAll } from '../../src/ui/shell.js';
import { initRouteList } from '../../src/ui/route-list.js';
import { initProjectUi, openFs } from '../../src/ui/project-ui.js';
import { initGrid, grid } from '../../src/ui/grid.js';
import { initFootnoteEditor } from '../../src/ui/footnote-editor.js';
import { initRouteEditor, selectRoute } from '../../src/ui/route-editor.js';
import { createMemoryFs, readText } from '../../src/project/fs.js';
import { createProject } from '../../src/project/create.js';
import { writeRoute, readRoute } from '../../src/project/routes.js';
import { writeOrgs } from '../../src/project/orgs-store.js';
import { sample } from '../fixtures/sample-project.js';
import { projectCopy, registerCompanies } from '../fixtures/orgs.js';
import { parseERN } from '../../src/core/ern/parse.js';
import { serializeERN } from '../../src/core/ern/serialize.js';

const press = (key, opts = {}) => document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...opts }));
const typeKeys = (s) => [...s].forEach((k) => press(k));
const route20 = serializeERN(parseERN(sample.routes[1].text), '20', { delivery: { name: 'Test', codespace: 'TST' }, orgs: sample.orgs });
const damaged30 = route20.replace(';20;', ';30;').replace('#TRA;20\r\n', '#TRA;30\r\n#KOS;4;x;0\r\n');

/** @type {any} */
let fs;
let wired = false;

beforeEach(async () => {
  loadAppMarkup();
  initShell();
  initRouteList();
  await initProjectUi({ restoreLast: false });
  if (!wired) { initGrid(); initFootnoteEditor(); wired = true; }
  initRouteEditor();
  window.confirm = vi.fn(() => true);
  window.prompt = vi.fn(() => null);
  fs = createMemoryFs();
  await createProject(fs, { name: 'Test', codespace: 'TST' });
  await writeOrgs(fs, projectCopy());
  await writeRoute(fs, '20', route20);
  await writeRoute(fs, '30', damaged30);
  await openFs(fs);
  /** @type {any} */ (document.getElementById('check-dlg')).close();
});

describe('route editor', () => {
  it('opens a route in the grid with its header', async () => {
    await selectRoute('20');
    expect(document.getElementById('tbl').textContent).toContain('Florø skysstasjon');
    expect(document.querySelector('[data-r="0"][data-c="0"]').textContent).toBe('0700');
    expect(/** @type {HTMLInputElement} */ (document.getElementById('rh-name')).value).toBe('Florø - Eikefjord');
    expect(document.getElementById('grid-ph').style.display).toBe('none');
  });

  it('edits a time and saves it to the file', async () => {
    await selectRoute('20');
    typeKeys('0800');
    press('Enter');
    expect(app.dirty).toBe(true);
    document.getElementById('ef-save').click();
    await flush();
    expect(await readRoute(fs, '20')).toContain('#TRC;0;0800;');
    expect(app.dirty).toBe(false);
    expect(document.getElementById('sb-save').textContent).toBe('Lagret');
  });

  it('saves with Ctrl+S', async () => {
    await selectRoute('20');
    typeKeys('0805');
    press('Enter');
    press('s', { ctrlKey: true });
    await flush();
    expect(await readRoute(fs, '20')).toContain('#TRC;0;0805;');
  });

  it('opens a damaged route read-only', async () => {
    await selectRoute('30');
    typeKeys('0800');
    press('Enter');
    expect(app.dirty).toBe(false);
    expect(document.getElementById('ef-save')).toBe(null);
    expect(document.getElementById('grid-status').textContent).toContain('Skrivebeskyttet');
    expect(await readRoute(fs, '30')).toBe(damaged30);
  });

  it('asks before switching away from unsaved changes, and stays when declined', async () => {
    await selectRoute('20');
    typeKeys('0810');
    press('Enter');
    window.confirm = vi.fn(() => false);
    expect(await selectRoute('30')).toBe(false);
    expect(app.activeRoute).toBe('20');
    expect(app.dirty).toBe(true);
  });

  it('saves before switching when the user agrees', async () => {
    await selectRoute('20');
    typeKeys('0815');
    press('Enter');
    window.confirm = vi.fn(() => true);
    expect(await selectRoute('30')).toBe(true);
    expect(await readRoute(fs, '20')).toContain('#TRC;0;0815;');
    expect(app.activeRoute).toBe('30');
  });

  it('creates a new route with a UUID as its ID and opens it', async () => {
    document.getElementById('btn-new-route').click();
    await flush();
    expect(app.activeRoute).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(await readRoute(fs, /** @type {string} */ (app.activeRoute))).toContain('#RUT;-1;;');
    expect(app.routeState.mode).toBe('');
  });

  it('deletes a route after asking, keeping a backup', async () => {
    await selectRoute('20');
    document.getElementById('ef-del-route').click();
    await flush();
    expect(await readRoute(fs, '20')).toBe(null);
    expect((await fs.list('data/backups')).some((e) => e.name.startsWith('20.') && e.name.endsWith('.deleted.txt'))).toBe(true);
    expect(app.routes.map((r) => r.code)).toEqual(['30']);
    expect(app.activeRoute).toBe(null);
  });

  it('keeps the route when deleting fails', async () => {
    await selectRoute('20');
    fs.remove = async () => { throw new Error('locked'); };
    document.getElementById('ef-del-route').click();
    await flush();
    expect(app.routes.map((r) => r.code)).toContain('20');
    expect(document.getElementById('msg-text').textContent).toContain('locked');
  });
});

const cellTime = (r, c) => document.querySelector(`[data-r="${r}"][data-c="${c}"]`)?.textContent;

describe('route editor — review fixes', () => {
  it('deleting a period keeps the remaining period\'s trips', async () => {
    await selectRoute('20');
    const sel = /** @type {HTMLSelectElement} */ (document.getElementById('sel-period'));
    sel.value = String(app.routeState.periods[1].id); // Sommer
    sel.dispatchEvent(new Event('change'));
    expect(cellTime(0, 0)).toBe('0900');
    document.getElementById('btn-del-per').click();
    expect(app.routeState.periods.map((p) => p.name)).toEqual(['Vinter']);
    expect(cellTime(0, 0)).toBe('0700');
    expect(app.routeState.grids[`${app.routeState.activePer}:${app.routeState.activeDir}`].cols[0].cells[0].time).toBe('0700');
  });

  it('deleting a direction keeps the remaining direction\'s trips', async () => {
    await selectRoute('20');
    document.getElementById('ef-dir').click(); // creates "Retur" with the stops reversed, no trips
    expect(cellTime(0, 0)).toBe(undefined);
    document.getElementById('ef-del-dir').click();
    expect(app.routeState.directions).toHaveLength(1);
    expect(cellTime(0, 0)).toBe('0700');
  });

  it('keeps edits made while a save is running as unsaved', async () => {
    await selectRoute('20');
    typeKeys('0800');
    press('Enter');
    /** @type {(value?: any) => void} */
    let release = () => {};
    const write = fs.writeBytes;
    fs.writeBytes = async (p, b) => { await new Promise((r) => { release = r; }); return write(p, b); };
    document.getElementById('ef-save').click();
    press('ArrowUp');
    typeKeys('0915');
    press('Enter');
    fs.writeBytes = write;
    release();
    await flush();
    await flush();
    expect(await readRoute(fs, '20')).toContain('#TRC;0;0800;');
    expect(app.dirty).toBe(true);
  });

  it('leaves out a date exception without dates', async () => {
    await selectRoute('20');
    press('F7');
    document.getElementById('fn-add-exc').click();
    document.getElementById('fn-apply').click();
    document.getElementById('ef-save').click();
    await flush();
    expect(await readRoute(fs, '20')).not.toContain('#UNT');
    expect(app.routes.find((r) => r.code === '20').status).not.toBe('damaged');
  });

  it('refuses to save a route that would be damaged, and says so', async () => {
    await selectRoute('20');
    app.routeState.footnotes.push({ id: 9, text: '', exceptions: [{ runsOnly: false, from: '', to: '' }] });
    grid.cols[0].footnoteId = 9; // the grid on screen
    const before = await readRoute(fs, '20');
    typeKeys('0800');
    press('Enter');
    document.getElementById('ef-save').click();
    await flush();
    expect(await readRoute(fs, '20')).toBe(before);
    expect(app.dirty).toBe(true);
    expect(/** @type {HTMLDialogElement} */ (document.getElementById('msg-dlg')).open).toBe(true);
  });

  it('closes the note editor when another route opens', async () => {
    await selectRoute('20');
    press('F7');
    expect(document.getElementById('fn-editor').classList.contains('open')).toBe(true);
    await selectRoute('30');
    expect(document.getElementById('fn-editor').classList.contains('open')).toBe(false);
  });

  it('treats a half-typed time as an unsaved change', async () => {
    await selectRoute('20');
    typeKeys('0930');
    window.confirm = vi.fn(() => false);
    expect(await selectRoute('30')).toBe(false);
    expect(window.confirm).toHaveBeenCalled();
    expect(cellTime(0, 0)).toBe('0930');
  });

  it('keeps a half-typed time when switching period', async () => {
    await selectRoute('20');
    typeKeys('0930');
    const choose = (/** @type {number} */ id) => {
      const sel = /** @type {HTMLSelectElement} */ (document.getElementById('sel-period')); // redrawn on every switch
      sel.value = String(id);
      sel.dispatchEvent(new Event('change'));
    };
    choose(app.routeState.periods[1].id);
    choose(app.routeState.periods[0].id);
    expect(cellTime(0, 0)).toBe('0930');
  });

});

describe('organisation pickers', () => {
  beforeEach(async () => {
    const sek = ['#SEK;NOG:Authority:aaaaaaaaaa1;Eksempel fylkeskommune;1;0;0;0', '#SEK;NOG:Operator:bbbbbbbbbb2;Eksempel Buss AS;0;1;0;0', '#SEK;TST:Operator:9;Gammel;0;1;0;0'].join('\r\n') + '\r\n';
    const text = route20.replace(/^#SEK;.*\r\n/gm, '').replace('#CUR;', sek + '#CUR;').replace(';20;', ';70;');
    await writeRoute(fs, '70', text);
    await openFs(fs);
    /** @type {any} */ (document.getElementById('check-dlg')).close();
    app.orgRegister = { companies: registerCompanies(), fetchedAt: 'x' };
    await selectRoute('70');
  });

  it('picking an operator replaces every operator on the line and adds the company to the project copy', async () => {
    // route has two operators: NOG:Operator:bbbbbbbbbb2 and TST:Operator:9
    document.getElementById('ef-pick-operator')?.querySelector('.org-pick-btn')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const input = /** @type {HTMLInputElement} */ (document.querySelector('#ef-pick-operator .org-pick-search'));
    input.value = 'Fjord';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await flush();
    expect(app.routeState.sek.filter((/** @type {any} */ s) => s.isOperator).map((/** @type {any} */ s) => s.orgId)).toEqual(['NOG:Operator:ddddddddd4']);
    expect(app.dirty).toBe(true);
    expect(JSON.parse(await readText(fs, 'data/orgs.json')).companies.map((/** @type {any} */ c) => c.name)).toContain('Fjord AS');
  });

  it('offers to remove extra organisations of a role', async () => {
    // same two-operator route
    expect(document.querySelector('.ef-org-extra')?.textContent).toContain('2 operatører');
    /** @type {HTMLElement} */ (document.querySelector('.ef-org-extra-x')).click();
    expect(app.routeState.sek.filter((/** @type {any} */ s) => s.isOperator)).toHaveLength(1);
  });

  it('marks an organisation that is not in the register', async () => {
    // same two-operator route, but the first operator removed from the register
    app.orgRegister = { companies: registerCompanies().filter((c) => c.name !== 'Eksempel Buss AS'), fetchedAt: 'x' };
    refreshAll();
    expect(document.getElementById('ef-pick-operator')?.classList.contains('invalid')).toBe(true);
  });

  it('never overwrites an unreadable organisation file when picking', async () => {
    app.orgsError = 'unreadable';
    const before = await readText(fs, 'data/orgs.json');
    // pick Fjord AS as operator as in the first test
    document.getElementById('ef-pick-operator')?.querySelector('.org-pick-btn')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const input = /** @type {HTMLInputElement} */ (document.querySelector('#ef-pick-operator .org-pick-search'));
    input.value = 'Fjord';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await flush();
    expect(await readText(fs, 'data/orgs.json')).toBe(before);
  });
});
describe('line header', () => {
  it('shows the mode as an icon and changes mode and submode through the menu', async () => {
    await selectRoute('20');
    const tile = /** @type {HTMLElement} */ (document.getElementById('rh-mode-tile'));
    expect(tile.querySelector('svg.mode-icon')).not.toBe(null);
    tile.click();
    /** @type {HTMLElement} */ (document.querySelector('.mode-menu .mode-item[data-mode="coach"]')).click();
    /** @type {HTMLElement} */ (document.querySelector('.mode-menu .mode-sub[data-sub="nationalCoach"]')).click();
    expect([app.routeState.mode, app.routeState.submode]).toEqual(['coach', 'nationalCoach']);
    expect(app.dirty).toBe(true);
    expect(document.getElementById('rh-mode-tile')?.title).toContain('Langdistansebuss');
  });

  it('edits public code, private code and branding', async () => {
    app.brandings = [{ id: 'TST:Branding:b', name: 'Kystekspressen', shortName: '', description: '', url: '', imageUrl: '' }];
    await selectRoute('20');
    const set = (/** @type {string} */ id, /** @type {string} */ v) => { const el = /** @type {any} */ (document.getElementById(id)); el.value = v; el.dispatchEvent(new Event('change')); };
    set('rh-public', 'X20');
    set('rh-private', '1008');
    set('rh-branding', 'TST:Branding:b');
    expect([app.routeState.publicCode, app.routeState.privateCode, app.routeState.brandingId]).toEqual(['X20', '1008', 'TST:Branding:b']);
  });

  it('puts the organisation pickers in the header, not the footer', async () => {
    await selectRoute('20');
    expect(document.getElementById('rh-orgs')?.querySelector('#ef-pick-operator')).not.toBe(null);
    expect(document.getElementById('edit-footer')?.querySelector('.org-pick')).toBe(null);
  });

  it('disables every header control on a read-only route', async () => {
    await selectRoute('30');
    for (const id of ['rh-name', 'rh-public', 'rh-private', 'rh-branding', 'rh-mode-tile']) {
      expect(/** @type {any} */ (document.getElementById(id)).disabled, id).toBe(true);
    }
  });
});
