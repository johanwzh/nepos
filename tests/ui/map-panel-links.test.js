// @vitest-environment jsdom
// The timetable's map follows the line's saved routes (routing editor, 2026-10-31): a routed leg along its route, an
// out-of-date one stale, a leg without a route straight.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { encodePolyline } from '../../src/routing/geometry.js';

/** What the view draws on the (mocked) map. */
const drawn = { links: /** @type {any[]} */ ([]), trip: /** @type {any} */ (null), markers: /** @type {any[]} */ ([]), labels: /** @type {any[]} */ ([]), linkClick: /** @type {Function[]} */ ([]) };
vi.mock('../../src/ui/map-view.js', () => ({
  createMapView: () => {
    const noop = () => {};
    const o = {
      setLinks: (/** @type {any[]} */ l) => { drawn.links = l; },
      setTrip: (/** @type {any} */ t) => { drawn.trip = t; },
      setMarkers: (/** @type {any[]} */ m) => { drawn.markers = m; },
      setStopLabels: (/** @type {any[]} */ s) => { drawn.labels = s; },
      onLinkClick: (/** @type {Function} */ fn) => { drawn.linkClick.push(fn); },
      view: () => ({ lat: 0, lon: 0, zoom: 10, radiusKm: 1 }),
      getZoom: () => 10,
    };
    return new Proxy(o, { get: (t, k) => (k in t ? /** @type {any} */ (t)[k] : noop) });
  },
}));

const { loadAppMarkup, flush } = await import('./dom-setup.js');
const { app } = await import('../../src/ui/state.js');
const { initShell, refreshAll } = await import('../../src/ui/shell.js');
const { initRouteList } = await import('../../src/ui/route-list.js');
const { initProjectUi, openFs } = await import('../../src/ui/project-ui.js');
const { initGrid } = await import('../../src/ui/grid.js');
const { initFootnoteEditor } = await import('../../src/ui/footnote-editor.js');
const { initRouteEditor, selectRoute } = await import('../../src/ui/route-editor.js');
const { initPowerTools, activeTool, setTool } = await import('../../src/ui/power-tools.js');
const { initMapPanel } = await import('../../src/ui/map-panel.js');
const { openPanel } = await import('../../src/ui/shell.js');
const { setQuayLookup } = await import('../../src/ui/quays.js');
const { createMemoryFs, readText } = await import('../../src/project/fs.js');
const { createProject } = await import('../../src/project/create.js');
const { writeRoute } = await import('../../src/project/routes.js');
const { writeLineLinks } = await import('../../src/project/links-store.js');
const { writeCalendars } = await import('../../src/project/calendars-store.js');

const ROUTE = [
  '#LEV;Test;TST', '#RUT;-1;50;Jernbanetorget - Oslo bussterminal;;1;',
  '#SEK;NOG:Authority:aaaaaaaaaa1;Eksempel fylkeskommune;1;0;0;0', '#SEK;NOG:Operator:bbbbbbbbbb2;Eksempel Buss AS;0;1;0;0', '#DST;1;Oslo;', '#TRA;Tur',
  '#PER;;;;;;', '#KAL;cal-vinter', '#TAB;0;;;;', '#TUR;0;DX67;0;0;0;0',
  '#TRL;0;NSR:Quay:1;A;34;0;-1;-1;34;-1', '#TRC;0;0700;0;0;0;0;0',
  '#TRL;1;NSR:Quay:2;B;34;0;-1;-1;34;-1', '#TRC;0;0710;0;0;0;0;0',
  '#TRL;2;NSR:Quay:3;C;34;0;-1;-1;34;-1', '#TRC;0;0720;0;0;0;0;0', '#DSK;0;0;;1',
].join('\r\n') + '\r\n';
/** @type {Record<string, [number, number]>} */
const POS = { 'NSR:Quay:1': [10, 59], 'NSR:Quay:2': [10.01, 59], 'NSR:Quay:3': [10.02, 59] };
const K1 = 'NSR:Quay:1|NSR:Quay:2|bus', K2 = 'NSR:Quay:2|NSR:Quay:3|bus', K13 = 'NSR:Quay:1|NSR:Quay:3|bus';
const settle = async () => { for (let i = 0; i < 8; i++) await flush(); await new Promise((r) => setTimeout(r, 0)); await flush(); };
const press = (/** @type {string} */ key, opts = {}) => document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts }));
const toolBtn = () => /** @type {HTMLButtonElement} */ (document.querySelector('#power-tools .pt-tool[data-tool="route"]'));
const rv = () => /** @type {HTMLElement} */ (document.getElementById('route-view'));
const q = (/** @type {string} */ sel) => /** @type {HTMLElement | null} */ (rv().querySelector(sel));
const btn = (/** @type {string} */ sel) => /** @type {HTMLButtonElement | null} */ (rv().querySelector(sel));
const thumbs = () => [...rv().querySelectorAll('.rv-thumb')].map((el) => /** @type {HTMLElement} */ (el));
const link = (/** @type {string} */ key, extra = {}) => ({ polyline: encodePolyline([POS[key.split('|')[0]], POS[key.split('|')[1]]], 6), precision: 6, distanceM: 1200, seconds: 120,
  ferryM: 0, roads: ['Storgata'], flags: [], via: [], status: 'OK', from: POS[key.split('|')[0]], to: POS[key.split('|')[1]], ...extra });

/** @type {any} */
let fs;
let wired = false;

/** Open line 50 with this links file and the map panel. @param {Record<string, any>} links */
async function openWith(links) {
  loadAppMarkup();
  /** @type {any} */ (globalThis).ResizeObserver = class { observe() {} };
  initShell();
  initRouteList();
  initProjectUi();
  initGrid();
  initPowerTools();
  if (!wired) { initFootnoteEditor(); wired = true; }
  initRouteEditor();
  initMapPanel();
  setTool('');
  window.confirm = vi.fn(() => true);
  setQuayLookup(async (ids) => new Map(ids.map((id) => [id, { quayId: id, publicCode: 'A', stopPlaceId: 'NSR:StopPlace:1', stopPlaceName: id, mode: 'bus',
    lon: POS[id]?.[0] ?? 0, lat: POS[id]?.[1] ?? 0 }])));
  fs = createMemoryFs();
  await createProject(fs, { name: 'Test', codespace: 'TST' });
  await writeCalendars(fs, [{ id: 'cal-vinter', name: 'Vinter', ranges: [['20260101', '20260630']] }]);
  await writeRoute(fs, '50', ROUTE);
  await writeLineLinks(fs, '50', { version: 1, line: '50', links, snaps: {} });
  await openFs(fs);
  /** @type {any} */ (document.getElementById('check-dlg')).close();
  await settle();
  await selectRoute('50');
  openPanel('right');
  await settle();
}

describe('the timetable’s map and the saved routes', () => {
  it('a routed leg follows its route; the leg without one is straight', async () => {
    await openWith({ [K1]: link(K1) });
    expect(drawn.links.map((l) => [l.key, l.state])).toEqual([[K1, 'routed']]);
    expect(drawn.trip.segments).toEqual([[POS['NSR:Quay:2'], POS['NSR:Quay:3']]]);
  });

  it('a stop moved since it was routed: stale', async () => {
    await openWith({ [K1]: link(K1, { to: [10.011, 59] }) });
    expect(drawn.links.map((l) => l.state)).toEqual(['stale']);
  });

  it('no routes: the trip line as before', async () => {
    await openWith({});
    expect(drawn.links).toEqual([]);
    expect(drawn.trip.segments).toBeUndefined();
    expect(drawn.trip.line).toHaveLength(3);
  });
});
