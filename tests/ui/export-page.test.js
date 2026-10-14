// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadAppMarkup, flush } from './dom-setup.js';
import { app } from '../../src/ui/state.js';
import { initShell } from '../../src/ui/shell.js';
import { initRouteList } from '../../src/ui/route-list.js';
import { initProjectUi, openFs } from '../../src/ui/project-ui.js';
import { initGrid } from '../../src/ui/grid.js';
import { initFootnoteEditor } from '../../src/ui/footnote-editor.js';
import { initRouteEditor, selectRoute } from '../../src/ui/route-editor.js';
import { initExportPage } from '../../src/ui/export-page.js';
import { setQuayLookup } from '../../src/ui/quays.js';
import { createMemoryFs, readText } from '../../src/project/fs.js';
import { createProject } from '../../src/project/create.js';
import { writeRoute } from '../../src/project/routes.js';
import { writeOrgs } from '../../src/project/orgs-store.js';

/** @param {string} secondStopId */
const route = (secondStopId) => [
  '#LEV;Test;TST', '#RUT;-1;50;Jernbanetorget - Oslo bussterminal;;1;',
  '#SEK;TST:Authority:1;Fylket;1;0;0;0', '#SEK;TST:Operator:1;Buss AS;0;1;0;0', '#CUR;neposcoin;1', '#TRA;50',
  '#PER;Vinter;20260101;20260630;;;', '#TAB;0;;;;', '#TUR;0;DX67;0;0;0;0',
  '#TRL;0;NSR:Quay:7203;Jernbanetorget;34;0;-1;-1;34;-1', '#TRC;0;0700;0;0;0;0;0',
  `#TRL;1;${secondStopId};Oslo bussterminal;34;0;-1;-1;34;-1`, '#TRC;0;0710;0;0;0;0;0',
].join('\r\n') + '\r\n';

const bus = (/** @type {string} */ id) => ({ quayId: id, publicCode: 'A', stopPlaceId: 'NSR:StopPlace:1', stopPlaceName: 'X', mode: 'bus', lat: 0, lon: 0 });
let lookups = 0;
const lookup = async (/** @type {string[]} */ ids) => { lookups++; return new Map(ids.map((id) => [id, bus(id)])); };
const press = (/** @type {string} */ key) => document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
const settle = async () => { for (let i = 0; i < 8; i++) await flush(); };
const click = async (/** @type {string} */ id) => { document.getElementById(id).click(); await settle(); };

/** @type {any} */
let fs;
let wired = false;

/** @param {string} text */
async function openProjectWith(text) {
  setQuayLookup(lookup);
  fs = createMemoryFs();
  await createProject(fs, { name: 'Test', codespace: 'TST' });
  await writeOrgs(fs, [{ id: 'TST:Authority:1', name: 'Fylket' }, { id: 'TST:Operator:1', name: 'Buss AS' }]);
  await writeRoute(fs, '50', text);
  await openFs(fs);
  /** @type {any} */ (document.getElementById('check-dlg')).close();
  await settle();
}

beforeEach(async () => {
  loadAppMarkup();
  initShell();
  initRouteList();
  await initProjectUi({ restoreLast: false });
  initGrid();
  if (!wired) { initFootnoteEditor(); wired = true; }
  initRouteEditor();
  initExportPage();
  window.confirm = vi.fn(() => true);
  window.prompt = vi.fn(() => null);
  lookups = 0;
});

