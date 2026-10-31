// @vitest-environment jsdom
// Analyse (spec 2026-10-31): Oversikt's second sub-page — a tree of project → authority → operator and, for the node
// picked, the receipt. Missing data is a grey Ukjent row counted in the sum; exports to Excel and text.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadAppMarkup, flush } from './dom-setup.js';
import { app } from '../../src/ui/state.js';
import { initShell, setPage } from '../../src/ui/shell.js';
import { initProjectUi, openFs } from '../../src/ui/project-ui.js';
import { initGrid } from '../../src/ui/grid.js';
import { initFootnoteEditor } from '../../src/ui/footnote-editor.js';
import { initRouteEditor } from '../../src/ui/route-editor.js';
import { initDashboardPage } from '../../src/ui/dashboard-page.js';
import { initAnalysisPage } from '../../src/ui/analysis-page.js';
import { setQuayLookup } from '../../src/ui/quays.js';
import { createMemoryFs } from '../../src/project/fs.js';
import { createProject } from '../../src/project/create.js';
import { writeRoute } from '../../src/project/routes.js';
import { writeCalendars } from '../../src/project/calendars-store.js';
import { writeOrgs } from '../../src/project/orgs-store.js';
import { projectCopy, registerCompanies } from '../fixtures/orgs.js';

const day = (/** @type {number} */ n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; };
/** A bus line A–B; `sek` false: no authority or operator (an Ukjent node). */
const route = (/** @type {string} */ code, sek = true, mode = '1') => [
  '#LEV;Test;TST', `#RUT;-1;${code};A - B;;${mode};`, ...(sek ? ['#SEK;NOG:Authority:aaaaaaaaaa1;F;1;0;0;0', '#SEK;NOG:Operator:bbbbbbbbbb2;B;0;1;0;0'] : []), '#DST;1;B;', '#TRA;A - B',
  '#PER;;;;;;', '#KAL;cal-1', '#TAB;0;;;;', '#TUR;0;D;0;0;0;0', '#UID;5f0c2e1a-1111-4aaa-8bbb-00000000000a',
  '#TRL;0;NSR:Quay:1;A;34;0;-1;-1;34;-1', '#TRC;0;0700;0;0;0;0;0', '#TRL;1;NSR:Quay:2;B;34;0;-1;-1;34;-1', '#TRC;0;0710;0;0;0;0;0', '#DSK;0;0;;1',
].join('\r\n') + '\r\n';
const settle = async () => { for (let i = 0; i < 8; i++) await flush(); };
const page = () => /** @type {HTMLElement} */ (document.getElementById('home-analyse'));
const click = (/** @type {Element | null} */ el) => /** @type {HTMLElement} */ (el).dispatchEvent(new MouseEvent('click', { bubbles: true }));
/** @type {any} */
let fs;

async function open(/** @type {Record<string, string>} */ lines) {
  setQuayLookup(async (ids) => new Map(ids.map((id, n) => [id, { quayId: id, publicCode: '', stopPlaceId: `NSR:StopPlace:${n}`, stopPlaceName: id, mode: 'bus', lat: 60 + n * 0.01, lon: 10 }])));
  fs = createMemoryFs();
  await createProject(fs, { name: 'Test', codespace: 'TST' });
  await writeCalendars(fs, [{ id: 'cal-1', name: 'Høst', ranges: [[day(-5), day(4)]] }]);
  await writeOrgs(fs, projectCopy().map((c, n) => ({ ...c, authority: c.authority && { ...c.authority, alias: `TST:Authority:${n + 1}` }, operator: c.operator && { ...c.operator, alias: `TST:Operator:${n + 1}` } })));
  for (const [code, text] of Object.entries(lines)) await writeRoute(fs, code, text);
  await openFs(fs, { landing: true });
  app.orgRegister = { companies: registerCompanies(), fetchedAt: new Date().toISOString() };
  setPage('lines'); setPage('home');
  /** @type {any} */ (document.getElementById('check-dlg')).close();
  await settle();
}
/** Analyse, at the whole project (the page keeps the node picked earlier in the session). */
const toAnalyse = async () => { click(document.querySelector('#home-tabs [data-sub="analyse"]')); await settle(); const top = page().querySelector('.an-node[data-node="project"]'); if (top) { click(top); await settle(); } };
const tableAfter = (/** @type {string} */ head) => /** @type {HTMLElement} */ ([...page().querySelectorAll('.an-block')].find((b) => b.querySelector('h4')?.textContent?.startsWith(head)));

let wired = false;
beforeEach(async () => {
  try { localStorage.removeItem('nepos.analyse'); } catch { /* none */ }
  loadAppMarkup();
  initShell();
  setPage('edit');
  await initProjectUi({ restoreLast: false });
  if (!wired) { initGrid(); initFootnoteEditor(); wired = true; }
  initRouteEditor();
  initDashboardPage();
  initAnalysisPage();
});

