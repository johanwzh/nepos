// @vitest-environment jsdom
// Knutepunkt (interchanges spec 2026-10-31): a power tool in place of the timetable. Every stop of the table set with a
// switch; the hub's criteria; a timeline at the stop where our departures are picked; Forslag, approved with Godkjenn.
// The hubs and links are part of the line (ERN), saved with it.
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/ui/map-view.js', () => ({ createMapView: () => new Proxy({}, { get: () => () => {} }) }));

const { loadAppMarkup, flush } = await import('./dom-setup.js');
const { app } = await import('../../src/ui/state.js');
const { initShell } = await import('../../src/ui/shell.js');
const { initRouteList } = await import('../../src/ui/route-list.js');
const { initProjectUi, openFs } = await import('../../src/ui/project-ui.js');
const { initGrid, grid } = await import('../../src/ui/grid.js');
const { initFootnoteEditor } = await import('../../src/ui/footnote-editor.js');
const { initRouteEditor, selectRoute } = await import('../../src/ui/route-editor.js');
const { initPowerTools, activeTool, setTool } = await import('../../src/ui/power-tools.js');
const { initMapPanel } = await import('../../src/ui/map-panel.js');
const { initHubView } = await import('../../src/ui/hub-view.js');
const { setQuayLookup } = await import('../../src/ui/quays.js');
const { createMemoryFs } = await import('../../src/project/fs.js');
const { createProject } = await import('../../src/project/create.js');
const { writeRoute, readRoute } = await import('../../src/project/routes.js');
const { writeCalendars } = await import('../../src/project/calendars-store.js');

const U1 = '5f0c2e1a-1111-4aaa-8bbb-000000000001', U2 = '5f0c2e1a-1111-4aaa-8bbb-000000000002';
const F1 = '5f0c2e1a-1111-4aaa-8bbb-0000000000f1', F2 = '5f0c2e1a-1111-4aaa-8bbb-0000000000f2';
const head = (/** @type {string} */ code, /** @type {string} */ name) => ['#LEV;Test;TST', `#RUT;-1;${code};${name};;1;`,
  '#SEK;NOG:Authority:aaaaaaaaaa1;Eksempel fylkeskommune;1;0;0;0', '#SEK;NOG:Operator:bbbbbbbbbb2;Eksempel Buss AS;0;1;0;0', '#DST;1;Oslo;', '#TRA;Tur',
  '#PER;;;;;;', '#KAL;cal-vinter', '#TAB;0;;;;'];
/** Ours: A → B → C at 07:00 and 08:00; the hub will be B (row 1), departures 07:10 and 08:10. */
const OURS = [...head('50', 'A - C'), '#TUR;0;D;0;0;0;0', `#UID;${U1}`, '#TUR;1;D;0;0;0;0', `#UID;${U2}`,
  '#TRL;0;NSR:Quay:1;A;34;0;-1;-1;34;-1', '#TRC;0;0700;0;0;0;0;0', '#TRC;1;0800;0;0;0;0;0',
  '#TRL;1;NSR:Quay:2;B;34;0;-1;-1;34;-1', '#TRC;0;0710;0;0;0;0;0', '#TRC;1;0810;0;0;0;0;0',
  '#TRL;2;NSR:Quay:3;C;34;0;-1;-1;34;-1', '#TRC;0;0720;0;0;0;0;0', '#TRC;1;0820;0;0;0;0;0', '#DSK;0;0;;1', '#DSK;1;0;;1'].join('\r\n') + '\r\n';
/** The feeder: X → B, arriving at B at the given times. */
const FEEDER = (/** @type {string[]} */ arrs) => [...head('60', 'X - B'), ...arrs.flatMap((_, i) => [`#TUR;${i};D;0;0;0;0`, `#UID;${[F1, F2][i]}`]),
  '#TRL;0;NSR:Quay:9;X;34;0;-1;-1;34;-1', ...arrs.map((_, i) => `#TRC;${i};0640;0;0;0;0;0`),
  '#TRL;1;NSR:Quay:2;B;34;0;-1;-1;34;-1', ...arrs.map((a, i) => `#TRC;${i};${a};0;0;0;0;0`), ...arrs.map((_, i) => `#DSK;${i};0;;1`)].join('\r\n') + '\r\n';