describe('export page', () => {
  it('reports a clean project', async () => {
    await openProjectWith(route('NSR:Quay:11972'));
    await click('btn-validate');
    expect(document.getElementById('val-results').textContent).toContain('Ingen problemer');
  });

  it('looks the Quays up again before checking', async () => {
    await openProjectWith(route('NSR:Quay:11972'));
    const before = lookups;
    await click('btn-validate');
    expect(lookups).toBe(before + 1);
  });

  it('lists the errors and refuses to export', async () => {
    await openProjectWith(route('104')); // an old numeric stop ID
    await click('btn-netex');
    expect(document.getElementById('val-results').textContent).toContain('Oslo bussterminal (104)');
    expect(document.getElementById('export-status').textContent).toContain('feilene');
    expect(await fs.list('exports')).toEqual([]);
  });

  it('writes a ZIP into the project folder', async () => {
    await openProjectWith(route('NSR:Quay:11972'));
    await click('btn-netex');
    const [dir] = await fs.list('exports');
    expect((await fs.list(`exports/${dir.name}`)).map((/** @type {any} */ e) => e.name)).toEqual(['TST.zip']);
    expect(document.getElementById('export-status').textContent).toContain(`exports/${dir.name}/TST.zip`);
  });

  it('writes loose files when ZIP is switched off, and remembers the choice', async () => {
    await openProjectWith(route('NSR:Quay:11972'));
    const zip = /** @type {HTMLInputElement} */ (document.getElementById('chk-zip'));
    expect(zip.checked).toBe(true);
    zip.checked = false;
    zip.dispatchEvent(new Event('change'));
    await settle();
    expect(JSON.parse(await readText(fs, 'private/settings.json')).exportAsZip).toBe(false);
    await click('btn-netex');
    const [dir] = await fs.list('exports');
    expect((await fs.list(`exports/${dir.name}`)).map((/** @type {any} */ e) => e.name)).toEqual(['TST-Line-50.xml', '_TST-shared.xml']);
  });

  it('asks to save unsaved changes first, and Cancel stops the export', async () => {
    await openProjectWith(route('NSR:Quay:11972'));
    await selectRoute('50');
    for (const k of '0705') press(k);
    press('Enter');
    window.confirm = vi.fn(() => false);
    await click('btn-netex');
    expect(window.confirm).toHaveBeenCalled();
    expect(app.dirty).toBe(true);
    expect(await fs.list('exports')).toEqual([]);
  });

  it('saves the open route before exporting when the user agrees', async () => {
    await openProjectWith(route('NSR:Quay:11972'));
    await selectRoute('50');
    for (const k of '0705') press(k);
    press('Enter');
    window.confirm = vi.fn(() => true);
    await click('btn-netex');
    expect(app.dirty).toBe(false);
    expect(await readText(fs, 'data/routes/50.txt')).toContain('#TRC;0;0705;');
    expect((await fs.list('exports')).length).toBe(1);
  });

  it('runs only one export at a time', async () => {
    await openProjectWith(route('NSR:Quay:11972'));
    const write = fs.writeBytes;
    /** @type {string[]} */
    const written = [];
    fs.writeBytes = async (/** @type {string} */ path, /** @type {Uint8Array} */ bytes) => { if (path.startsWith('exports/')) written.push(path); return write(path, bytes); };
    document.getElementById('btn-netex').click();
    document.getElementById('btn-netex').click();
    await settle();
    expect(written).toHaveLength(1);
  });

  it('checks the route files as they are on disk now', async () => {
    await openProjectWith(route('NSR:Quay:11972'));
    await writeRoute(fs, '50', route('104')); // changed outside Nepos after the project was opened
    await click('btn-validate');
    const text = document.getElementById('val-results').textContent;
    expect(text).toContain('Oslo bussterminal (104)');
    expect(text).toContain('endret utenfor Nepos');
  });

  it('says so when the project folder cannot be read', async () => {
    await openProjectWith(route('NSR:Quay:11972'));
    fs.list = async () => { throw new Error('folder gone'); };
    await click('btn-netex');
    expect(document.getElementById('msg-text').textContent).toContain('folder gone');
  });

  it('stops when another project is opened during the check', async () => {
    await openProjectWith(route('NSR:Quay:11972'));
    const first = fs;
    let release = () => {};
    setQuayLookup((ids) => new Promise((resolve) => { release = () => resolve(new Map(ids.map((id) => [id, bus(id)]))); }));
    document.getElementById('btn-netex').click();
    await settle();
    await openProjectWith(route('NSR:Quay:11972')); // a different project folder
    release();
    await settle();
    expect(await first.list('exports')).toEqual([]);
    expect(await fs.list('exports')).toEqual([]);
  });
});
