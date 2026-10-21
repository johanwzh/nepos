// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadAppMarkup, flush } from './dom-setup.js';
import { app } from '../../src/ui/state.js';
import { initShell, setPage } from '../../src/ui/shell.js';
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
import { writeCalendars } from '../../src/project/calendars-store.js';
import { projectCopy, registerCompanies } from '../fixtures/orgs.js';

/** @param {string} secondStopId */
const route = (secondStopId) => [
  '#LEV;Test;TST', '#RUT;-1;50;Jernbanetorget - Oslo bussterminal;;1;',
  '#SEK;NOG:Authority:aaaaaaaaaa1;Eksempel fylkeskommune;1;0;0;0', '#SEK;NOG:Operator:bbbbbbbbbb2;Eksempel Buss AS;0;1;0;0', '#CUR;neposcoin;1', '#DST;1;Oslo;', '#TRA;Tur',
  '#PER;;;;;;', '#KAL;cal-vinter', '#TAB;0;;;;', '#TUR;0;DX67;0;0;0;0',
  '#TRL;0;NSR:Quay:7203;Jernbanetorget;34;0;-1;-1;34;-1', '#TRC;0;0700;0;0;0;0;0',
  `#TRL;1;${secondStopId};Oslo bussterminal;34;0;-1;-1;34;-1`, '#TRC;0;0710;0;0;0;0;0', '#DSK;0;0;;1',
].join('\r\n') + '\r\n';

let lookupPositions = false;
const bus = (/** @type {string} */ id) => ({ quayId: id, publicCode: 'A', stopPlaceId: 'NSR:StopPlace:1', stopPlaceName: 'X', mode: 'bus', lat: lookupPositions ? 59.91 + (id.length % 7) * 0.001 : 0, lon: lookupPositions ? 10.75 : 0 });
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
  await writeOrgs(fs, projectCopy().map((c, n) => ({ ...c, authority: c.authority && { ...c.authority, alias: `TST:Authority:${n + 1}` }, operator: c.operator && { ...c.operator, alias: `TST:Operator:${n + 1}` } })));
  await writeCalendars(fs, [{ id: 'cal-vinter', name: 'Vinter', ranges: [['20260101', '20260630']] }]);
  await writeRoute(fs, '50', text);
  await openFs(fs);
  app.orgRegister = { companies: registerCompanies(), fetchedAt: '2026-10-14T12:00:00Z' };
  /** @type {any} */ (document.getElementById('check-dlg')).close();
  await settle();
}