const settle = async () => { for (let i = 0; i < 8; i++) await flush(); await new Promise((r) => setTimeout(r, 0)); await flush(); };
const press = (/** @type {string} */ key, opts = {}) => document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts }));
const hv = () => /** @type {HTMLElement} */ (document.getElementById('hub-view'));
const q = (/** @type {string} */ sel) => /** @type {HTMLElement} */ (hv().querySelector(sel));
const click = (/** @type {string} */ sel) => { q(sel).dispatchEvent(new MouseEvent('click', { bubbles: true })); };
/** @type {any} */
let fs;
let wired = false;

async function setup(/** @type {string[]} */ arrs = ['0705']) {
  loadAppMarkup();
  /** @type {any} */ (globalThis).ResizeObserver = class { observe() {} };
  initShell(); initRouteList(); initProjectUi(); initGrid(); initPowerTools();
  if (!wired) { initFootnoteEditor(); wired = true; }
  initRouteEditor(); initMapPanel(); initHubView();
  setTool('');
  window.confirm = vi.fn(() => true);
  setQuayLookup(async (ids) => new Map(ids.map((id) => [id, { quayId: id, publicCode: 'A', stopPlaceId: id.replace('Quay', 'StopPlace'), stopPlaceName: `Sted ${id.slice(9)}`, mode: 'bus', lon: 10, lat: 59 }])));
  fs = createMemoryFs();
  await createProject(fs, { name: 'Test', codespace: 'TST' });
  await writeCalendars(fs, [{ id: 'cal-vinter', name: 'Vinter', ranges: [['20260101', '20260630']] }]);
  await writeRoute(fs, '50', OURS);
  await writeRoute(fs, '60', FEEDER(arrs));
  await openFs(fs);
  /** @type {any} */ (document.getElementById('check-dlg')).close();
  await settle();
  await selectRoute('50');
  await settle();
}
async function open() { press('k', { altKey: true }); await settle(); }
async function turnOnB() { const box = /** @type {HTMLInputElement} */ (q('.hv-stop[data-row="1"] input.hv-on')); box.click(); await settle(); }

describe('Knutepunkt: stops, criteria, trips', () => {
  beforeEach(() => setup());

  it('Alt+K opens it in place of the timetable and locks the app', async () => {
    await open();
    expect(activeTool()).toBe('hub');
    expect(document.body.classList.contains('hub-on')).toBe(true);
    expect(document.body.classList.contains('pt-on')).toBe(true);
  });

  it('lists every stop row of the table set', async () => {
    await open();
    expect([...hv().querySelectorAll('.hv-stop')].map((el) => /** @type {HTMLElement} */ (el).dataset.row)).toEqual(['0', '1', '2']);
  });

  it('a dwell pair is listed once', async () => {
    grid.stops.splice(1, 0, { ...grid.stops[1], isDwellArr: true });
    for (const col of grid.cols) col.cells.splice(1, 0, { ...col.cells[1], time: '0708' });
    await open();
    expect([...hv().querySelectorAll('.hv-stop')].map((el) => /** @type {HTMLElement} */ (el).dataset.row)).toEqual(['0', '2', '3']);
  });

  it('turning a stop on makes a hub with the defaults and marks the line changed', async () => {
    await open();
    await turnOnB();
    expect(grid.stops[1].hub).toEqual({ stopId: 'NSR:Quay:2', stops: ['NSR:StopPlace:2'], radiusM: null, window: [2, 15], maxWait: 5, walk: 0, criteria: {} });
    expect(app.dirty).toBe(true);
    expect(q('.hv-criteria')).toBeTruthy();
  });

  it('turning it off removes the hub and its links, after asking when there are links', async () => {
    await open();
    await turnOnB();
    grid.cols[0].cells[1].hubLink = { line: '60', trip: F1, stopId: 'NSR:Quay:2', arr: 425, at: 'x' };
    /** @type {any} */ (window.confirm).mockReturnValueOnce(false);
    /** @type {HTMLInputElement} */ (q('.hv-stop[data-row="1"] input.hv-on')).click();
    await settle();
    expect(grid.stops[1].hub).toBeTruthy();
    /** @type {HTMLInputElement} */ (q('.hv-stop[data-row="1"] input.hv-on')).click();
    await settle();
    expect(grid.stops[1].hub).toBeUndefined();
    expect(grid.cols[0].cells[1].hubLink).toBeUndefined();
  });

  it('a criteria change is kept in the line', async () => {
    await open();
    await turnOnB();
    const input = /** @type {HTMLInputElement} */ (q('.hv-maxwait'));
    input.value = '7';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    expect(grid.stops[1].hub.maxWait).toBe(7);
  });

  it('Alle picks every trip at the stop; Ingen unpicks them', async () => {
    await open();
    await turnOnB();
    click('.hv-all');
    await settle();
    expect(grid.cols.map((c) => c.cells[1].hubLink)).toEqual([{}, {}]);
    click('.hv-none');
    await settle();
    expect(grid.cols.map((c) => c.cells[1].hubLink)).toEqual([undefined, undefined]);
  });

  it('Esc deselects, then closes', async () => {
    await open();
    await turnOnB();
    press('Escape');
    await settle();
    expect(activeTool()).toBe('hub');
    expect(q('.hv-criteria')).toBeNull();
    press('Escape');
    await settle();
    expect(activeTool()).toBe('');
    expect(document.body.classList.contains('hub-on')).toBe(false);
  });
});

