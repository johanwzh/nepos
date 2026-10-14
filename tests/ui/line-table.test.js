// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadAppMarkup } from './dom-setup.js';
import { app } from '../../src/ui/state.js';
import { initShell, setPage } from '../../src/ui/shell.js';
import { initRouteList } from '../../src/ui/route-list.js';
import { initProjectUi, openFs } from '../../src/ui/project-ui.js';
import { initGrid } from '../../src/ui/grid.js';
import { initFootnoteEditor } from '../../src/ui/footnote-editor.js';
import { initRouteEditor, selectRoute } from '../../src/ui/route-editor.js';
import { initLineTable } from '../../src/ui/line-table.js';
import { createMemoryFs } from '../../src/project/fs.js';
import { createProject } from '../../src/project/create.js';
import { writeRoute } from '../../src/project/routes.js';
import { writeCalendars } from '../../src/project/calendars-store.js';

const route = (/** @type {string} */ code, /** @type {string} */ pub, /** @type {string} */ name, cal = 'cal-new') => [
  '#LEV;Test;TST', `#RUT;-1;${pub};${name};;1;`, '#SEK;NOG:Operator:bbbbbbbbbb2;B;0;1;0;0', '#CUR;neposcoin;1', '#TRA;A - B',
  '#PER;;;;;;', `#KAL;${cal}`, '#TAB;0;;;;', '#TUR;0;D;0;0;0;0',
  '#TRL;0;NSR:Quay:1;A;34;0;-1;-1;34;-1', '#TRC;0;0700;0;0;0;0;0',
  '#TRL;1;NSR:Quay:2;B;34;0;-1;-1;34;-1', '#TRC;0;0710;0;0;0;0;0',
].join('\r\n') + '\r\n';

const key = (/** @type {string} */ k) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
const table = () => /** @type {HTMLElement} */ (document.getElementById('line-table'));
const rows = () => /** @type {HTMLElement[]} */ ([...document.querySelectorAll('#lt-body tr')]);
const names = () => rows().map((r) => r.querySelector('.lt-name')?.textContent);
const btn = (/** @type {string} */ id) => /** @type {HTMLButtonElement} */ (document.getElementById(id));

let wired = false;
beforeEach(async () => {
  localStorage.clear();
  loadAppMarkup();
  initShell();
  setPage('edit');
  initRouteList();
  await initProjectUi({ restoreLast: false });
  if (!wired) { initGrid(); initFootnoteEditor(); wired = true; }
  initRouteEditor();
  initLineTable();
  window.confirm = vi.fn(() => true);
  const fs = createMemoryFs();
  await createProject(fs, { name: 'Test', codespace: 'TST' });
  await writeCalendars(fs, [{ id: 'cal-new', name: 'Ny', ranges: [['20990101', '20991231']] }, { id: 'cal-old', name: 'Gammel', ranges: [['20200101', '20200630']] }]);
  await writeRoute(fs, 'a', route('a', '10', 'Bergen'));
  await writeRoute(fs, 'b', route('b', '2', 'Alta', 'cal-old'));
  await writeRoute(fs, 'c', route('c', '33', 'Drammen'));
  await openFs(fs);
  /** @type {any} */ (document.getElementById('check-dlg')).close();
});

describe('lines pane, maxi view', () => {
  it('opens and closes with F5 and Esc', () => {
    key('F5');
    expect(table().hidden).toBe(false);
    expect(names()).toEqual(['Alta', 'Bergen', 'Drammen']); // by public code, numerically
    key('Escape');
    expect(table().hidden).toBe(true);
  });

  it('searches and sorts; the sort is remembered', () => {
    key('F5');
    const search = /** @type {HTMLInputElement} */ (document.getElementById('lt-search'));
    search.value = 'berg';
    search.dispatchEvent(new Event('input'));
    expect(names()).toEqual(['Bergen']);
    search.value = '';
    search.dispatchEvent(new Event('input'));
    /** @type {HTMLElement} */ (document.querySelector('#line-table th[data-col="name"]')).click();
    expect(names()).toEqual(['Alta', 'Bergen', 'Drammen']);
    /** @type {HTMLElement} */ (document.querySelector('#line-table th[data-col="name"]')).click();
    expect(names()).toEqual(['Drammen', 'Bergen', 'Alta']);
    expect(JSON.parse(/** @type {string} */ (localStorage.getItem('nepos.lineSort')))).toEqual({ col: 'name', dir: -1 });
  });

  it('selects by click, Shift-click and Ctrl-click; actions need a selection', () => {
    key('F5');
    expect(btn('lt-dup').disabled).toBe(true);
    expect(btn('lt-del').disabled).toBe(true);
    rows()[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    rows()[2].dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
    expect(rows().filter((r) => r.classList.contains('selected'))).toHaveLength(3);
    rows()[1].dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
    expect(rows().filter((r) => r.classList.contains('selected'))).toHaveLength(2);
    expect(btn('lt-dup').disabled).toBe(false);
  });

  it('filters on status and shows expired lines', () => {
    key('F5');
    const alta = /** @type {HTMLElement} */ (rows().find((r) => r.textContent?.includes('Alta')));
    expect(alta.textContent).toContain('Utløpt');
    const status = /** @type {HTMLSelectElement} */ (document.getElementById('lt-f-status'));
    status.value = 'expired';
    status.dispatchEvent(new Event('change'));
    expect(names()).toEqual(['Alta']);
  });

  it('sets "Eksporter ikke" on the selected lines, unsaved', () => {
    key('F5');
    expect(document.querySelector('#line-table th[data-col="exported"]')?.textContent).toBe('Eksporter ikke');
    expect(document.querySelector('#line-table th[data-col="public"]')?.textContent).toBe('Ikke åpen rute');
    rows()[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const exp = /** @type {HTMLSelectElement} */ (document.getElementById('lt-exp'));
    exp.value = '1';
    exp.dispatchEvent(new Event('change'));
    expect(app.drafts.get('b')?.exported).toBe(false);
    expect(rows()[0].textContent).toContain('●');
    expect(rows()[0].querySelector('.lt-flag-exp')?.textContent).toBe('✓');
  });

  it('does not pass keys to the grid behind it (review I4)', async () => {
    await selectRoute('a');
    const cell = () => document.querySelector('[data-r="0"][data-c="0"]')?.textContent;
    expect(cell()).toBe('0700');
    key('F5');
    rows()[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    key('Delete');
    key('Escape');
    expect(cell()).toBe('0700');
  });

  it('opens a line on double-click and closes the view', () => {
    key('F5');
    rows()[1].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(app.activeRoute).toBe('a');
    expect(table().hidden).toBe(true);
  });
});
