// @vitest-environment jsdom
// The routing view with vehicle groups (backlog 92, 93, 107; design 2026-11-03 §10): the vehicles beside each thumbnail,
// why a leg goes round or has no route for the vehicle (with the way in OpenStreetMap), the route without limits in red,
// U-turn marks, Keep only where a route may be kept, and the automatic check written when Routing opens.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { encodePolyline } from '../../src/routing/geometry.js';

const drawn = { links: /** @type {any[]} */ ([]), markers: /** @type {any[]} */ ([]), fit: /** @type {any[]} */ ([]) };
vi.mock('../../src/ui/map-view.js', () => ({
  createMapView: () => {
    const noop = () => {};
    const o = {
      setLinks: (/** @type {any[]} */ l) => { drawn.links = l; },
      setMarkers: (/** @type {any[]} */ m) => { drawn.markers = m; },
      fit: (/** @type {any[]} */ pts) => { drawn.fit = pts; },
      whenReady: (/** @type {Function} */ fn) => fn(),
      view: () => ({ lat: 0, lon: 0, zoom: 10, radiusKm: 1 }),
      getZoom: () => 10,
    };
    return new Proxy(o, { get: (t, k) => (k in t ? /** @type {any} */ (t)[k] : noop) });
  },
}));

const { loadAppMarkup, flush } = await import('./dom-setup.js');
const { app } = await import('../../src/ui/state.js');
const { initShell } = await import('../../src/ui/shell.js');
const { initRouteList } = await import('../../src/ui/route-list.js');
const { initProjectUi, openFs } = await import('../../src/ui/project-ui.js');
const { initGrid } = await import('../../src/ui/grid.js');
const { initRouteEditor, selectRoute } = await import('../../src/ui/route-editor.js');
const { initPowerTools, setTool } = await import('../../src/ui/power-tools.js');
const { initMapPanel } = await import('../../src/ui/map-panel.js');
const { initRouteView } = await import('../../src/ui/route-view.js');
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
  '#TRL;1;NSR:Quay:2;B;34;0;-1;-1;34;-1', '#TRC;0;0710;0;0;0;0;0', '#DSK;0;0;;1',
].join('\r\n') + '\r\n';
const K = 'NSR:Quay:1|NSR:Quay:2|bus';
/** @type {[number, number][]} */
const SHORT = [[10, 59], [10.005, 59], [10.01, 59]];
/** @type {[number, number][]} */
const LONG = [[10, 59], [10.005, 59.01], [10.01, 59]];
const LIMIT = { kind: 'height', value: 3.7, way: 77, road: 'Matrandvegen', at: [10.007, 59] };
const link = (/** @type {[number, number][]} */ coords, extra = {}) => ({ polyline: encodePolyline(coords, 6), precision: 6, distanceM: 600, seconds: 60,
  ferryM: 0, roads: ['Matrandvegen'], flags: [], via: [], status: 'OK', from: coords[0], to: coords[coords.length - 1],
  tiles: { set: 'road', built: '2026-11-01T00:00:00Z', dataDate: '2026-10-30', hashes: {} }, limits: { height: LIMIT }, ...extra });

/**
 * Patterns of the same stops: TB (4 m, over the 3.7 m bridge: red), LB (3.3 m, close: green), five vehicles without sizes
 * (green, sharing the plain route), LB2 (on a route to reconfirm: orange), OLD (a route saved before 2.6.1: unchecked).
 */
