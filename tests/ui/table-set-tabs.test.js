// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadAppMarkup } from './dom-setup.js';
import { app } from '../../src/ui/state.js';
import { initShell } from '../../src/ui/shell.js';
import { initRouteList } from '../../src/ui/route-list.js';
import { initProjectUi, openFs } from '../../src/ui/project-ui.js';
import { initGrid, grid } from '../../src/ui/grid.js';
import { initFootnoteEditor } from '../../src/ui/footnote-editor.js';
import { initRouteEditor, selectRoute } from '../../src/ui/route-editor.js';
import { initTableSetTabs } from '../../src/ui/table-set-tabs.js';
import { createMemoryFs } from '../../src/project/fs.js';
import { createProject } from '../../src/project/create.js';
import { writeRoute } from '../../src/project/routes.js';
import { sample } from '../fixtures/sample-project.js';

let wired = false;
const tabs = () => [...document.querySelectorAll('.ts-tab')];

beforeEach(async () => {
  loadAppMarkup();
  initShell();
  initRouteList();
  await initProjectUi({ restoreLast: false });
  if (!wired) { initGrid(); initFootnoteEditor(); wired = true; }
  initRouteEditor();
  initTableSetTabs();
  window.confirm = vi.fn(() => true);
  window.prompt = vi.fn(() => null);
  const fs = createMemoryFs();
  await createProject(fs, { name: 'Test', codespace: 'TST' });
  await writeRoute(fs, '10', sample.routes[0].text);
  await writeRoute(fs, '20', sample.routes[1].text);
  await openFs(fs);
  /** @type {any} */ (document.getElementById('check-dlg')).close();
  await selectRoute('10');
});

describe('table-set tabs', () => {
  it('shows one tab per table set and switches between them', () => {
    expect(tabs().map((t) => t.querySelector('.ts-name')?.textContent)).toEqual(['Bergen - Florø', 'Florø - Bergen']);
    /** @type {HTMLElement} */ (tabs()[1].querySelector('.ts-name')).click();
    expect(app.routeState.activeSet).toBe(app.routeState.tableSets[1].id);
    expect(grid.stops.map((/** @type {any} */ s) => s.name)).toEqual(['Florø', 'Ukjent brygge', 'Bergen']);
  });

  it('adds a table set through the dialog, with the stops reversed', () => {
    /** @type {HTMLElement} */ (document.querySelector('.ts-add')).click();
    expect(/** @type {any} */ (document.getElementById('ts-dlg')).open).toBe(true);
    /** @type {HTMLInputElement} */ (document.getElementById('ts-dlg-name')).value = 'Florø - Askvoll';
    /** @type {HTMLInputElement} */ (document.querySelector('input[name="ts-stops"][value="reversed"]')).checked = true;
    /** @type {HTMLElement} */ (document.getElementById('ts-dlg-ok')).click();
    expect(app.routeState.tableSets.map((/** @type {any} */ s) => s.name)).toContain('Florø - Askvoll');
    expect(grid.stops[0].name).toBe('Florø');
    expect(/** @type {any} */ (document.getElementById('ts-dlg')).open).toBe(false);
  });

  it('keeps the dialog open on an empty name, and Cancel creates nothing', () => {
    /** @type {HTMLElement} */ (document.querySelector('.ts-add')).click();
    /** @type {HTMLElement} */ (document.getElementById('ts-dlg-ok')).click();
    expect(/** @type {any} */ (document.getElementById('ts-dlg')).open).toBe(true);
    expect(document.getElementById('ts-dlg-name')?.classList.contains('invalid')).toBe(true);
    /** @type {HTMLElement} */ (document.getElementById('ts-dlg-cancel')).click();
    expect(app.routeState.tableSets).toHaveLength(2);
  });

  it('starts a blank table set as 3 empty stops by 3 empty trips, like a new line (user 2026-10-19)', () => {
    /** @type {HTMLElement} */ (document.querySelector('.ts-add')).click();
    /** @type {HTMLInputElement} */ (document.getElementById('ts-dlg-name')).value = 'Rundtur';
    /** @type {HTMLInputElement} */ (document.querySelector('input[name="ts-stops"][value="empty"]')).checked = true;
    /** @type {HTMLElement} */ (document.getElementById('ts-dlg-ok')).click();
    expect(grid.stops).toHaveLength(3);
    expect(grid.cols).toHaveLength(3);
    expect(grid.stops.every((/** @type {any} */ s) => !s.name && !s.stopId)).toBe(true);
  });

  it('"New…" in a tab\'s menu copies the stops of that tab, not the active one', () => {
    tabs()[1].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
    /** @type {HTMLElement} */ (document.getElementById('tsm-new')).click();
    /** @type {HTMLInputElement} */ (document.getElementById('ts-dlg-name')).value = 'Kopi av retur';
    /** @type {HTMLElement} */ (document.getElementById('ts-dlg-ok')).click();
    expect(grid.stops.map((/** @type {any} */ s) => s.name)).toEqual(['Florø', 'Ukjent brygge', 'Bergen']);
  });

  it('renames a table set on double-click (in the edit dialog)', () => {
    tabs()[0].querySelector('.ts-name')?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    /** @type {HTMLInputElement} */ (document.getElementById('tse-name')).value = 'Bergen – Florø (ny)';
    /** @type {HTMLElement} */ (document.getElementById('tse-ok')).click();
    expect(app.routeState.tableSets[0].name).toBe('Bergen – Florø (ny)');
  });

  it('deletes the active table set after asking, and offers no delete for the only one', async () => {
    /** @type {HTMLElement} */ (tabs()[1].querySelector('.ts-name')).click();
    /** @type {HTMLElement} */ (document.querySelector('.ts-del')).click();
    expect(app.routeState.tableSets).toHaveLength(1);
    await selectRoute('20');
    expect(document.querySelector('.ts-del')).toBe(null);
  });
});

