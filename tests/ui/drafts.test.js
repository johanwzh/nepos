// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadAppMarkup, flush } from './dom-setup.js';
import { app } from '../../src/ui/state.js';
import { initShell, beforeLeave } from '../../src/ui/shell.js';
import { initRouteList } from '../../src/ui/route-list.js';
import { initProjectUi, openFs } from '../../src/ui/project-ui.js';
import { initGrid } from '../../src/ui/grid.js';
import { initFootnoteEditor } from '../../src/ui/footnote-editor.js';
import { initRouteEditor, selectRoute, saveAllRoutes, discardAllChanges, newRoute } from '../../src/ui/route-editor.js';
import { initCalendarReplace, openCalendarReplace } from '../../src/ui/calendar-replace-ui.js';
import { createMemoryFs } from '../../src/project/fs.js';
import { createProject } from '../../src/project/create.js';
import { writeRoute, readRoute } from '../../src/project/routes.js';
import { sample, CAL_SOMMER } from '../fixtures/sample-project.js';
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
  initRouteList();
  await initProjectUi({ restoreLast: false });
  if (!wired) { initGrid(); initFootnoteEditor(); wired = true; }
  initRouteEditor();
  initCalendarReplace();
  window.confirm = vi.fn(() => true);
  fs = createMemoryFs();
  await createProject(fs, { name: 'Test', codespace: 'TST' });
  await writeRoute(fs, '20', route20);
  await writeRoute(fs, '21', route20);
  await openFs(fs);
  /** @type {any} */ (document.getElementById('check-dlg')).close();
});

describe('unsaved edits per line (review fixes)', () => {
  it('replaces a calendar in a parked draft too, so saving it later keeps the new calendar (review I2)', async () => {
    await selectRoute('20');
    typeKeys('0811'); press('Enter');           // line 20 now has a draft
    await selectRoute('21');
    app.calendars = [{ id: CAL_SOMMER, name: 'Sommer', ranges: [] }, { id: 'NEW-CAL', name: 'Ny', ranges: [] }];
    openCalendarReplace(CAL_SOMMER);
    /** @type {HTMLSelectElement} */ (document.getElementById('cal-replace-to')).value = 'NEW-CAL';
    document.getElementById('cal-replace-ok')?.click();
    await flush(); await flush();
    await saveAllRoutes();
    const saved = /** @type {string} */ (await readRoute(fs, '20'));
    expect(saved).toContain('NEW-CAL');
    expect(saved).not.toContain(CAL_SOMMER);
  });

  it('creates a new line without asking and keeps the open line’s edits (review I4)', async () => {
    window.confirm = vi.fn(() => false);
    await selectRoute('20');
    typeKeys('0811'); press('Enter');
    await newRoute();
    expect(window.confirm).not.toHaveBeenCalled();
    expect(app.routes).toHaveLength(3);
    expect(app.drafts.has('20')).toBe(true);
  });
});

describe('unsaved edits per line', () => {
  it('keeps unsaved edits with their line when another line is opened, without asking', async () => {
    window.confirm = vi.fn(() => true);
    await selectRoute('20');
    typeKeys('0811'); press('Enter');           // edit line 20
    await selectRoute('21');
    expect(window.confirm).not.toHaveBeenCalled();
    expect(document.querySelector('.route-item.active ~ * .rl-unsaved, .rl-unsaved')).not.toBe(null);
    await selectRoute('20');
    expect(cellTime(0, 0)).toBe('0811');
    expect(app.dirty).toBe(true);
  });

  it('saves the right edits for each line', async () => {
    await selectRoute('20');
    typeKeys('0811'); press('Enter');
    await selectRoute('21');
    typeKeys('0922'); press('Enter');
    await saveAllRoutes();
    expect(await readRoute(fs, '20')).toContain('#TRC;0;0811;');
    expect(await readRoute(fs, '21')).toContain('#TRC;0;0922;');
    expect(app.drafts.size).toBe(0);
    expect(app.dirty).toBe(false);
  });

  it('discards all changes, also a half-typed cell, after asking', async () => {
    window.confirm = vi.fn(() => true);
    await selectRoute('20');
    typeKeys('0811'); press('Enter');
    await selectRoute('21');
    typeKeys('09');                              // half-typed, not committed
    discardAllChanges();
    expect(app.drafts.size).toBe(0);
    expect(app.dirty).toBe(false);
    expect(cellTime(0, 0)).toBe('0700');
  });

  it('asks to save all before closing the project, and stays on Cancel', async () => {
    await selectRoute('20');
    typeKeys('0811'); press('Enter');
    window.confirm = vi.fn(() => false);
    expect(await beforeLeave()).toBe(false);
    window.confirm = vi.fn(() => true);
    expect(await beforeLeave()).toBe(true);
    expect(await readRoute(fs, '20')).toContain('#TRC;0;0811;');
  });

});
