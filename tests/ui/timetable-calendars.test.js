// @vitest-environment jsdom
// The timetable's calendars live on the table set (user decision 2026-10-16): a row of chips under
// the table-set tabs, picked from a multi-choice list. The save state lives in the footer.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadAppMarkup, flush } from './dom-setup.js';
import { app } from '../../src/ui/state.js';
import { initShell, setPage } from '../../src/ui/shell.js';
import { initRouteList } from '../../src/ui/route-list.js';
import { initProjectUi, openFs } from '../../src/ui/project-ui.js';
import { initGrid } from '../../src/ui/grid.js';
import { initFootnoteEditor } from '../../src/ui/footnote-editor.js';
import { initRouteEditor, selectRoute } from '../../src/ui/route-editor.js';
import { createMemoryFs } from '../../src/project/fs.js';
import { createProject } from '../../src/project/create.js';
import { writeRoute, readRoute } from '../../src/project/routes.js';
import { writeCalendars } from '../../src/project/calendars-store.js';
import { sample } from '../fixtures/sample-project.js';
import { parseERN } from '../../src/core/ern/parse.js';
import { serializeERN } from '../../src/core/ern/serialize.js';

const ONE_PERIOD = [
  '#LEV;Test;TST', '#RUT;-1;7;A - B;;1;', '#SEK;-1;;0;0;0;0', '#CUR;neposcoin;1', '#TRA;A - B',
  '#PER;;;;;;', '#KAL;c1', '#TAB;0;;;;', '#TUR;0;D;0;0;0;0',
  '#TRL;0;NSR:Quay:1;A;34;0;-1;-1;34;-1', '#TRC;0;0700;0;0;0;0;0',
  '#TRL;1;NSR:Quay:2;B;34;0;-1;-1;34;-1', '#TRC;0;0710;0;0;0;0;0',
].join('\r\n') + '\r\n';
const TWO_PERIODS = serializeERN(parseERN(sample.routes[1].text), '20', { delivery: { name: 'Test', codespace: 'TST' }, orgs: sample.orgs });

const press = (/** @type {string} */ key) => document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
const typeKeys = (/** @type {string} */ s) => [...s].forEach(press);
const $ = (/** @type {string} */ id) => /** @type {any} */ (document.getElementById(id));
const chips = () => [...document.querySelectorAll('#cal-bar .cal-chip')].map((c) => c.textContent?.replace('×', '').trim());
const per = () => app.routeState.periods.find((/** @type {any} */ p) => p.id === app.routeState.activePer);

/** @type {any} */
let fs;
let wired = false;
beforeEach(async () => {
  loadAppMarkup();
  initShell();
  setPage('edit');
  initRouteList();
  await initProjectUi({ restoreLast: false });
  if (!wired) { initGrid(); initFootnoteEditor(); wired = true; }
  initRouteEditor();
  window.confirm = vi.fn(() => true);
  fs = createMemoryFs();
  await createProject(fs, { name: 'Test', codespace: 'TST' });
  await writeCalendars(fs, [{ id: 'c1', name: 'Vinter', ranges: [['20260101', '20260630']] }, { id: 'c2', name: 'Sommer', ranges: [['20260701', '20260815']] }]);
  await writeRoute(fs, '7', ONE_PERIOD);
  await writeRoute(fs, '20', TWO_PERIODS);
  await openFs(fs);
  $('check-dlg').close();
});

