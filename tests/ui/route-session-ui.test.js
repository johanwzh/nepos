// @vitest-environment jsdom
// The routing power tool (2.6): a session on the shown table set, on the map; Apply writes the line's links file,
// Esc / ✕ leaves without writing anything.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { encodePolyline } from '../../src/routing/geometry.js';

/** What the routing session draws on the (mocked) map. */
const drawn = { links: /** @type {any[]} */ ([]), markers: /** @type {any[]} */ ([]), linkClick: /** @type {Function[]} */ ([]) };
vi.mock('../../src/ui/map-view.js', () => ({
  createMapView: () => {
    const noop = () => {};
    const o = {
      setLinks: (/** @type {any[]} */ l) => { drawn.links = l; },
      setMarkers: (/** @type {any[]} */ m) => { drawn.markers = m; },
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
const { initRouteSessionUi } = await import('../../src/ui/route-session-ui.js');
const { setQuayLookup } = await import('../../src/ui/quays.js');
const { createMemoryFs, readText } = await import('../../src/project/fs.js');
const { createProject } = await import('../../src/project/create.js');
const { writeRoute } = await import('../../src/project/routes.js');
const { writeCalendars } = await import('../../src/project/calendars-store.js');

const ROUTE = [
  '#LEV;Test;TST', '#RUT;-1;50;Jernbanetorget - Oslo bussterminal;;1;',
  '#SEK;NOG:Authority:aaaaaaaaaa1;Eksempel fylkeskommune;1;0;0;0', '#SEK;NOG:Operator:bbbbbbbbbb2;Eksempel Buss AS;0;1;0;0', '#DST;1;Oslo;', '#TRA;Tur',
  '#PER;;;;;;', '#KAL;cal-vinter', '#TAB;0;;;;', '#TUR;0;DX67;0;0;0;0',
  '#TRL;0;NSR:Quay:1;A;34;0;-1;-1;34;-1', '#TRC;0;0700;0;0;0;0;0',
  '#TRL;1;NSR:Quay:2;B;34;0;-1;-1;34;-1', '#TRC;0;0710;0;0;0;0;0',
  '#TRL;2;NSR:Quay:3;C;34;0;-1;-1;34;-1', '#TRC;0;0720;0;0;0;0;0', '#DSK;0;0;;1',
].join('\r\n') + '\r\n';
const POS = { 'NSR:Quay:1': [10, 59], 'NSR:Quay:2': [10.01, 59], 'NSR:Quay:3': [10.02, 59] };
const K1 = 'NSR:Quay:1|NSR:Quay:2|bus', K2 = 'NSR:Quay:2|NSR:Quay:3|bus';
const settle = async () => { for (let i = 0; i < 8; i++) await flush(); await new Promise((r) => setTimeout(r, 0)); await flush(); };
const press = (/** @type {string} */ key, opts = {}) => document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts }));
const toolBtn = () => /** @type {HTMLButtonElement} */ (document.querySelector('#power-tools .pt-tool[data-tool="route"]'));
const box = () => /** @type {HTMLElement | null} */ (document.querySelector('.rt-box'));

/** A session the UI drives: two legs, the first routed, the second without a route. */
function fakeSession() {
  let dirty = false;
  const q = (/** @type {string} */ id) => ({ quayId: id, lon: POS[/** @type {keyof typeof POS} */ (id)][0], lat: POS[/** @type {keyof typeof POS} */ (id)][1] });
  const link = { polyline: encodePolyline([[10, 59], [10.005, 59.001], [10.01, 59]], 6), precision: 6, distanceM: 1234, seconds: 150, ferryM: 0, roads: ['Storgata', '162;Ring 1', 'Storgata', '162;Ring 1'],
    flags: [], via: [], status: 'OK', from: POS['NSR:Quay:1'], to: POS['NSR:Quay:2'] };
  const pairs = [
    { key: K1, from: q('NSR:Quay:1'), to: q('NSR:Quay:2'), state: 'routed', link, flags: [], via: /** @type {[number, number][]} */ ([]) },
    { key: K2, from: q('NSR:Quay:2'), to: q('NSR:Quay:3'), state: 'no-route', flags: [], via: /** @type {[number, number][]} */ ([]) },
  ];
  return {
    start: vi.fn(async (/** @type {any} */ onProgress) => { onProgress?.(1, 1); dirty = true; }),
    pairs: () => pairs,
    setWaypoints: vi.fn(async (/** @type {string} */ key, /** @type {[number, number][]} */ via) => { const p = /** @type {any} */ (pairs.find((x) => x.key === key)); p.via = via; p.link = { ...p.link, via }; dirty = true; }),
    result: () => ({ version: 1, line: '50', links: { [K1]: link }, snaps: {} }),
    dirty: () => dirty,
    newerMap: () => false,
    close: vi.fn(),
  };
}

/** @type {ReturnType<typeof fakeSession>} */
let session;
/** @type {any} */
let fs;
let wired = false;

beforeEach(async () => {
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
  session = fakeSession();
  initRouteSessionUi({ createSession: () => /** @type {any} */ (session) });
  setTool('');
  drawn.links = []; drawn.markers = []; // the map view (and its click handler) lives on across tests
  window.confirm = vi.fn(() => true);
  setQuayLookup(async (ids) => new Map(ids.map((id) => [id, { quayId: id, publicCode: 'A', stopPlaceId: 'NSR:StopPlace:1', stopPlaceName: id, mode: 'bus',
    lon: POS[/** @type {keyof typeof POS} */ (id)]?.[0] ?? 0, lat: POS[/** @type {keyof typeof POS} */ (id)]?.[1] ?? 0 }])));
  fs = createMemoryFs();
  await createProject(fs, { name: 'Test', codespace: 'TST' });
  await writeCalendars(fs, [{ id: 'cal-vinter', name: 'Vinter', ranges: [['20260101', '20260630']] }]);
  await writeRoute(fs, '50', ROUTE);
  await openFs(fs);
  /** @type {any} */ (document.getElementById('check-dlg')).close();
  await settle();
  await selectRoute('50');
  await settle();
});

describe('the routing power tool', () => {
  it('is in the toolbox with Alt+L, and disabled for a line not routed on roads', () => {
    expect(toolBtn().title).toBe('Alt+L');
    expect(toolBtn().disabled).toBe(false);
    app.routeState.mode = 'rail';
    refreshAll();
    expect(toolBtn().disabled).toBe(true);
    press('l', { altKey: true });
    expect(activeTool()).toBe('');
  });

  it('turning it on locks the page, opens the map and shows the session box with the legs to check', async () => {
    press('l', { altKey: true });
    expect(activeTool()).toBe('route');
    expect(document.body.classList.contains('pt-on')).toBe(true);
    expect(document.body.classList.contains('pt-route')).toBe(true);
    await settle();
    expect(session.start).toHaveBeenCalled();
    const text = box()?.textContent ?? '';
    expect(text).toContain('1 strekning rutet, 1 å sjekke');
    expect(text).toContain('© OpenStreetMap');
    expect(box()?.querySelector('.rt-check')?.textContent).toContain('Ingen rute');
    expect(drawn.links.map((l) => [l.key, l.state])).toEqual([[K1, 'routed'], [K2, 'failed']]);
    expect(drawn.links[1].coords).toEqual([POS['NSR:Quay:2'], POS['NSR:Quay:3']]);
  });

  it('Apply writes the line\'s links file and turns the tool off', async () => {
    toolBtn().click();
    await settle();
    /** @type {HTMLButtonElement} */ (box()?.querySelector('.rt-apply')).click();
    await settle();
    expect(JSON.parse(await readText(fs, 'data/links/50.json')).links[K1].distanceM).toBe(1234);
    expect(app.lineLinks.get('50')?.links[K1].distanceM).toBe(1234);
    expect(activeTool()).toBe('');
    expect(session.close).toHaveBeenCalled();
    expect(box()).toBeNull();
    expect(document.body.classList.contains('pt-on')).toBe(false);
  });

  it('Esc with changes asks first; No stays, Yes leaves and writes nothing (Review Focus 5)', async () => {
    toolBtn().click();
    await settle();
    window.confirm = vi.fn(() => false);
    press('Escape');
    expect(window.confirm).toHaveBeenCalledWith('Gå ut uten å lagre rutingen?');
    expect(activeTool()).toBe('route');
    window.confirm = vi.fn(() => true);
    /** @type {HTMLButtonElement} */ (box()?.querySelector('.rt-x')).click();
    await settle();
    expect(activeTool()).toBe('');
    expect(session.close).toHaveBeenCalled();
    expect(await readText(fs, 'data/links/50.json')).toBeNull();
    expect(app.lineLinks.has('50')).toBe(false);
    expect(document.body.classList.contains('pt-on')).toBe(false);
  });

  it('a click selects a leg and shows it; a second click adds a waypoint; Delete removes the selected waypoint', async () => {
    toolBtn().click();
    await settle();
    drawn.linkClick.at(-1)?.(K1, [10.005, 59.001]);
    await settle();
    expect(drawn.links.find((l) => l.key === K1).state).toBe('selected');
    expect(box()?.querySelector('.rt-leg')?.textContent).toContain('1,2 km');
    expect(box()?.querySelector('.rt-leg')?.textContent).toContain('Storgata');
    // OSM's ref;name labels read as "162 Ring 1", each road once
    expect(box()?.querySelector('.rt-leg')?.textContent).toContain('Storgata, 162 Ring 1');
    expect(box()?.querySelector('.rt-leg')?.textContent?.match(/162 Ring 1/g)).toHaveLength(1);
    drawn.linkClick.at(-1)?.(K1, [10.006, 59.001]);
    await settle();
    expect(session.setWaypoints).toHaveBeenLastCalledWith(K1, [[10.006, 59.001]]);
    const wp = drawn.markers.find((m) => m.draggable);
    expect(wp).toBeTruthy();
    wp.onDragEnd([10.007, 59.002]);
    await settle();
    expect(session.setWaypoints).toHaveBeenLastCalledWith(K1, [[10.007, 59.002]]);
    drawn.markers.find((m) => m.draggable).onClick(new MouseEvent('click'));
    press('Delete');
    await settle();
    expect(session.setWaypoints).toHaveBeenLastCalledWith(K1, []);
  });
});
