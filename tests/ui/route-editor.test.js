// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadAppMarkup, flush } from './dom-setup.js';
import { app } from '../../src/ui/state.js';
import { initShell } from '../../src/ui/shell.js';
import { initRouteList } from '../../src/ui/route-list.js';
import { initProjectUi, openFs } from '../../src/ui/project-ui.js';
import { initGrid } from '../../src/ui/grid.js';
import { initFootnoteEditor } from '../../src/ui/footnote-editor.js';
import { initRouteEditor, selectRoute } from '../../src/ui/route-editor.js';
import { createMemoryFs, readText } from '../../src/project/fs.js';
import { createProject } from '../../src/project/create.js';
import { writeRoute, readRoute } from '../../src/project/routes.js';
import { writeOrgs } from '../../src/project/orgs-store.js';
import { sample } from '../fixtures/sample-project.js';
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
  await writeOrgs(fs, [{ id: 'TST:Operator:3', name: 'Kystbuss AS' }]);
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

  it('does not write unsaved invalid organisation edits into a route', async () => {
    await selectRoute('20');
    app.orgs = [{ id: '3', name: 'Ugyldig navn' }]; // matches the route's #SEK, but is not a valid ID
    app.orgsStatus = 'not-saved';
    typeKeys('0820');
    press('Enter');
    document.getElementById('ef-save').click();
    await flush();
    const text = await readRoute(fs, '20');
    expect(text).not.toContain('Ugyldig navn');
    expect(text).toContain('#SEK;3;Kystbuss AS;0;1;0;0');
  });

  it('creates a new route with the next number and opens it', async () => {
    document.getElementById('btn-new-route').click();
    await flush();
    await flush();
    expect(app.activeRoute).toBe('31');
    expect(await readRoute(fs, '31')).toContain('#RUT;-1;31;');
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