describe('calendars of a table set', () => {
  it('shows the table set\'s calendars as chips in a row under the tabs, and no period controls', async () => {
    await selectRoute('7');
    const bar = $('cal-bar');
    expect(bar).not.toBeNull();
    expect(!!($('ts-tabs').compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    expect(!!($('kom-bar').compareDocumentPosition($('ts-tabs')) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true); // the line's note is above
    expect(chips()).toEqual(['Vinter']);
    for (const id of ['btn-add-per', 'btn-del-per', 'sel-period', 'per-add-cal', 'rh-save-state']) expect($(id), id).toBeNull();
  });

  it('adds and removes calendars with a multi-choice list', async () => {
    await selectRoute('7');
    $('cal-add').click();
    const box = (/** @type {string} */ id) => /** @type {HTMLInputElement} */ (document.querySelector(`#cal-pop input[value="${id}"]`));
    expect(box('c1').checked).toBe(true);
    expect(box('c2').checked).toBe(false);
    box('c2').checked = true;
    box('c2').dispatchEvent(new Event('change', { bubbles: true }));
    expect(per().calendarIds).toEqual(['c1', 'c2']);
    expect(chips()).toEqual(['Vinter', 'Sommer']);
    expect(document.getElementById('cal-pop')).not.toBeNull(); // stays open for more picks
    box('c1').checked = false;
    box('c1').dispatchEvent(new Event('change', { bubbles: true }));
    expect(per().calendarIds).toEqual(['c2']);
    expect(app.dirty).toBe(true);
  });

  it('removes a calendar with the chip\'s ×', async () => {
    await selectRoute('7');
    /** @type {HTMLElement} */ (document.querySelector('#cal-bar .cal-chip[data-cal="c1"] .cal-chip-x')).click();
    expect(per().calendarIds).toEqual([]);
  });

  it('still lets an older file with several periods in a table set switch between them', async () => {
    await selectRoute('20');
    const sel = $('sel-period');
    expect(sel).not.toBeNull();
    expect(document.getElementById('cal-bar')?.contains(sel)).toBe(true);
  });
});

describe('save state in the footer', () => {
  it('a saved line has a grey "Lagret" button; edits make it "Lagre", say so, and can be discarded', async () => {
    await selectRoute('7');
    expect($('ef-save').disabled).toBe(true);
    expect($('ef-save').textContent).toContain('Lagret');
    expect($('ef-discard').disabled).toBe(true);
    expect($('ef-del-route')).toBeNull();
    typeKeys('0705'); press('Enter');
    expect($('ef-save').disabled).toBe(false);
    expect($('ef-save').textContent).toContain('Lagre');
    expect($('ef-state').textContent).toContain('Ulagrede endringer');
    $('ef-discard').click();
    expect(window.confirm).toHaveBeenCalled();
    expect(app.dirty).toBe(false);
    expect(document.querySelector('[data-r="0"][data-c="0"]')?.textContent).toBe('0700');
  });

  it('saves from the footer', async () => {
    await selectRoute('7');
    typeKeys('0705'); press('Enter');
    $('ef-save').click();
    await flush(); await flush();
    expect(app.dirty).toBe(false);
    expect(await readRoute(fs, '7')).toContain('#TRC;0;0705;');
  });
});

describe('chip row order and the validity timeline', () => {
  it('keeps "+ Kalender" leftmost', async () => {
    await selectRoute('7');
    const bar = $('cal-bar');
    const add = $('cal-add');
    expect(!!(add.compareDocumentPosition(bar.querySelector('.cal-chip')) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });

  it('draws the table set\'s valid days, and the selected column\'s on top', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-03-01T12:00:00'));
    try {
      await selectRoute('7');
      const count = (/** @type {string} */ cls) => document.querySelectorAll(`#cal-timeline .tl-day.${cls}`).length;
      // calendar c1 is 1 Jan – 30 Jun 2026; the window starts 36 days before 1 March: 24 Jan
      expect(count('column')).toBe(158);              // the cursor is in the trip column (day code D)
      expect(document.querySelector('#cal-timeline .tl-now')).not.toBeNull();
      document.querySelector('.g-td-name[data-ri="0"]')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
      expect(count('valid')).toBe(158);               // a stop cell: the table set only
      expect(count('column')).toBe(0);
      expect(document.querySelector('#cal-timeline .tl-before')).not.toBeNull(); // 1–23 Jan are before the window
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('header layout', () => {
  it('puts branding, authority and operator on the right; the private code beside the public code', async () => {
    await selectRoute('7');
    const side = document.querySelector('#route-hdr .rh-side');
    expect(side?.querySelector('#rh-branding')).not.toBeNull();
    expect(side?.querySelector('#rh-orgs')).not.toBeNull();
    const row = $('rh-public').closest('.rh-row');
    expect(row.querySelector('#rh-private')).not.toBeNull();
    expect($('rh-private').closest('.rh-private-box')).not.toBeNull();
  });
});

describe('the note and the grid edges', () => {
  it('puts the line note above the table-set tabs, worded as a note', async () => {
    await selectRoute('7');
    const kom = $('kom-bar');
    expect(!!(kom.compareDocumentPosition($('ts-tabs')) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    expect(kom.textContent).toContain('Legg til merknad');
    expect(kom.textContent).not.toContain('kommentar');
  });

  it('sets the line\'s booking from the line details, beside the note (booking spec 2026-10-22)', async () => {
    await selectRoute('7');
    const btn = /** @type {HTMLElement} */ (document.querySelector('#kom-bar .kom-booking'));
    expect(btn.textContent).toContain('Ingen bestilling');
    btn.click();
    const bk = /** @type {HTMLInputElement} */ (document.querySelector('.bk-kind[value="booking"]'));
    bk.checked = true; bk.dispatchEvent(new Event('change', { bubbles: true }));
    /** @type {HTMLElement} */ (document.querySelector('.bk-access .bk-chip[data-v="public"]')).click();
    /** @type {HTMLElement} */ (document.querySelector('.bk-methods .bk-chip[data-v="callOffice"]')).click();
    const phone = /** @type {HTMLInputElement} */ (document.querySelector('.bk-phone'));
    phone.value = '815';
    const ahead = /** @type {HTMLInputElement} */ (document.querySelector('.bk-mode[value="ahead"]'));
    ahead.checked = true; ahead.dispatchEvent(new Event('change', { bubbles: true }));
    /** @type {HTMLElement} */ (document.querySelector('.bk-dur[data-k="minAhead"] .bk-dur-read')).click();
    const dur = /** @type {HTMLInputElement} */ (document.querySelector('.bk-dur-input'));
    dur.value = '1d';
    dur.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    phone.dispatchEvent(new Event('input', { bubbles: true }));
    /** @type {HTMLElement} */ (document.querySelector('.fb-apply')).click();
    expect(app.routeState.booking).toEqual({ access: 'public', methods: ['callOffice'], phone: '815', minAhead: 'P1D' });
    expect(/** @type {HTMLElement} */ (document.querySelector('#kom-bar .kom-booking')).textContent).toContain('815');
  });

  it('has no extra column: "+ column" sits above the row ×, and the add column and row are tinted', async () => {
    await selectRoute('7');
    const rows = [...document.querySelectorAll('#tbl tr')];
    const cols = app.routeState.grids[`${app.routeState.activePer}:${app.routeState.activeSet}`].cols.length;
    for (const tr of rows) expect(tr.children.length, tr.className).toBe(2 + cols + 1);
    const ins = /** @type {HTMLElement} */ (document.querySelector('#tbl tr.g-row-ins'));
    expect(ins.lastElementChild?.querySelector('.g-ibtn')?.textContent).toBe('+');
    for (const tr of rows) expect(tr.lastElementChild?.classList.contains('g-add'), tr.className).toBe(true);
    expect([...document.querySelectorAll('#tbl tr.g-row-bot > td')].every((td) => td.classList.contains('g-add'))).toBe(true);
  });
});

describe('branding chip', () => {
  it('shows a faded "Merkevare" caption before the choice, like the organisation chips', async () => {
    await selectRoute('7');
    const chip = $('rh-branding').closest('.rh-brand-chip');
    expect(chip).not.toBeNull();
    expect(chip.querySelector('.org-pick-role')?.textContent).toBe('Merkevare');
  });
});

describe('private code caption', () => {
  it('says "privat kode", not just "privat"', async () => {
    await selectRoute('7');
    expect(document.querySelector('.rh-private-cap')?.textContent).toBe('privat kode');
  });
});