describe('table-set tab safety', () => {
  it('asks before deleting a table set whose unsaved grid has stops', () => {
    /** @type {HTMLElement} */ (document.querySelector('.ts-add')).click();
    /** @type {HTMLInputElement} */ (document.getElementById('ts-dlg-name')).value = 'Ny';
    /** @type {HTMLElement} */ (document.getElementById('ts-dlg-ok')).click(); // same stops: on screen
    // The stored state of the new set is empty; only the grid on screen has stops (typed, unsaved).
    const rs = app.routeState;
    rs.grids[`${rs.activePer}:${rs.activeSet}`] = { stops: [], cols: [] };
    window.confirm = vi.fn(() => false);
    /** @type {HTMLElement} */ (document.querySelector('.ts-del')).click();
    expect(window.confirm).toHaveBeenCalled();
    expect(app.routeState.tableSets).toHaveLength(3);
  });

  it('shows a new name at once after renaming', () => {
    app.dirty = true; // a rename while there are other unsaved edits must still show
    tabs()[0].querySelector('.ts-name')?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    /** @type {HTMLInputElement} */ (document.getElementById('tse-name')).value = 'Nytt navn';
    /** @type {HTMLElement} */ (document.getElementById('tse-ok')).click();
    expect(tabs()[0].querySelector('.ts-name')?.textContent).toBe('Nytt navn');
  });
});

describe('the tab menu and edit dialog (2026-10-19)', () => {
  const menuItem = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
  const rightClick = (/** @type {number} */ i) => tabs()[i].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));

  it('edits the name and the direction in a dialog; the tab shows the direction', () => {
    rightClick(0);
    menuItem('tsm-edit').click();
    const dlg = /** @type {any} */ (document.getElementById('tse-dlg'));
    expect(dlg.open).toBe(true);
    /** @type {HTMLInputElement} */ (document.getElementById('tse-name')).value = 'Bergen – Florø';
    const dir = /** @type {HTMLSelectElement} */ (document.getElementById('tse-dir'));
    expect([...dir.options].map((o) => o.textContent)).toEqual(['Ikke angitt', 'Tur', 'Retur', 'Med klokka', 'Mot klokka']);
    dir.value = 'inbound';
    /** @type {HTMLElement} */ (document.getElementById('tse-ok')).click();
    expect(app.routeState.tableSets[0]).toMatchObject({ name: 'Bergen – Florø', direction: 'inbound' });
    expect(tabs()[0].textContent).toContain('Bergen – Florø');
    expect(tabs()[0].querySelector('.ts-dir')?.textContent).toBe('[Retur]');
  });

  it('opens the same dialog on a double click', () => {
    /** @type {HTMLElement} */ (tabs()[1].querySelector('.ts-name')).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(/** @type {any} */ (document.getElementById('tse-dlg')).open).toBe(true);
    expect(/** @type {HTMLInputElement} */ (document.getElementById('tse-name')).value).toBe('Florø - Bergen');
  });

  it('duplicates a table set with its trips, under new IDs, right after it', () => {
    const before = app.routeState.tableSets.length;
    rightClick(0);
    menuItem('tsm-dup').click();
    const rs = app.routeState;
    expect(rs.tableSets).toHaveLength(before + 1);
    expect(rs.tableSets[1].name).toBe('Bergen - Florø (kopi)');
    expect(rs.activeSet).toBe(rs.tableSets[1].id);
    expect(grid.cols.length).toBeGreaterThan(0);
    const orig = rs.periods.filter((/** @type {any} */ p) => p.setId === rs.tableSets[0].id).flatMap((/** @type {any} */ p) => rs.grids[`${p.id}:${p.setId}`].cols.map((/** @type {any} */ c) => c.uid));
    expect(grid.cols.some((/** @type {any} */ c) => orig.includes(c.uid))).toBe(false);
    expect(rs.tableSets[1].uid).not.toBe(rs.tableSets[0].uid);
  });

  it('deletes a table set from the menu', () => {
    rightClick(1);
    menuItem('tsm-del').click();
    expect(app.routeState.tableSets.map((/** @type {any} */ s) => s.name)).toEqual(['Bergen - Florø']);
  });

  it('opens the new-table-set dialog from the menu', () => {
    rightClick(0);
    menuItem('tsm-new').click();
    expect(/** @type {any} */ (document.getElementById('ts-dlg')).open).toBe(true);
  });
});

describe('Ctrl+S (user test)', () => {
  it('never opens the browser\'s own Save dialog, also with a window open', () => {
    /** @type {any} */ (document.getElementById('tse-dlg')).showModal();
    const ev = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true });
    document.getElementById('tse-name')?.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });
});