function fakeSession() {
  const stops = ['NSR:Quay:1', 'NSR:Quay:2'].map((id, i) => ({ stopId: id, quay: { quayId: id, lon: SHORT[i * 2][0], lat: 59 }, name: `Stopp ${i + 1}` }));
  const pat = (/** @type {string} */ id, /** @type {any} */ group, /** @type {string[]} */ vehicles) => ({ id, stops, keys: [K], trips: [`u${id}`], runs: 1, group, groupKey: id, vehicles, lineMode: 'bus' });
  const P = {
    TB: pat('h4', { height: 4 }, ['TB']), LB: pat('h3.3', { height: 3.3 }, ['LB']), V: pat('', {}, ['V1', 'V2', 'V3', 'V4', 'V5']),
    LB2: pat('h3', { height: 3 }, ['LB2']), OLD: pat('h2', { height: 2 }, ['OLD']),
  };
  /** @type {any} */
  let file = { version: 1, line: '50', links: { [K]: link(SHORT), [`${K}|h3x`]: link(LONG, { around: [LIMIT], distanceM: 900 }) }, snaps: {} };
  /** @type {Map<string, any>} */
  const proposals = new Map();
  const legsOf = /** @type {Record<string, any>} */ ({
    h4: { key: K, pair: K, state: 'over', over: [LIMIT], close: [] },
    'h3.3': { key: K, pair: K, state: 'routed', close: [LIMIT] },
    '': { key: K, pair: K, state: 'routed', close: [] },
    h3: { key: `${K}|h3x`, pair: K, state: 'reconfirm', close: [] },
    h2: { key: K, pair: K, state: 'unchecked' },
  });
  const states = () => Object.values(P).map((p) => {
    const l = legsOf[p.id];
    const state = l.state === 'over' ? 'red' : l.state === 'routed' ? 'green' : 'orange';
    return { pattern: p, state, legs: [l], saved: null, proposal: proposals.get(p.id) ?? null };
  });
  return {
    open: vi.fn(async () => {}),
    checkLimits: vi.fn(async () => file),
    states,
    proposal: (/** @type {string} */ id) => proposals.get(id) ?? null,
    route: vi.fn(async (/** @type {string} */ id) => {
      proposals.set(id, { legs: new Map([[K, link(LONG, { distanceM: 2000, seconds: 180, uturn: 12, limits: {}, around: [LIMIT], free: SHORT, freeM: 600, freeS: 60,
        uturns: [{ at: [10.008, 59.01], road: 'Blindvegen', where: 'stop' }] })]]), via: new Map(), old: id === 'h3' ? new Map() : new Map([[K, K]]) });
    }),
    setWaypoints: vi.fn(async () => {}),
    accept: vi.fn(async () => file),
    keep: vi.fn(() => file),
    discard: vi.fn((/** @type {string} */ id) => { proposals.delete(id); }),
    pending: () => [...proposals.keys()],
    newerMap: () => false,
    updateAll: vi.fn(async () => file),
    file: () => file,
    removeUnused: vi.fn(() => file),
    close: vi.fn(),
  };
}

/** @type {ReturnType<typeof fakeSession>} */
let session;
/** @type {any} */
let fs;
const settle = async () => { for (let i = 0; i < 8; i++) await flush(); await new Promise((r) => setTimeout(r, 0)); await flush(); };
const rv = () => /** @type {HTMLElement} */ (document.getElementById('route-view'));
const q = (/** @type {string} */ sel) => /** @type {HTMLElement | null} */ (rv().querySelector(sel));
const thumb = (/** @type {string} */ id) => /** @type {HTMLElement} */ (rv().querySelector(`.rv-thumb[data-id="${id}"]`));
const info = () => q('.rv-info')?.textContent ?? '';
async function pick(/** @type {string} */ id) {
  thumb(id).click();
  await settle();
  /** @type {HTMLElement} */ (q(`.rv-gap[data-key="${K}"]`)).click();
  await settle();
}

beforeEach(async () => {
  loadAppMarkup();
  /** @type {any} */ (globalThis).ResizeObserver = class { observe() {} };
  initShell(); initRouteList(); initProjectUi(); initGrid(); initPowerTools(); initRouteEditor(); initMapPanel();
  session = fakeSession();
  initRouteView({ createSession: () => /** @type {any} */ (session) });
  setTool('');
  drawn.links = []; drawn.markers = []; drawn.fit = [];
  window.confirm = vi.fn(() => true);
  setQuayLookup(async (ids) => new Map(ids.map((id, i) => [id, { quayId: id, publicCode: 'A', stopPlaceId: 'NSR:StopPlace:1', stopPlaceName: id, mode: 'bus', lon: 10 + i * 0.01, lat: 59 }])));
  fs = createMemoryFs();
  await createProject(fs, { name: 'Test', codespace: 'TST' });
  await writeCalendars(fs, [{ id: 'cal-vinter', name: 'Vinter', ranges: [['20260101', '20260630']] }]);
  await writeRoute(fs, '50', ROUTE);
  await openFs(fs);
  /** @type {any} */ (document.getElementById('check-dlg')).close();
  await settle();
  await selectRoute('50');
  await settle();
  app.vehicles = /** @type {any} */ ([{ name: 'TB', shortCode: 'TB', colour: '#c62828', height: 4 }, { name: 'LB', shortCode: 'LB', colour: '#1b8a4a', height: 3.3 },
    ...['V1', 'V2', 'V3', 'V4', 'V5', 'LB2', 'OLD'].map((name) => ({ name, shortCode: name, colour: '#2f6fb5' }))]);
  app.settings.lang = 'no';
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', altKey: true, bubbles: true, cancelable: true }));
  await settle();
});

