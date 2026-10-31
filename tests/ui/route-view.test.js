// @vitest-environment jsdom
// The routing editor (2026-10-31): Ruting as a view of its own — patterns as thumbnails, the selected pattern's stops
// beside a map, layered info, and Route → Accept / Discard / Keep. Nothing is written without Accept or Keep.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { encodePolyline } from '../../src/routing/geometry.js';

/** What the view draws on the (mocked) map. */
const drawn = { links: /** @type {any[]} */ ([]), markers: /** @type {any[]} */ ([]), labels: /** @type {any[]} */ ([]), linkClick: /** @type {Function[]} */ ([]) };
vi.mock('../../src/ui/map-view.js', () => ({
  createMapView: () => {
    const noop = () => {};
    const o = {
      setLinks: (/** @type {any[]} */ l) => { drawn.links = l; },
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
const { initRouteView } = await import('../../src/ui/route-view.js');
const { setQuayLookup } = await import('../../src/ui/quays.js');
const { createMemoryFs, readText } = await import('../../src/project/fs.js');
const { createProject } = await import('../../src/project/create.js');
const { writeRoute, readRoute } = await import('../../src/project/routes.js');
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

/**
 * A session the view drives: pattern A (1 2 3, not routed: red) and pattern B (1 3, routed but a stop has moved:
 * orange). Route proposes straight links; Accept moves them into the file; Keep marks B reviewed.
 */
function fakeSession() {
  const stop = (/** @type {string} */ id) => ({ stopId: id, quay: { quayId: id, lon: POS[id][0], lat: POS[id][1] }, name: `Stopp ${id.slice(9)}` });
  const A = { id: 'A', stops: ['NSR:Quay:1', 'NSR:Quay:2', 'NSR:Quay:3'].map(stop), keys: [K1, K2], trips: ['u1'] };
  const B = { id: 'B', stops: ['NSR:Quay:1', 'NSR:Quay:3'].map(stop), keys: [K13], trips: ['u2'] };
  /** @type {any} */
  let file = { version: 1, line: '50', links: { [K13]: link(K13) }, snaps: {} };
  let bReviewed = false;
  /** @type {Map<string, any>} */
  const proposals = new Map();
  const legState = (/** @type {string} */ k) => (!file.links[k] ? 'none' : k === K13 && !bReviewed ? 'moved' : 'routed');
  const states = () => [A, B].map((p) => {
    const legs = p.keys.map((k) => ({ key: k, state: legState(k) }));
    const state = legs.some((l) => l.state === 'none') ? 'red' : legs.some((l) => l.state === 'moved') ? 'orange' : 'green';
    return { pattern: p, state, legs, saved: null, proposal: proposals.get(p.id) ?? null };
  });
  const s = {
    open: vi.fn(async () => {}),
    states,
    proposal: (/** @type {string} */ id) => proposals.get(id) ?? null,
    route: vi.fn(async (/** @type {string} */ id) => {
      const p = /** @type {any} */ ([A, B].find((x) => x.id === id));
      proposals.set(id, { legs: new Map(p.keys.map((/** @type {string} */ k) => [k, link(k, { distanceM: 1500 })])), via: new Map(), old: new Map() });
    }),
    setWaypoints: vi.fn(async (/** @type {string} */ id, /** @type {string} */ key, /** @type {any} */ via) => {
      const pr = proposals.get(id) ?? { legs: new Map(), via: new Map(), old: new Map() };
      pr.via.set(key, via);
      proposals.set(id, pr);
    }),
    accept: vi.fn(async (/** @type {string} */ id) => {
      const pr = proposals.get(id);
      file = { ...file, links: { ...file.links, ...Object.fromEntries(pr?.legs ?? []) } };
      proposals.delete(id);
      return file;
    }),
    keep: vi.fn(() => { bReviewed = true; return file; }),
    discard: vi.fn((/** @type {string} */ id) => { proposals.delete(id); }),
    pending: () => [...proposals.keys()],
    newerMap: () => false,
    updateAll: vi.fn(async () => file),
    file: () => file,
    close: vi.fn(),
  };
  return s;
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
  initRouteView({ createSession: () => /** @type {any} */ (session) });
  setTool('');
  drawn.links = []; drawn.markers = []; drawn.labels = [];
  window.confirm = vi.fn(() => true);
  setQuayLookup(async (ids) => new Map(ids.map((id) => [id, { quayId: id, publicCode: 'A', stopPlaceId: 'NSR:StopPlace:1', stopPlaceName: id, mode: 'bus',
    lon: POS[id]?.[0] ?? 0, lat: POS[id]?.[1] ?? 0 }])));
  fs = createMemoryFs();
  await createProject(fs, { name: 'Test', codespace: 'TST' });
  await writeCalendars(fs, [{ id: 'cal-vinter', name: 'Vinter', ranges: [['20260101', '20260630']] }]);
  await writeRoute(fs, '50', ROUTE);
  await openFs(fs);
  /** @type {any} */ (document.getElementById('check-dlg')).close();
  await settle();
  await selectRoute('50');
  await settle();
  app.settings.autoRoute = false;
});

/** Open the view and wait for it. */
async function open() {
  press('l', { altKey: true });
  await settle();
}

describe('the routing view', () => {
  it('Alt+L opens it in place of the timetable, for a line on roads only', async () => {
    expect(toolBtn().title).toBe('Alt+L');
    await open();
    expect(activeTool()).toBe('route');
    expect(document.body.classList.contains('route-on')).toBe(true);
    expect(session.open).toHaveBeenCalled();
    expect(rv().textContent).toContain('© OpenStreetMap');
    press('Escape');
    await settle();
    expect(activeTool()).toBe('');
    expect(document.body.classList.contains('route-on')).toBe(false);
    expect(session.close).toHaveBeenCalled();
    app.routeState.mode = 'rail';
    refreshAll();
    expect(toolBtn().disabled).toBe(true);
    press('l', { altKey: true });
    expect(activeTool()).toBe('');
  });

  it('one thumbnail per pattern, framed by its state; with nothing selected the info sums up the table set', async () => {
    await open();
    expect(thumbs().map((el) => [el.dataset.id, el.classList.contains('rv-red'), el.classList.contains('rv-orange')])).toEqual([['A', true, false], ['B', false, true]]);
    expect(thumbs()[0].querySelector('svg path')?.getAttribute('d')).toMatch(/^M /);
    expect(q('.rv-info')?.textContent).toContain('2 mønstre: 0 rutet, 1 å sjekke, 1 ikke rutet');
    expect(q('.rv-stops')?.textContent).toContain('Velg et mønster');
  });

  it('selecting a pattern lists its stops, draws its legs with the stop names and the other pattern faint', async () => {
    await open();
    thumbs()[0].click();
    await settle();
    expect(thumbs()[0].classList.contains('on')).toBe(true);
    expect([...rv().querySelectorAll('.rv-st')].map((el) => el.textContent)).toEqual(['Stopp 1', 'Stopp 2', 'Stopp 3']);
    expect(drawn.links.filter((l) => l.state !== 'faint').map((l) => [l.key, l.state])).toEqual([[K1, 'failed'], [K2, 'failed']]);
    expect(drawn.links.filter((l) => l.state === 'faint').map((l) => l.key)).toEqual([K13]);
    expect(drawn.labels.map((s) => [s.n, s.name])).toEqual([[1, 'Stopp 1'], [2, 'Stopp 2'], [3, 'Stopp 3']]);
    expect(q('.rv-info')?.textContent).toContain('3 stopp');
    expect(q('.rv-info')?.textContent).toContain('Ikke rutet ennå');
  });

  it('a leg selected (stop list or map) adds its info below the pattern’s; Esc steps back leg → pattern → nothing → leave', async () => {
    await open();
    thumbs()[1].click();
    await settle();
    /** @type {HTMLElement} */ (q(`.rv-gap[data-key="${K13}"]`)).click();
    await settle();
    expect(drawn.links.find((l) => l.key === K13).state).toBe('selected');
    expect(q('.rv-info')?.textContent).toContain('2 stopp');
    expect(q('.rv-leg-info')?.textContent).toContain('Stopp 1 – Stopp 3');
    expect(q('.rv-leg-info')?.textContent).toContain('1,2 km');
    expect(q('.rv-leg-info')?.textContent).toContain('Et stopp er flyttet i NSR');
    // no snaps saved yet: no distance from the road is shown
    expect(q('.rv-leg-info')?.textContent).not.toContain('fra veien');
    press('Escape');
    await settle();
    expect(q('.rv-leg-info')).toBeNull();
    expect(thumbs()[1].classList.contains('on')).toBe(true);
    press('Escape');
    await settle();
    expect(thumbs().some((el) => el.classList.contains('on'))).toBe(false);
    expect(activeTool()).toBe('route');
    press('Escape');
    await settle();
    expect(activeTool()).toBe('');
  });

  it('Route proposes, Accept writes the links file and the thumbnail turns green', async () => {
    await open();
    thumbs()[0].click();
    await settle();
    expect(btn('.rv-accept')).toBeNull();
    /** @type {HTMLButtonElement} */ (btn('.rv-route')).click();
    await settle();
    expect(session.route).toHaveBeenCalledWith('A', undefined);
    expect(q('.rv-info')?.textContent).toContain('Ruten endres slik');
    expect(await readText(fs, 'data/links/50.json')).toBeNull();
    /** @type {HTMLButtonElement} */ (btn('.rv-accept')).click();
    await settle();
    expect(JSON.parse(await readText(fs, 'data/links/50.json')).links[K1].distanceM).toBe(1500);
    expect(app.lineLinks.get('50')?.links[K1].distanceM).toBe(1500);
    expect(thumbs()[0].classList.contains('rv-green')).toBe(true);
  });

  it('Discard drops the proposal and writes nothing', async () => {
    await open();
    thumbs()[0].click();
    await settle();
    /** @type {HTMLButtonElement} */ (btn('.rv-route')).click();
    await settle();
    /** @type {HTMLButtonElement} */ (btn('.rv-discard')).click();
    await settle();
    expect(session.discard).toHaveBeenCalledWith('A');
    expect(btn('.rv-accept')).toBeNull();
    expect(await readText(fs, 'data/links/50.json')).toBeNull();
  });

  it('Keep on an orange pattern writes it reviewed; it turns green', async () => {
    await open();
    thumbs()[1].click();
    await settle();
    /** @type {HTMLButtonElement} */ (btn('.rv-keep')).click();
    await settle();
    expect(session.keep).toHaveBeenCalledWith('B');
    expect(await readText(fs, 'data/links/50.json')).not.toBeNull();
    expect(thumbs()[1].classList.contains('rv-green')).toBe(true);
  });

  it('leaving or switching pattern with a proposal asks first; No stays, and leaving writes nothing (Review Focus 2)', async () => {
    await open();
    thumbs()[0].click();
    await settle();
    /** @type {HTMLButtonElement} */ (btn('.rv-route')).click();
    await settle();
    window.confirm = vi.fn(() => false);
    thumbs()[1].click();
    await settle();
    expect(window.confirm).toHaveBeenCalledWith('Bytte uten å godta rutingen?');
    expect(thumbs()[0].classList.contains('on')).toBe(true);
    /** @type {HTMLButtonElement} */ (btn('.rv-x')).click();
    await settle();
    expect(window.confirm).toHaveBeenLastCalledWith('Gå ut uten å godta rutingen?');
    expect(activeTool()).toBe('route');
    window.confirm = vi.fn(() => true);
    /** @type {HTMLButtonElement} */ (btn('.rv-x')).click();
    await settle();
    expect(activeTool()).toBe('');
    expect(await readText(fs, 'data/links/50.json')).toBeNull();
    expect(app.lineLinks.has('50')).toBe(false);
  });

  it('a click selects a leg on the map, a second adds a waypoint; Delete removes the selected waypoint', async () => {
    await open();
    thumbs()[0].click();
    await settle();
    drawn.linkClick.at(-1)?.(K1, [10.005, 59]);
    await settle();
    expect(drawn.links.find((l) => l.key === K1).state).toBe('selected');
    drawn.linkClick.at(-1)?.(K1, [10.005, 59.001]);
    await settle();
    expect(session.setWaypoints).toHaveBeenLastCalledWith('A', K1, [[10.005, 59.001]]);
    expect(q('.rv-leg-info')?.textContent).toContain('Trykk Finn rute');
    const wp = drawn.markers.find((m) => m.draggable);
    wp.onDragEnd([10.006, 59.002]);
    await settle();
    expect(session.setWaypoints).toHaveBeenLastCalledWith('A', K1, [[10.006, 59.002]]);
    drawn.markers.find((m) => m.draggable).onClick(new MouseEvent('click'));
    press('Delete');
    await settle();
    expect(session.setWaypoints).toHaveBeenLastCalledWith('A', K1, []);
  });

  it('Update all only with automatic routing on', async () => {
    await open();
    expect(btn('.rv-all')).toBeNull();
    setTool('');
    app.settings.autoRoute = true;
    await open();
    /** @type {HTMLButtonElement} */ (btn('.rv-all')).click();
    await settle();
    expect(session.updateAll).toHaveBeenCalled();
    expect(await readText(fs, 'data/links/50.json')).not.toBeNull();
  });

  it('final review 3: while it routes, picking another pattern does nothing (no hidden proposal left behind)', async () => {
    /** @type {(v?: any) => void} */
    let finish = () => {};
    await open();
    thumbs()[0].click();
    await settle();
    session.route = vi.fn(() => new Promise((r) => { finish = r; }));
    /** @type {HTMLButtonElement} */ (btn('.rv-route')).click();
    await settle();
    thumbs()[1].click();
    await settle();
    expect(window.confirm).not.toHaveBeenCalled();
    expect(thumbs()[0].classList.contains('on')).toBe(true);
    finish();
    await settle();
  });

  it('final review 3: leaving while Update all runs asks; its result is not written once the view has closed', async () => {
    /** @type {(v?: any) => void} */
    let finish = () => {};
    app.settings.autoRoute = true;
    await open();
    session.updateAll = vi.fn(() => new Promise((r) => { finish = r; }));
    /** @type {HTMLButtonElement} */ (btn('.rv-all')).click();
    await settle();
    /** @type {HTMLButtonElement} */ (btn('.rv-x')).click();
    await settle();
    expect(window.confirm).toHaveBeenCalledWith('Gå ut uten å godta rutingen?');
    expect(activeTool()).toBe('');
    finish(session.file());
    await settle();
    expect(await readText(fs, 'data/links/50.json')).toBeNull();
  });

  it('while open, Ctrl+S saves nothing', async () => {
    const before = await readRoute(fs, '50');
    app.dirty = true;
    await open();
    press('s', { ctrlKey: true });
    await settle();
    expect(await readRoute(fs, '50')).toBe(before);
  });
});
