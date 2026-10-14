// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadAppMarkup, flush } from './dom-setup.js';
import { app } from '../../src/ui/state.js';
import { initShell, setPage } from '../../src/ui/shell.js';
import { initRouteList } from '../../src/ui/route-list.js';
import { initProjectUi, openFs, openRecent } from '../../src/ui/project-ui.js';
import { initGrid } from '../../src/ui/grid.js';
import { initFootnoteEditor } from '../../src/ui/footnote-editor.js';
import { initRouteEditor } from '../../src/ui/route-editor.js';
import { initMenus, reloadRecent } from '../../src/ui/menus.js';
import { setRecentStore, rememberFolder, loadRecentFolders } from '../../src/ui/recent-folders.js';
import { createMemoryFs } from '../../src/project/fs.js';
import { createProject } from '../../src/project/create.js';
import { writeRoute } from '../../src/project/routes.js';
import { sample } from '../fixtures/sample-project.js';

let wired = false;

beforeEach(async () => {
  loadAppMarkup();
  initShell();
  setPage('edit');
  initRouteList();
  await initProjectUi({ restoreLast: false });
  if (!wired) { initGrid(); initFootnoteEditor(); wired = true; }
  initRouteEditor();
  initMenus();
  window.confirm = vi.fn(() => true);
  app.settings.lang = 'no';
  const fs = createMemoryFs();
  await createProject(fs, { name: 'Test', codespace: 'TST' });
  await writeRoute(fs, '20', sample.routes[1].text);
  await openFs(fs);
  /** @type {any} */ (document.getElementById('check-dlg')).close();
});

const openMenu = (/** @type {number} */ i) => /** @type {HTMLElement} */ (document.querySelector(`.mb-menu[data-menu="${i}"]`)).click();
const items = () => [...document.querySelectorAll('.mb-drop:not(.mb-subdrop) > .mb-item')].map((e) => e.querySelector('.mb-label')?.textContent);
const item = (/** @type {string} */ label) => /** @type {HTMLElement} */ ([...document.querySelectorAll('.mb-item')].find((e) => e.querySelector('.mb-label')?.textContent === label));

describe('menu bar', () => {
  it('has the three menus with their items', () => {
    openMenu(0);
    expect(items()).toEqual(['Nytt prosjekt…', 'Åpne prosjekt…', 'Åpne nylig', 'Lukk prosjekt', 'Lag kopi av prosjekt…']);
    openMenu(1);
    expect(items()).toEqual(['Ny linje', 'Lagre linjen', 'Lagre alle linjer', 'Forkast alle endringer']);
    openMenu(2);
    expect(items()).toEqual(['Språk', 'Lys/mørk', 'Fargetema']);
  });

  it('disables save-all and discard-all when nothing is unsaved', () => {
    openMenu(1);
    expect(item('Lagre alle linjer').classList.contains('disabled')).toBe(true);
    expect(item('Forkast alle endringer').classList.contains('disabled')).toBe(true);
  });

  it('closes on Escape and on a click outside', () => {
    openMenu(0);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('.mb-drop')).toBe(null);
    openMenu(0);
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(document.querySelector('.mb-drop')).toBe(null);
  });

  it('switches language from the Visning menu', () => {
    openMenu(2);
    item('Språk').click();
    item('English').click();
    expect(app.settings.lang).toBe('en');
    expect(document.querySelector('.mb-menu[data-menu="2"]')?.textContent).toBe('View');
  });

  it('closes the project after the unsaved-changes check', async () => {
    window.confirm = vi.fn(() => true);
    openMenu(0);
    item('Lukk prosjekt').click();
    await flush(); await flush();
    expect(app.meta).toBe(null);
    expect(app.routes).toEqual([]);
  });

  it('keeps the project when a recent folder refuses access', async () => {
    const handle = { name: 'Gammel', queryPermission: async () => 'prompt', requestPermission: async () => 'denied' };
    window.confirm = vi.fn(() => false);
    await openRecent(handle);
    expect(app.meta?.name).toBe('Test');
    expect(/** @type {any} */ (window.confirm).mock.calls[0][0]).toContain('Gammel');
  });
});

describe('recent folders that are gone', () => {
  /** @type {Map<string, any>} */
  let store;
  beforeEach(async () => {
    store = new Map();
    setRecentStore({ get: async (k) => store.get(k) ?? null, put: async (k, v) => { store.set(k, v); } });
  });

  it('offers to take a folder off the list when it cannot be opened, and keeps the project', async () => {
    const gone = { name: 'Gammel', queryPermission: async () => 'granted', requestPermission: async () => 'granted',
      values: () => ({ next: async () => { throw new DOMException('gone', 'NotFoundError'); }, [Symbol.asyncIterator]() { return this; } }) };
    await rememberFolder(gone);
    window.confirm = vi.fn(() => true);
    await openRecent(gone);
    expect(window.confirm).toHaveBeenCalled();
    expect(await loadRecentFolders()).toEqual([]);
    expect(app.meta?.name).toBe('Test');
  });

  it('keeps it on the list when the user says no', async () => {
    const denied = { name: 'Gammel', queryPermission: async () => 'prompt', requestPermission: async () => 'denied' };
    await rememberFolder(denied);
    window.confirm = vi.fn(() => false);
    await openRecent(denied);
    expect((await loadRecentFolders()).map((f) => f.name)).toEqual(['Gammel']);
  });

  it('clears the whole list from the menu', async () => {
    await rememberFolder({ name: 'A' });
    await rememberFolder({ name: 'B' });
    await reloadRecent();
    openMenu(0);
    item('Åpne nylig').click();
    item('Tøm listen').click();
    await flush(); await flush();
    expect(await loadRecentFolders()).toEqual([]);
  });
});
