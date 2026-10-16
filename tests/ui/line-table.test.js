// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadAppMarkup } from './dom-setup.js';
import { app } from '../../src/ui/state.js';
import { initShell, setPage, refreshAll, currentPage } from '../../src/ui/shell.js';
import { initRouteList } from '../../src/ui/route-list.js';
import { initProjectUi, openFs } from '../../src/ui/project-ui.js';
import { initGrid } from '../../src/ui/grid.js';
import { initFootnoteEditor } from '../../src/ui/footnote-editor.js';
import { initRouteEditor, selectRoute } from '../../src/ui/route-editor.js';
import { initLineTable } from '../../src/ui/line-table.js';
import { resetListStates } from '../../src/ui/list-view.js';
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

const key = (/** @type {string} */ k, opts = {}) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...opts }));
const table = () => /** @type {HTMLElement} */ (document.getElementById('line-table'));
const rows = () => /** @type {HTMLElement[]} */ ([...document.querySelectorAll('#line-table .lv-row')]);
const names = () => rows().map((r) => r.querySelector('.lv-c-name')?.textContent);
const btn = (/** @type {string} */ id) => /** @type {HTMLButtonElement} */ (document.getElementById(id));
const field = (/** @type {string} */ id) => /** @type {HTMLInputElement & HTMLSelectElement} */ (document.getElementById(id));
const click = (/** @type {HTMLElement} */ el, opts = {}) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, ...opts }));

let wired = false;
beforeEach(async () => {
  resetListStates();
  app.linesFilterCal = null;
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

describe('Linjer on the shared list frame', () => {
  it('is its own page (Alt+2), sorted by public code, with Finn and Verktøy in a left pane', () => {
    key('2', { altKey: true });
    expect(currentPage()).toBe('lines');
    expect(table().querySelector('.lv-pane .lv-find #lt-search')).not.toBeNull();
    expect(table().querySelector('.lv-pane .lv-tools #lt-edit')).not.toBeNull();
    expect(names()).toEqual(['Alta', 'Bergen', 'Drammen']);
  });

  it('shows each line as a record over its timeline band, with a validity strip; drafts are hatched', () => {
    setPage('lines');
    const alta = rows()[0];
    expect(alta.querySelector('.lv-band .vb')).not.toBeNull();
    expect(alta.classList.contains('lv-expired')).toBe(true);
    expect(alta.textContent).toContain('Utløpt');
    expect(rows()[1].classList.contains('lv-future')).toBe(true); // cal-new is 2099
  });

  it('searches and sorts', () => {
    setPage('lines');
    field('lt-search').value = 'berg';
    field('lt-search').dispatchEvent(new Event('input'));
    expect(names()).toEqual(['Bergen']);
    field('lt-search').value = '';
    field('lt-search').dispatchEvent(new Event('input'));
    /** @type {HTMLElement} */ (table().querySelector('.lv-head [data-col="name"]')).click();
    /** @type {HTMLElement} */ (table().querySelector('.lv-head [data-col="name"]')).click();
    expect(names()).toEqual(['Drammen', 'Bergen', 'Alta']);
  });

  it('selects by click and Shift-click; Rediger opens the line in the timetable', () => {
    setPage('lines');
    expect(btn('lt-edit').disabled).toBe(true);
    click(rows()[0]);
    click(rows()[2], { shiftKey: true });
    expect(rows().filter((r) => r.classList.contains('selected'))).toHaveLength(3);
    click(rows()[1]);
    btn('lt-edit').click();
    expect(app.activeRoute).toBe('a');
    expect(currentPage()).toBe('edit');
  });

  it('opens a line on double-click', () => {
    setPage('lines');
    rows()[1].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(app.activeRoute).toBe('a');
    expect(currentPage()).toBe('edit');
  });

  it('filters on validity', () => {
    setPage('lines');
    field('lt-f-status').value = 'expired';
    field('lt-f-status').dispatchEvent(new Event('change'));
    expect(names()).toEqual(['Alta']);
  });

  it('sets "Eksporter ikke" on the selected lines, unsaved, and then shows them as drafts', () => {
    setPage('lines');
    click(rows()[0]);
    field('lt-exp').value = '1';
    field('lt-exp').dispatchEvent(new Event('change'));
    expect(app.drafts.get('b')?.exported).toBe(false);
    expect(rows()[0].classList.contains('lv-draft')).toBe(true);
    expect(rows()[0].textContent).toContain('Utkast');
  });

  it('looks the same after a visit to another page', () => {
    setPage('lines');
    field('lt-search').value = 'a';
    field('lt-search').dispatchEvent(new Event('input'));
    click(rows()[0]);
    setPage('edit');
    setPage('lines');
    expect(field('lt-search').value).toBe('a');
    expect(rows().filter((r) => r.classList.contains('selected'))).toHaveLength(1);
  });

  it('a calendar chip opens the calendar; the calendar filter can be removed', () => {
    setPage('lines');
    /** @type {HTMLElement} */ (rows()[0].querySelector('.lt-calchip')).click();
    expect(currentPage()).toBe('calendars');
    expect(app.calendarSelected).toBe('cal-old');
    app.linesFilterCal = 'cal-old';
    setPage('lines');
    expect(names()).toEqual(['Alta']);
    /** @type {HTMLElement} */ (document.querySelector('#lt-f-cal button')).click();
    expect(names()).toHaveLength(3);
  });

  it('follows a language switch, keeping the search', () => {
    setPage('lines');
    field('lt-search').value = 'berg';
    field('lt-search').dispatchEvent(new Event('input'));
    app.settings.lang = 'en';
    refreshAll();
    expect(table().querySelector('.lv-head [data-col="name"]')?.textContent).toBe('Name');
    expect(field('lt-search').value).toBe('berg');
    app.settings.lang = 'no';
    refreshAll();
  });

  it('"+ Ny linje" opens the new line in the timetable', async () => {
    setPage('lines');
    btn('lt-new').click();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(app.routes).toHaveLength(4);
    expect(currentPage()).toBe('edit');
  });
});

describe('the timetable\'s navigator follows Linjer', () => {
  it('lists the lines Linjer shows, in its order, keeping the open line', async () => {
    setPage('lines');
    field('lt-search').value = 'en'; // Bergen, Drammen
    field('lt-search').dispatchEvent(new Event('input'));
    /** @type {HTMLElement} */ (table().querySelector('.lv-head [data-col="name"]')).click();
    /** @type {HTMLElement} */ (table().querySelector('.lv-head [data-col="name"]')).click(); // name, descending
    rows()[0].dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); // Drammen
    const nav = [...document.querySelectorAll('#route-list .route-item')].map((e) => /** @type {HTMLElement} */ (e).title.split(' · ')[0]);
    expect(nav).toEqual(['Drammen', 'Bergen']);
  });
});
