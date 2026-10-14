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

  it('adds a table set with reversed stops after asking', () => {
    window.prompt = vi.fn(() => 'Florø - Askvoll');
    /** @type {HTMLElement} */ (document.querySelector('.ts-add')).click();
    expect(app.routeState.tableSets.map((/** @type {any} */ s) => s.name)).toContain('Florø - Askvoll');
    expect(grid.stops[0].name).toBe('Florø');
    expect(app.dirty).toBe(true);
  });

  it('renames a table set on double-click', () => {
    window.prompt = vi.fn(() => 'Bergen – Florø (ny)');
    tabs()[0].querySelector('.ts-name')?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
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