describe('Analyse', () => {
  it('Oversikt opens on Gjøremål; Analyse shows the tree with the project, its authority and operator, and line counts', async () => {
    await open({ 50: route('50'), 60: route('60') });
    expect(page().hidden).toBe(true);
    expect(/** @type {HTMLElement} */ (document.getElementById('home-body')).hidden).toBe(false);
    await toAnalyse();
    expect(page().hidden).toBe(false);
    expect(/** @type {HTMLElement} */ (document.getElementById('home-body')).hidden).toBe(true);
    const nodes = [...page().querySelectorAll('.an-node')].map((n) => [/** @type {HTMLElement} */ (n).dataset.node?.split(':')[0], n.querySelector('.an-n')?.textContent]);
    expect(nodes).toEqual([['project', '2'], ['authority', '2'], ['authority', '2']]);
    expect(tableAfter('Omfang').querySelector('tr.an-sum')?.textContent).toContain('2');
  });

  it('picking an operator shows the same blocks, and block 8 lists its lines instead of operators', async () => {
    await open({ 50: route('50'), 60: route('60') });
    await toAnalyse();
    const blocksAt = () => [...page().querySelectorAll('.an-block h4 > span:first-child')].map((h) => h.textContent);
    const before = blocksAt();
    click(page().querySelectorAll('.an-node')[2]);
    await settle();
    expect(blocksAt().slice(0, -1)).toEqual(before.slice(0, -1));
    const kids = [...tableAfter('Under').querySelectorAll('tr:not(.an-sum) td:first-child')].map((td) => td.textContent?.trim());
    expect(kids.length).toBe(2);
    expect(kids.every((k) => !k?.includes('▸'))).toBe(true); // lines are leaves
  });

  it('Ukjent rows are grey (class an-unk) and counted in the Sum row', async () => {
    await open({ 50: route('50'), 70: route('70', false, '0') });
    await toAnalyse();
    const scope = tableAfter('Omfang');
    const unk = /** @type {HTMLElement} */ (scope.querySelector('tr.an-unk'));
    expect(unk.textContent).toContain('Ukjent');
    const deps = (/** @type {Element} */ tr) => Number(tr.querySelectorAll('td')[3].textContent?.replace(/\s/g, ''));
    const rows = [...scope.querySelectorAll('tr')].slice(1);
    expect(deps(/** @type {Element} */ (scope.querySelector('tr.an-sum')))).toBe(rows.filter((r) => !r.classList.contains('an-sum')).reduce((n, r) => n + deps(r), 0));
    expect(page().querySelector('.an-node.an-unk')?.textContent).toContain('Ukjent oppdragsgiver');
  });

  it('a chosen period with no trips says so in a sentence instead of empty tables', async () => {
    await open({ 50: route('50') });
    await toAnalyse();
    click(page().querySelector('.an-pick'));
    await settle();
    const from = /** @type {HTMLInputElement} */ (page().querySelector('.an-from')), to = /** @type {HTMLInputElement} */ (page().querySelector('.an-to'));
    from.value = '2030-01-01'; to.value = '2030-01-31';
    to.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    expect(page().textContent).toContain('Ingenting går i denne perioden.');
    expect(page().querySelector('table')).toBeNull();
  });

  it('a project with no exported lines says so', async () => {
    await open({ 50: route('50').replace('#DST', '#EKS;0\r\n#DST') });
    await toAnalyse();
    expect(page().textContent).toContain('Ingen linjer i prosjektet eksporteres ennå.');
    expect(page().querySelector('table')).toBeNull();
  });

  it('Tekst copies the receipt to the clipboard; Excel writes analyse/<stamp> <name>.xlsx into the project', async () => {
    await open({ 50: route('50') });
    await toAnalyse();
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    click(page().querySelector('.an-text'));
    await settle();
    expect(writeText).toHaveBeenCalledTimes(1);
    const text = /** @type {string} */ (/** @type {any} */ (writeText.mock.calls[0])[0]);
    expect(text.split('\n')[0]).toBe('Hele prosjektet');
    expect(text).toContain('Omfang');
    click(page().querySelector('.an-xlsx'));
    await settle();
    const files = (await fs.list('analyse')).map((/** @type {any} */ e) => e.name);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^\d{8}-\d{4} Hele prosjektet\.xlsx$/);
  });

  it('a line with no trips is left out of the tree counts and the children (final review I4)', async () => {
    await open({ 50: route('50'), 60: route('60').replace('#TUR;0;D;', '#TUR;0;;') });
    await toAnalyse();
    expect(page().querySelector('.an-node[data-node="project"] .an-n')?.textContent).toBe('1');
    const op = /** @type {Element} */ ([...page().querySelectorAll('.an-node')].pop());
    click(op);
    await settle();
    expect(tableAfter('Under').querySelectorAll('tr:not(.an-sum)').length - 1).toBe(1);
  });

  it('Oversikt opens on Gjøremål when a project is opened, even after Analyse was used', async () => {
    await open({ 50: route('50') });
    await toAnalyse();
    await open({ 50: route('50') });
    expect(page().hidden).toBe(true);
    expect(/** @type {HTMLElement} */ (document.getElementById('home-body')).hidden).toBe(false);
  });
});

