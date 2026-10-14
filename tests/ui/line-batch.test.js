// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadAppMarkup } from './dom-setup.js';
import { app } from '../../src/ui/state.js';
import { initShell } from '../../src/ui/shell.js';
import { initRouteList } from '../../src/ui/route-list.js';
import { initProjectUi, openFs } from '../../src/ui/project-ui.js';
import { initGrid } from '../../src/ui/grid.js';
import { initFootnoteEditor } from '../../src/ui/footnote-editor.js';
import { initRouteEditor, selectRoute, saveRoutes } from '../../src/ui/route-editor.js';
import { editLines, setOrg, duplicateLines, deleteLines } from '../../src/ui/line-batch.js';
import { unsavedCodes } from '../../src/ui/drafts.js';
import { createMemoryFs } from '../../src/project/fs.js';
import { createProject } from '../../src/project/create.js';
import { writeRoute, readRoute } from '../../src/project/routes.js';
import { parseERN } from '../../src/core/ern/parse.js';

const route = (/** @type {string} */ code, extra = '') => [
  '#LEV;Test;TST', `#RUT;-1;${code};Linje ${code};;1;`, extra,
  '#SEK;NOG:Operator:bbbbbbbbbb2;B;0;1;0;0', '#CUR;neposcoin;1', '#TRA;A - B', '#UID;aaaaaaaa-0000-4000-8000-0000000000a1',
  '#PER;;;;;;', '#KAL;cal-1', '#TAB;0;;;;', '#TUR;0;D;0;0;0;0', '#UID;5f0c2e1a-1111-4aaa-8bbb-000000000001',
  '#TRL;0;NSR:Quay:1;A;34;0;-1;-1;34;-1', '#TRC;0;0700;0;0;0;0;0',
  '#TRL;1;NSR:Quay:2;B;34;0;-1;-1;34;-1', '#TRC;0;0710;0;0;0;0;0',
].filter(Boolean).join('\r\n') + '\r\n';
const company = { organisationId: '9', companyNumber: '', name: 'Ny Buss AS', legalName: '', tradingName: '', authority: null,
  operator: { id: 'NOG:Operator:ccccccccc3', version: '1', contact: { email: '', phone: '', url: '' } } };

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
  await writeRoute(fs, '20', route('20'));
  await writeRoute(fs, '21', route('21'));
  await writeRoute(fs, '22', route('22', '#MOD;nope;nope'));
  await openFs(fs);
  /** @type {any} */ (document.getElementById('check-dlg')).close();
});

describe('batch edits on lines', () => {
  it('edits the open line and a saved line; both stay unsaved until saved', async () => {
    await selectRoute('20');
    const { edited, skipped } = editLines(['20', '21', '22'], (rs) => setOrg(rs, 'operator', company));
    expect(edited).toEqual(['20', '21']);
    expect(skipped).toEqual(['22']);
    expect(unsavedCodes().sort()).toEqual(['20', '21']);
    expect(await readRoute(fs, '21')).not.toContain('ccccccccc3');
    await saveRoutes(['20', '21']);
    expect(await readRoute(fs, '20')).toContain('#SEK;NOG:Operator:ccccccccc3');
    expect(await readRoute(fs, '21')).toContain('#SEK;NOG:Operator:ccccccccc3');
    expect(unsavedCodes()).toEqual([]);
    expect(app.orgs.some((c) => c.name === 'Ny Buss AS')).toBe(true);
  });

  it('redraws after a batch on the open line that was already unsaved (review I3)', async () => {
    await selectRoute('20');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '0', bubbles: true }));
    for (const k of '701') document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(app.dirty).toBe(true);
    editLines(['20'], (rs) => { rs.exported = false; });
    expect(document.querySelector('.route-item.active')?.classList.contains('rl-not-exported')).toBe(true);
  });

  it('duplicates a line with new IDs and leaves the original alone', async () => {
    const before = await readRoute(fs, '20');
    const [copy] = await duplicateLines(['20']);
    expect(copy).not.toBe('20');
    const a = parseERN(/** @type {string} */ (before)), b = parseERN(/** @type {string} */ (await readRoute(fs, copy)));
    expect(b.routeName).toBe('Linje 20 (kopi)');
    expect(b.tableSets[0].uid).not.toBe(a.tableSets[0].uid);
    const cols = (/** @type {any} */ rs) => Object.values(rs.grids).flatMap((/** @type {any} */ g) => g.cols.map((/** @type {any} */ c) => c.uid));
    expect(cols(b).some((u) => cols(a).includes(u))).toBe(false);
    expect(await readRoute(fs, '20')).toBe(before);
    expect(app.routes.some((r) => r.code === copy)).toBe(true);
  });

  it('deletes lines after asking, with their unsaved edits', async () => {
    await selectRoute('20');
    editLines(['21'], (rs) => { rs.routeName = 'x'; });
    await deleteLines(['20', '21']);
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(app.routes.map((r) => r.code)).toEqual(['22']);
    expect(app.drafts.size).toBe(0);
    expect(app.activeRoute).toBeNull();
    expect(await readRoute(fs, '21')).toBeNull();
  });
});