describe('Routing with vehicle groups', () => {
  it('runs the automatic check when it opens and writes what it returns', async () => {
    expect(session.checkLimits).toHaveBeenCalled();
    expect(await readText(fs, 'data/links/50.json')).toContain('Matrandvegen');
  });

  it('each thumbnail has its vehicles beside it: at most four, then +n with every name', () => {
    const vehs = (/** @type {string} */ id) => /** @type {HTMLElement} */ (thumb(id).closest('.rv-tw')).querySelector('.rv-vehs');
    expect([...(vehs('h4')?.querySelectorAll('.g-lb-chip') ?? [])].map((c) => c.textContent)).toEqual(['TB']);
    expect(vehs('')?.querySelectorAll('.g-lb-chip')).toHaveLength(4);
    expect(vehs('')?.querySelector('.rv-more')?.textContent).toBe('+1');
    expect(vehs('')?.querySelector('.rv-more')?.getAttribute('title')).toBe('V1, V2, V3, V4, V5');
    expect(thumb('h4').classList.contains('rv-red')).toBe(true);
  });

  it('a vehicle over a limit: the pattern lists its vehicle and sizes; the leg says why, links the way, offers no Keep', async () => {
    await pick('h4');
    expect(info()).toContain('TB · 4,0 m høy');
    expect(info()).toContain('TB (4,0 m) er høyere enn fri høyde 3,7 m på Matrandvegen');
    const a = /** @type {HTMLAnchorElement} */ (q('.rv-around a'));
    expect(a.href).toBe('https://www.openstreetmap.org/way/77');
    expect([a.target, a.rel]).toEqual(['_blank', 'noopener']);
    expect(q('.rv-keep')).toBeNull();
    expect(drawn.links.find((l) => l.key === K)?.state).toBe('selected');
  });

  it('clicking the reason fits the map to the bridge', async () => {
    await pick('h4');
    /** @type {HTMLElement} */ (q('.rv-around')).click();
    expect(drawn.fit).toEqual([[10.007, 59], [10.007, 59]]);
  });

  it('after Route: the route without limits in red, "goes round" with the extra km and minutes, and the U-turn marked', async () => {
    thumb('h4').click();
    await settle();
    /** @type {HTMLElement} */ (q('.rv-route')).click();
    await settle();
    expect(drawn.links.find((l) => l.state === 'free')?.coords).toEqual(SHORT);
    /** @type {HTMLElement} */ (q(`.rv-gap[data-key="${K}"]`)).click();
    await settle();
    expect(info()).toContain('Går rundt: TB (4,0 m) er høyere enn fri høyde 3,7 m på Matrandvegen – +1,4 km, +2 min');
    expect(info()).toContain('U-sving ved stoppet (Blindvegen)');
    expect(drawn.markers.filter((m) => m.cls === 'rv-uturn').map((m) => [m.lon, m.lat])).toEqual([[10.008, 59.01]]);
  });

  it('close to a limit: green, with how much is left; the plain route says who shares it and its map data', async () => {
    await pick('h3.3');
    expect(thumb('h3.3').classList.contains('rv-green')).toBe(true);
    expect(info()).toContain('0,4 m å gå på under fri høyde 3,7 m på Matrandvegen');
    expect(info()).toContain('Laveste grenser: fri høyde 3,7 m (Matrandvegen)');
    expect(info()).toContain('Deles med V1, V2, V3, V4, V5, OLD');
    expect(info()).toContain('Rutet på kartdata fra 2026-10-30');
  });

  it('a route to reconfirm: orange, why, and Keep; a saved route that went round says so', async () => {
    await pick('h3');
    expect(info()).toContain('Kan være kortere for dette kjøretøyet');
    expect(info()).toContain('Gikk rundt: fri høyde 3,7 m på Matrandvegen');
    expect(q('.rv-keep')).not.toBeNull();
  });

  it('a route not yet checked against the vehicle: orange, why, no Keep', async () => {
    await pick('h2');
    expect(info()).toContain('Ikke sjekket mot kjøretøyets mål ennå');
    expect(q('.rv-keep')).toBeNull();
  });

  it('the legend has the route without limits and the U-turn', () => {
    expect(q('.rv-legend')?.textContent).toContain('Rute uten grenser (stengt)');
    expect(q('.rv-legend')?.textContent).toContain('U-sving');
  });
});

describe('final review', () => {
  it('M3: the comparison\'s "before" is the route the pattern uses (its variant), not the plain one', async () => {
    thumb('h3').click();
    await settle();
    /** @type {HTMLElement} */ (q('.rv-route')).click();
    await settle();
    expect(info()).toContain('0,9 → 2,0 km');
  });

  it('M2: the unused count is what Remove unused removes: a variant of a vehicle group on the line is used', async () => {
    const { grid } = await import('../../src/ui/grid.js');
    setTool('');
    await settle();
    for (const col of grid.cols) /** @type {any} */ (col).vehicle = 'TB';
    session.file().links[`${K}|h4`] = link(LONG, { uturn: 12 });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', altKey: true, bubbles: true, cancelable: true }));
    await settle();
    expect(info()).toContain('1 ubrukt strekning beholdt');
  });

  it('M4: a line with one group (no vehicle sizes) says nothing about sharing', async () => {
    for (const st of session.states()) { /** @type {any} */ (st.pattern).groupKey = ''; /** @type {any} */ (st.pattern).group = {}; }
    await pick('');
    expect(info()).not.toContain('Deles med');
  });
});