beforeEach(async () => {
  loadAppMarkup();
  initShell();
  setPage('edit'); // the view is module state: start every test on the edit page
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
  it('shows the live check as soon as the page opens, with no validate button', async () => {
    await openProjectWith(route('NSR:Quay:11972'));
    setPage('export');
    await settle();
    expect(document.getElementById('btn-validate')).toBeNull();
    // Routing is off for now (core/features.js): no 'link not routed yet' warning, so the line checks clean
    expect(document.getElementById('val-results').textContent).toContain('Ingen problemer funnet');
    expect(document.getElementById('val-results').textContent).not.toContain('ikke rutet ennå');
    expect(/** @type {HTMLElement} */ (document.getElementById('btn-route-links')).hidden).toBe(true);
  });

  it('does not run the project check while another page is shown (review I5)', async () => {
    await openProjectWith(route('NSR:Quay:11972'));
    expect(document.getElementById('val-results').textContent).toBe('');
  });

  it('looks the Quays up again when the page opens', async () => {
    await openProjectWith(route('NSR:Quay:11972'));
    const before = lookups;
    setPage('export');
    await settle();
    expect(lookups).toBe(before + 1);
    setPage('edit');
  });

  it('shows unsaved changes in the live check', async () => {
    await openProjectWith(route('NSR:Quay:11972'));
    await selectRoute('50');
    app.routeState.periods[0].calendarIds = [];
    setPage('export');
    await settle();
    expect(document.getElementById('val-results').textContent).toContain('kalender');
    setPage('edit');
  });

  it('lists the errors and refuses to export', async () => {
    await openProjectWith(route('104')); // an old numeric stop ID
    await click('btn-netex');
    expect(document.getElementById('val-results').textContent).toContain('Oslo bussterminal (104)');
    expect(document.getElementById('export-status').textContent).toContain('feilene');
    expect(await fs.list('exports')).toEqual([]);
  });

  it('leaves a line that is not exported out, also when it has errors', async () => {
    await openProjectWith(route('NSR:Quay:11972'));
    await writeRoute(fs, '51', route('104').replace('#RUT;-1;50;', '#RUT;-1;51;').replace('#CUR;', '#EKS;0\r\n#CUR;'));
    /** @type {HTMLInputElement} */ (document.getElementById('chk-zip')).checked = false;
    document.getElementById('chk-zip')?.dispatchEvent(new Event('change'));
    await click('btn-netex');
    expect(document.getElementById('export-status').textContent).not.toContain('feilene');
    const [dir] = await fs.list('exports');
    expect(await fs.list(`exports/${dir.name}`)).toHaveLength(2); // shared + line 50 only
  });

  it('leaves out a damaged line that is not exported (user 2026-10-18)', async () => {
    await openProjectWith(route('NSR:Quay:11972'));
    // #KOS is not a record Nepos knows: the line is damaged, and set to "Eksporteres: nei"
    await writeRoute(fs, '51', route('NSR:Quay:11972').replace('#RUT;-1;50;', '#RUT;-1;51;').replace('#CUR;', '#EKS;0\r\n#KOS;4;x;0\r\n#CUR;'));
    /** @type {HTMLInputElement} */ (document.getElementById('chk-zip')).checked = false;
    document.getElementById('chk-zip')?.dispatchEvent(new Event('change'));
    await click('btn-netex');
    expect(document.getElementById('export-status').textContent).not.toContain('feilene');
    const [dir] = await fs.list('exports');
    expect(await fs.list(`exports/${dir.name}`)).toHaveLength(2); // shared + line 50 only
  });

  it('writes a ZIP into the project folder', async () => {
    await openProjectWith(route('NSR:Quay:11972'));
    await click('btn-netex');
    const [dir] = await fs.list('exports');
    expect((await fs.list(`exports/${dir.name}`)).map((/** @type {any} */ e) => e.name)).toEqual([`TST_${dir.name}.zip`]);
    expect(document.getElementById('export-status').textContent).toContain(`exports\\${dir.name}\\TST_${dir.name}.zip`);
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
    await click('btn-netex');
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

  it('stores the organisation export mode in the project file', async () => {
    const nog = /** @type {HTMLInputElement} */ (document.getElementById('org-mode-nog'));
    expect(/** @type {HTMLInputElement} */ (document.getElementById('org-mode-codespace')).checked).toBe(true);
    nog.checked = true;
    nog.dispatchEvent(new Event('change'));
    await flush();
    expect(JSON.parse(await readText(fs, 'data/nepos-project.json')).orgExportMode).toBe('nog');
    expect(app.meta.orgExportMode).toBe('nog');
  });
});

describe('finding the export (user 2026-10-19)', () => {
  it('says where the export is, starting from the project folder, with no copy button', async () => {
    await openProjectWith(route('NSR:Quay:11972'));
    await click('btn-netex');
    const [dir] = await fs.list('exports');
    expect(document.getElementById('export-copy-path')).toBeNull();
    expect(document.getElementById('export-status')?.textContent).toContain(`\\exports\\${dir.name}\\TST_${dir.name}.zip`);
  });
});

describe('"Rut manglende strekninger" (2.3)', () => {
  it('routes the exported lines\' missing links, says how many, and checks again', async () => {
    const { initLinkRouter } = await import('../../src/ui/link-router.js');
    const asked = [];
    initLinkRouter({ engine: /** @type {any} */ ({ tilesUsed: () => 0, shapeLink: async (/** @type {any} */ from, /** @type {any} */ to, /** @type {any} */ profile) => {
      asked.push(`${from.quayId}|${to.quayId}`);
      return { key: `${from.quayId}|${to.quayId}|${profile}`, status: 'OK', from, to, profile, coordinates: [[from.lon, from.lat], [to.lon, to.lat]], distanceM: 500, arriveBearing: 0, warnings: [], source: 's', engine: 1 };
    } }), restMs: 100000 });
    lookupPositions = true;
    await openProjectWith(route('NSR:Quay:11972'));
    setPage('export');
    await settle();
    await click('btn-route-links');
    expect(asked).toEqual(['NSR:Quay:7203|NSR:Quay:11972']);
    expect(document.getElementById('export-status')?.textContent).toContain('1 strekninger rutet');
    expect(app.shapes.get('NSR:Quay:7203|NSR:Quay:11972|bus')?.status).toBe('OK');
    lookupPositions = false;
    setPage('edit');
  });
});

describe('the problems, grouped (user 2026-10-21)', () => {
  it('shows one row per kind per line, with a count, that opens to the single problems', async () => {
    // Three trips, none with a destination: three "no destination" errors on line 50
    const text = route('NSR:Quay:11972').replace('#TUR;0;DX67;0;0;0;0', '#TUR;0;DX67;0;0;0;0\r\n#TUR;1;DX67;0;0;0;0\r\n#TUR;2;DX67;0;0;0;0')
      .replace('#TRC;0;0700;0;0;0;0;0', '#TRC;0;0700;0;0;0;0;0\r\n#TRC;1;0800;0;0;0;0;0\r\n#TRC;2;0900;0;0;0;0;0')
      .replace('#TRC;0;0710;0;0;0;0;0', '#TRC;0;0710;0;0;0;0;0\r\n#TRC;1;0810;0;0;0;0;0\r\n#TRC;2;0910;0;0;0;0;0')
      .replace('#DSK;0;0;;1\r\n', '');
    await openProjectWith(text);
    setPage('export');
    await settle();
    const results = /** @type {HTMLElement} */ (document.getElementById('val-results'));
    const groups = [...results.querySelectorAll('details.n2-group')];
    expect(groups).toHaveLength(1);
    expect(groups[0].querySelector('summary')?.textContent).toContain('×3');
    expect(groups[0].querySelectorAll(':scope > div.n2-issue')).toHaveLength(3);
  });
});

describe('the export is remembered (user 2026-10-21)', () => {
  it('a finished export records each exported line in data/exports.json', async () => {
    await openProjectWith(route('NSR:Quay:11972'));
    await click('btn-netex');
    const records = JSON.parse(/** @type {string} */ (await readText(fs, 'data/exports.json'))).lines;
    expect(Object.keys(records)).toEqual(['50']);
    expect(records['50'].hash).toMatch(/^[0-9a-f]{8}$/);
    expect(app.exports['50']).toEqual(records['50']);
  });

  it('a refused export records nothing', async () => {
    await openProjectWith(route('104'));
    await click('btn-netex');
    expect(await readText(fs, 'data/exports.json')).toBeNull();
  });
});
