// @vitest-environment jsdom
// Saving a line never removes links (user 2026-10-31): a link no trip uses is kept until the user removes it in Ruting,
// so fixing a typo in the timetable brings the same valid link back.
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
import { writeRoute } from '../../src/project/routes.js';
import { writeOrgs } from '../../src/project/orgs-store.js';
import { writeLineLinks } from '../../src/project/links-store.js';
import { sample } from '../fixtures/sample-project.js';
import { projectCopy } from '../fixtures/orgs.js';
import { parseERN } from '../../src/core/ern/parse.js';
import { serializeERN } from '../../src/core/ern/serialize.js';

const press = (/** @type {string} */ key, opts = {}) => document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...opts }));
const route20 = serializeERN(parseERN(sample.routes[1].text), '20', { delivery: { name: 'Test', codespace: 'TST' }, orgs: sample.orgs });
// Line 20 (a bus) runs 104 → 105
const link = { polyline: 'x', distanceM: 1000, status: 'OK', from: [5, 61], to: [5.1, 61] };
const USED = '104|105|bus', UNUSED = '104|999|bus';

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
  fs = createMemoryFs();
  await createProject(fs, { name: 'Test', codespace: 'TST' });
  await writeOrgs(fs, projectCopy());
  await writeRoute(fs, '20', route20);
});

/** Open line 20 with this links file, change a time and save. @param {Record<string, any>} links */
async function editAndSave(links) {
  await writeLineLinks(fs, '20', { version: 1, line: '20', links, snaps: Object.fromEntries(Object.keys(links).flatMap((k) => k.split('|').slice(0, 2)).map((id) => [id, /** @type {any} */ ({})])) });
  await openFs(fs);
  /** @type {any} */ (document.getElementById('check-dlg')).close();
  await selectRoute('20');
  for (const k of '0800') press(k);
  press('Enter');
  /** @type {HTMLElement} */ (document.getElementById('ef-save')).click();
  await flush();
}

const backups = async () => (await fs.list('data/backups')).filter((/** @type {any} */ e) => e.name.startsWith('links-20.')).length;

describe('line save and the links file', () => {
  it('keeps a link no trip uses: the links file is not written', async () => {
    await editAndSave({ [USED]: link, [UNUSED]: link });
    expect(Object.keys(JSON.parse(await readText(fs, 'data/links/20.json')).links)).toEqual([USED, UNUSED]);
    expect(Object.keys(app.lineLinks.get('20')?.links ?? {})).toEqual([USED, UNUSED]);
    expect(await backups()).toBe(0);
  });
});
