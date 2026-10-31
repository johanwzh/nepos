// @vitest-environment jsdom
// Nettverkskart (Analyse spec 2026-10-31, part 2): the network map moves off Gjøremål into a full-screen view opened
// from Analyse, with the trips of the node picked moving on it at a date and a time.
import { describe, it, expect, beforeEach, vi } from 'vitest';

/** What the view draws on the (mocked) map. */
const drawn = { network: /** @type {any} */ (null), trips: /** @type {any[]} */ ([]) };
vi.mock('../../src/ui/map-view.js', () => ({
  createMapView: () => new Proxy({
    setNetwork: (/** @type {any} */ n) => { drawn.network = n; },
    setTrips: (/** @type {any[]} */ t) => { drawn.trips = t; },
    whenReady: (/** @type {Function} */ fn) => fn(),
  }, { get: (t, k) => (k in t ? /** @type {any} */ (t)[k] : () => {}) }),
}));

const { loadAppMarkup, flush } = await import('./dom-setup.js');
const { app } = await import('../../src/ui/state.js');
const { initShell, setPage } = await import('../../src/ui/shell.js');
const { initProjectUi, openFs } = await import('../../src/ui/project-ui.js');
const { initGrid } = await import('../../src/ui/grid.js');
const { initFootnoteEditor } = await import('../../src/ui/footnote-editor.js');
const { initRouteEditor } = await import('../../src/ui/route-editor.js');
const { initDashboardPage } = await import('../../src/ui/dashboard-page.js');
const { initAnalysisPage } = await import('../../src/ui/analysis-page.js');
const { initNetworkView } = await import('../../src/ui/network-view.js');
const { setQuayLookup } = await import('../../src/ui/quays.js');
const { createMemoryFs } = await import('../../src/project/fs.js');
const { createProject } = await import('../../src/project/create.js');
const { writeRoute } = await import('../../src/project/routes.js');
const { writeCalendars } = await import('../../src/project/calendars-store.js');
const { writeOrgs } = await import('../../src/project/orgs-store.js');
const { projectCopy, registerCompanies } = await import('../fixtures/orgs.js');

const day = (/** @type {number} */ n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; };
/** A bus line A–B at 07:00–07:10; with `op` its operator (two operators make two nodes). */
const route = (/** @type {string} */ code, op = 'NOG:Operator:bbbbbbbbbb2', dep = '0700') => [
  '#LEV;Test;TST', `#RUT;-1;${code};A - B;;1;`, '#SEK;NOG:Authority:aaaaaaaaaa1;F;1;0;0;0', `#SEK;${op};B;0;1;0;0`, '#DST;1;B;', '#TRA;A - B',
  '#PER;;;;;;', '#KAL;cal-1', '#TAB;0;;;;', '#TUR;0;D;0;0;0;0', `#UID;5f0c2e1a-1111-4aaa-8bbb-0000000000${code}`,
  '#TRL;0;NSR:Quay:1;A;34;0;-1;-1;34;-1', `#TRC;0;${dep};0;0;0;0;0`, '#TRL;1;NSR:Quay:2;B;34;0;-1;-1;34;-1', `#TRC;0;${String(+dep + 10).padStart(4, '0')};0;0;0;0;0`, '#DSK;0;0;;1',
].join('\r\n') + '\r\n';
const settle = async () => { for (let i = 0; i < 8; i++) await flush(); };
const click = (/** @type {Element | null} */ el) => /** @type {HTMLElement} */ (el).dispatchEvent(new MouseEvent('click', { bubbles: true }));
const nv = () => /** @type {HTMLElement} */ (document.getElementById('network-view'));
const an = () => /** @type {HTMLElement} */ (document.getElementById('home-analyse'));

beforeEach(async () => {
  loadAppMarkup();
  /** @type {any} */ (globalThis).ResizeObserver = class { observe() {} };
  initShell();
  setPage('edit');
  await initProjectUi({ restoreLast: false });
  initGrid(); initFootnoteEditor(); initRouteEditor(); initDashboardPage(); initAnalysisPage(); initNetworkView();
  setQuayLookup(async (ids) => new Map(ids.map((id, n) => [id, { quayId: id, publicCode: '', stopPlaceId: `NSR:StopPlace:${n}`, stopPlaceName: id, mode: 'bus', lat: 60 + n * 0.01, lon: 10 }])));
  const fs = createMemoryFs();
  await createProject(fs, { name: 'Test', codespace: 'TST' });
  await writeCalendars(fs, [{ id: 'cal-1', name: 'Høst', ranges: [[day(-5), day(4)]] }]);
  await writeOrgs(fs, projectCopy().map((c, n) => ({ ...c, authority: c.authority && { ...c.authority, alias: `TST:Authority:${n + 1}` }, operator: c.operator && { ...c.operator, alias: `TST:Operator:${n + 1}` } })));
  await writeRoute(fs, '50', route('50'));
  await writeRoute(fs, '60', route('60', 'NOG:Operator:cccccccccc3', '0800'));
  await openFs(fs, { landing: true });
  app.orgRegister = { companies: registerCompanies(), fetchedAt: new Date().toISOString() };
  setPage('lines'); setPage('home');
  /** @type {any} */ (document.getElementById('check-dlg')).close();
  await settle();
  drawn.network = null; drawn.trips = [];
});
const toAnalyse = async () => { click(document.querySelector('#home-tabs [data-sub="analyse"]')); await settle(); click(an().querySelector('.an-node[data-node="project"]')); await settle(); };
const setTime = async (/** @type {string} */ hhmm) => {
  const input = /** @type {HTMLInputElement} */ (nv().querySelector('.nv-time'));
  input.value = String(+hhmm.slice(0, 2) * 60 + +hhmm.slice(3, 5));
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await settle();
};

describe('Nettverkskart', () => {
  it('Oversikt → Gjøremål no longer has the network map', async () => {
    expect(document.getElementById('home-map')).toBeNull();
    expect(document.querySelector('#home-body .home-network')).toBeNull();
  });

  it('Nettverkskart on Analyse takes over the page and Esc closes it', async () => {
    await toAnalyse();
    click(an().querySelector('.an-network'));
    await settle();
    expect(document.body.classList.contains('network-on')).toBe(true);
    expect(nv().hidden).toBe(false);
    expect(drawn.network.lines.length).toBeGreaterThan(0);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle();
    expect(document.body.classList.contains('network-on')).toBe(false);
    expect(nv().hidden).toBe(true);
  });

  it('moving the time places the node\'s trips; another node shows only its own lines', async () => {
    await toAnalyse();
    click(an().querySelector('.an-network'));
    await settle();
    await setTime('07:05');
    expect(drawn.trips.map((p) => p.line)).toEqual(['50']);
    expect(nv().querySelector('.nv-at')?.textContent).toContain('07:05');
    await setTime('08:05');
    expect(drawn.trips.map((p) => p.line)).toEqual(['60']);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle();
    // The operator of line 50 only
    const op = [...an().querySelectorAll('.an-node')].find((n) => /** @type {HTMLElement} */ (n).dataset.node?.endsWith('bbbbbbbbbb2'));
    click(/** @type {Element} */ (op));
    await settle();
    click(an().querySelector('.an-network'));
    await settle();
    await setTime('08:05');
    expect(drawn.trips).toEqual([]);
    await setTime('07:05');
    expect(drawn.trips.map((p) => p.line)).toEqual(['50']);
  });
});