describe('Knutepunkt: timeline, Forslag, approval', () => {
  it('clicking a departure picks the trip, and Forslag lists it with its state', async () => {
    await setup();
    await open();
    await turnOnB();
    q(`.hv-dep[data-trip="${U1}"]`).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle();
    expect(grid.cols[0].cells[1].hubLink).toEqual({});
    const rows = [...hv().querySelectorAll('.hv-proposals tr[data-trip]')];
    expect(rows.map((r) => /** @type {HTMLElement} */ (r).dataset.state)).toEqual(['new']);
    expect(rows[0].textContent).toContain('07:05');
  });

  it('a pick needs a choice; Godkjenn writes it and saves the line', async () => {
    await setup(['0705', '0703']);
    await open();
    await turnOnB();
    click('.hv-all');
    await settle();
    const row = /** @type {HTMLElement} */ (q(`.hv-proposals tr[data-trip="${U1}"]`));
    expect(row.dataset.state).toBe('pick');
    const radios = /** @type {NodeListOf<HTMLInputElement>} */ (hv().querySelectorAll(`input[name="pick-${U1}"]`));
    expect(radios).toHaveLength(2);
    radios[1].click();
    await settle();
    click('.hv-approve');
    await settle();
    expect(grid.cols[0].cells[1].hubLink).toMatchObject({ line: '60', trip: F2, arr: 423 });
    expect(await readRoute(fs, '50')).toContain(`#KNL;0;1;60;${F2};NSR:Quay:2;423;`);
    expect(app.dirty).toBe(false);
  });

  it('Godkjenn drops gone links', async () => {
    await setup();
    await open();
    await turnOnB();
    grid.cols[1].cells[1].hubLink = { line: '60', trip: 'gone-trip', stopId: 'NSR:Quay:2', arr: 480, at: 'x' };
    click('.hv-find');
    await settle();
    expect(/** @type {HTMLElement} */ (q(`.hv-proposals tr[data-trip="${U2}"]`)).dataset.state).toBe('gone');
    click('.hv-approve');
    await settle();
    expect(grid.cols[1].cells[1].hubLink).toEqual({});
  });

  it('the timetable cell of an approved link is marked', async () => {
    await setup();
    await open();
    await turnOnB();
    q(`.hv-dep[data-trip="${U1}"]`).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle();
    click('.hv-approve');
    await settle();
    setTool('');
    await settle();
    expect(document.querySelector('td[data-r="1"][data-c="0"]')?.classList.contains('g-hub')).toBe(true);
    expect(document.querySelector('td[data-r="1"][data-c="1"]')?.classList.contains('g-hub')).toBe(false);
  });

  it('the wheel zooms around the pointer', async () => {
    await setup();
    await open();
    await turnOnB();
    const svg = /** @type {HTMLElement} */ (q('.hv-timeline svg'));
    const span = () => Number(svg.dataset.t1) - Number(svg.dataset.t0);
    const before = span();
    const mid = (Number(svg.dataset.t0) + Number(svg.dataset.t1)) / 2;
    svg.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, clientX: 0, bubbles: true, cancelable: true }));
    await settle();
    const after = /** @type {HTMLElement} */ (q('.hv-timeline svg'));
    expect(Number(after.dataset.t1) - Number(after.dataset.t0)).toBeLessThan(before);
    expect(Number(after.dataset.t0)).toBeGreaterThanOrEqual(Number(svg.dataset.t0)); // zoomed in, not shifted away
    expect(mid).toBeGreaterThan(0);
  });
});
