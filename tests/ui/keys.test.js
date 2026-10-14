// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadAppMarkup, flush } from './dom-setup.js';
import { app } from '../../src/ui/state.js';
import { initShell, currentPage, setPage } from '../../src/ui/shell.js';
import { initRouteList } from '../../src/ui/route-list.js';
import { initProjectUi, openFs } from '../../src/ui/project-ui.js';
import { initGrid } from '../../src/ui/grid.js';
import { initFootnoteEditor } from '../../src/ui/footnote-editor.js';
import { initRouteEditor, selectRoute } from '../../src/ui/route-editor.js';
import { createMemoryFs } from '../../src/project/fs.js';
import { createProject } from '../../src/project/create.js';
import { writeRoute, readRoute } from '../../src/project/routes.js';
import { sample } from '../fixtures/sample-project.js';
import { parseERN } from '../../src/core/ern/parse.js';
import { serializeERN } from '../../src/core/ern/serialize.js';

const press = (/** @type {string} */ key, opts = {}) => document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...opts }));
const typeKeys = (/** @type {string} */ s) => [...s].forEach((k) => press(k));
const cellTime = (/** @type {number} */ r, /** @type {number} */ c) => document.querySelector(`[data-r="${r}"][data-c="${c}"]`)?.textContent;
const route20 = serializeERN(parseERN(sample.routes[1].text), '20', { delivery: { name: 'Test', codespace: 'TST' } });

/** @type {any} */
let fs;
let wired = false;

beforeEach(async () => {
  loadAppMarkup();
  initShell();
  setPage('edit'); // the view is module state: start every test on the edit page
  initRouteList();
  await initProjectUi({ restoreLast: false });
  if (!wired) { initGrid(); initFootnoteEditor(); wired = true; }
  initRouteEditor();
  window.confirm = vi.fn(() => true);
  fs = createMemoryFs();
  await createProject(fs, { name: 'Test', codespace: 'TST' });
  await writeRoute(fs, '20', route20);
  await writeRoute(fs, '21', route20);
  await openFs(fs);
  /** @type {any} */ (document.getElementById('check-dlg')).close();
});

const key = (/** @type {string} */ k, opts = {}, target = /** @type {EventTarget} */ (document)) => target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...opts }));

describe('keys', () => {
  it('switches views with Alt+1/2/3 and F3/F4, also from a text field', async () => {
    await selectRoute('20');
    const name = /** @type {HTMLInputElement} */ (document.getElementById('rh-name'));
    key('2', { altKey: true }, name);
    expect(currentPage()).toBe('assets');
    key('1', { altKey: true });
    expect(currentPage()).toBe('edit');
    // the header was re-rendered: use the field that is on the page now
    key('F4', {}, /** @type {HTMLElement} */ (document.getElementById('rh-name')));
    expect(currentPage()).toBe('export');
  });

  it('does not switch views while a dialog is open', () => {
    /** @type {any} */ (document.getElementById('msg-dlg')).showModal();
    key('2', { altKey: true });
    expect(currentPage()).toBe('edit');
  });

  it('saves with Ctrl+S from the route-name field, but not inside a dialog', async () => {
    await selectRoute('20');
    typeKeys('0811'); press('Enter');
    const name = /** @type {HTMLInputElement} */ (document.getElementById('rh-name'));
    key('s', { ctrlKey: true }, name);
    await flush(); await flush();
    expect(app.dirty).toBe(false);
    typeKeys('0812'); press('Enter');
    /** @type {any} */ (document.getElementById('new-dlg')).showModal();
    key('s', { ctrlKey: true }, document.getElementById('new-name') ?? document);
    await flush();
    expect(app.dirty).toBe(true);
  });

  it('keeps a typed line name on Ctrl+S and on a view switch (review I1)', async () => {
    await selectRoute('20');
    let name = /** @type {HTMLInputElement} */ (document.getElementById('rh-name'));
    name.focus();
    name.value = 'Nytt navn';                 // typed, no change event yet
    key('s', { ctrlKey: true }, name);
    await flush(); await flush();
    expect(parseERN(/** @type {string} */ (await readRoute(fs, '20'))).routeName).toBe('Nytt navn');
    name = /** @type {HTMLInputElement} */ (document.getElementById('rh-name'));
    name.focus();
    name.value = 'Enda nyere';
    key('2', { altKey: true }, name);
    expect(app.routeState.routeName).toBe('Enda nyere');
  });

  it('commits a half-typed cell before switching view', async () => {
    await selectRoute('20');
    typeKeys('0833');                    // not committed yet
    key('3', { altKey: true });
    key('1', { altKey: true });
    expect(cellTime(0, 0)).toBe('0833');
  });
});
