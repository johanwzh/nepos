// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadAppMarkup, flush } from './dom-setup.js';
import { app } from '../../src/ui/state.js';
import { initShell, setPage, currentPage } from '../../src/ui/shell.js';
import { initCalendarsPage } from '../../src/ui/calendars-page.js';
import { initRouteList } from '../../src/ui/route-list.js';
import { initProjectUi, openFs, openRecent } from '../../src/ui/project-ui.js';
import { initGrid, grid } from '../../src/ui/grid.js';
import { quayInfo } from '../../src/ui/quays.js';
import { initFootnoteEditor } from '../../src/ui/footnote-editor.js';
import { initRouteEditor, selectRoute } from '../../src/ui/route-editor.js';
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
  initCalendarsPage();
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
  it('has the four menus with their items', () => {
    openMenu(0);
    expect(items()).toEqual(['Nytt prosjekt…', 'Åpne prosjekt…', 'Åpne nylig', 'Prosjektinnstillinger…', 'Lag kopi av prosjekt…', 'Bytt codespace…', 'Lukk prosjekt']);
    openMenu(1);
    expect(document.querySelector('.mb-menu[data-menu="1"]')?.textContent).toBe('Rediger');
    expect(items()).toEqual(['Ny linje', 'Ny kalender', 'Lagre', 'Lagre alle endringer', 'Forkast alle endringer']);
    openMenu(2);
    expect(items()).toEqual(['Språk', 'Lys/mørk', 'Fargetema', 'Vis stoppenes privatkode']);
    openMenu(3);
    expect(items()).toEqual(['Hurtigtaster', 'Brukerveiledning', 'Versjonshistorikk', 'Kontakt', 'GitHub']);
  });

  it('switches the stops\' private codes on and off from Visning, and remembers it', () => {
    openMenu(0);
    openMenu(2);
    const was = !!app.settings.showPrivateCode;
    item('Vis stoppenes privatkode').click();
    expect(app.settings.showPrivateCode).toBe(!was);
    app.settings.showPrivateCode = was;
  });

  it('shows the private codes in the open timetable at once, with no reload (user 2026-10-19)', async () => {
    await selectRoute('20');
    for (const st of grid.stops) if (st.stopId != null) quayInfo.set(String(st.stopId), /** @type {any} */ ({ quayId: String(st.stopId), publicCode: '', privateCode: '06', stopPlaceId: '', stopPlaceName: '', mode: 'bus', lat: 0, lon: 0 }));
    app.settings.showPrivateCode = false;
    openMenu(0);
    openMenu(2);
    item('Vis stoppenes privatkode').click();
    await flush();
    expect(document.querySelector('#tbl .g-priv')?.textContent).toBe('06');
    app.settings.showPrivateCode = false;
    quayInfo.clear();
  });

  it('shows the keyboard shortcuts and the Entur contact from the Hjelp menu', () => {
    openMenu(0); // the menu bar keeps its open menu between tests: switch to Hjelp
    openMenu(3);
    item('Hurtigtaster').click();
    const dlg = /** @type {any} */ (document.getElementById('help-dlg'));
    expect(dlg.open).toBe(true);
    expect(dlg.textContent).toContain('Alt+M');
    expect(dlg.textContent).toContain('Ctrl+S');
    dlg.close();
    openMenu(0);
    openMenu(3);
    item('Kontakt').click();
    expect(dlg.querySelector('a[href="mailto:kollektivdata@entur.org"]')).not.toBeNull();
  });

  it('disables save-all and discard-all when nothing is unsaved', () => {
    openMenu(1);
    expect(item('Lagre alle endringer').classList.contains('disabled')).toBe(true);
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

describe('project settings and title', () => {
  it('shows the project as a title on the right, not as a button', () => {
    expect(document.getElementById('delivery-btn')).toBeNull();
    expect(document.getElementById('project-title')?.textContent).toBe('Test (TST)');
  });

  it('has "Prosjektinnstillinger…" in the Prosjekt menu, where the name is changed', async () => {
    openMenu(0);
    item('Prosjektinnstillinger…').click();
    const dlg = /** @type {any} */ (document.getElementById('settings-dlg'));
    expect(dlg.open).toBe(true);
    expect(dlg.textContent).toContain('TST');
    /** @type {HTMLInputElement} */ (document.getElementById('pop-name')).value = 'Nytt navn';
    document.getElementById('pop-save')?.click();
    await flush(); await flush();
    expect(app.meta?.name).toBe('Nytt navn');
    expect(dlg.open).toBe(false);
    expect(document.getElementById('project-title')?.textContent).toBe('Nytt navn (TST)');
  });
});

describe('changing the codespace', () => {
  it('rewrites the project to a new codespace from "Bytt codespace…"', async () => {
    openMenu(0);
    item('Bytt codespace…').click();
    const dlg = /** @type {any} */ (document.getElementById('cs-dlg'));
    expect(dlg.open).toBe(true);
    expect(dlg.textContent).not.toMatch(/koderom/i);
    const input = /** @type {HTMLInputElement} */ (document.getElementById('cs-new'));
    input.value = 'ab';
    document.getElementById('cs-ok')?.click();
    await flush();
    expect(dlg.open).toBe(true);                       // two letters: refused, the dialog stays
    expect(document.getElementById('cs-error')?.textContent).not.toBe('');
    input.value = 'abc';
    document.getElementById('cs-ok')?.click();
    for (let i = 0; i < 10; i++) await flush();
    expect(app.meta?.codespace).toBe('ABC');
    expect(app.routes.find((r) => r.code === '20')?.text).toMatch(/^#LEV;[^;\r\n]*;ABC/);
    expect(document.getElementById('project-title')?.textContent).toBe('Test (ABC)');
  });

  it('never says "koderom": codespace is a technical term', () => {
    for (const lang of ['no']) {
      app.settings.lang = lang;
      expect(JSON.stringify(Object.values(document.querySelectorAll('[data-lk]')).map((e) => e.textContent))).not.toMatch(/koderom|kodeområde/i);
    }
  });
});

describe('the Rediger menu covers lines and calendars', () => {
  it('"Ny kalender" opens a new, unsaved calendar on Kalendere', () => {
    openMenu(0); openMenu(1);
    item('Ny kalender').click();
    expect(currentPage()).toBe('calendars');
    expect(app.calendarDrafts.size).toBe(1);
    expect(app.calendarSelected).toBe([...app.calendarDrafts.keys()][0]);
    app.calendarDrafts.clear(); app.calendarSelected = null;
  });

  it('"Lagre alle endringer" and "Forkast alle endringer" include unsaved calendars', async () => {
    app.calendarDrafts.set('k1', { id: 'k1', name: 'Høst', ranges: [] });
    openMenu(0); openMenu(1);
    expect(item('Lagre alle endringer').classList.contains('disabled')).toBe(false);
    item('Lagre alle endringer').click();
    for (let i = 0; i < 8; i++) await flush();
    expect(app.calendars.map((c) => c.name)).toContain('Høst');
    expect(app.calendarDrafts.size).toBe(0);
    app.calendarDrafts.set('k1', { id: 'k1', name: 'Vinter', ranges: [] });
    openMenu(0); openMenu(1);
    item('Forkast alle endringer').click();
    expect(app.calendarDrafts.size).toBe(0);
  });

  it('Ctrl+Shift+S saves all changes from any page, and the menu says so', async () => {
    app.calendarDrafts.set('k3', { id: 'k3', name: 'Høst', ranges: [] });
    setPage('lines');
    openMenu(0); openMenu(1);
    expect(item('Lagre alle endringer').textContent).toContain('Ctrl+Shift+S');
    document.body.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'S', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }));
    for (let i = 0; i < 8; i++) await flush();
    expect(app.calendars.map((c) => c.name)).toContain('Høst');
    expect(app.calendarDrafts.size).toBe(0);
    setPage('edit');
  });

  it('Ctrl+S on Kalendere saves the open calendar', async () => {
    app.calendarDrafts.set('k2', { id: 'k2', name: 'Vår', ranges: [] });
    app.calendarSelected = 'k2';
    setPage('calendars');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }));
    for (let i = 0; i < 8; i++) await flush();
    expect(app.calendars.map((c) => c.name)).toContain('Vår');
    setPage('edit');
  });
});
