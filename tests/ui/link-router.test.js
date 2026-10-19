// @vitest-environment jsdom
// Routing links as the timetable is edited (design §1, §4, §6), with a fake engine.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadAppMarkup, flush } from './dom-setup.js';
import { app } from '../../src/ui/state.js';
import { initShell } from '../../src/ui/shell.js';
import { initRouteList } from '../../src/ui/route-list.js';
import { initProjectUi, openFs } from '../../src/ui/project-ui.js';
import { initGrid, grid, render } from '../../src/ui/grid.js';
import { initFootnoteEditor } from '../../src/ui/footnote-editor.js';
import { initRouteEditor, selectRoute } from '../../src/ui/route-editor.js';
import { setQuayLookup } from '../../src/ui/quays.js';
import { initLinkRouter, linkFor, blockLink, routeAgain, linesUsing, linkBudgetLeft, saveNow } from '../../src/ui/link-router.js';
import { createMemoryFs, readText } from '../../src/project/fs.js';
import { createProject } from '../../src/project/create.js';
import { writeRoute } from '../../src/project/routes.js';
import { writeCalendars } from '../../src/project/calendars-store.js';
import { writeShapes } from '../../src/project/shapes-store.js';
import { toSaved } from '../../src/core/link-state.js';
import { ENGINE_VERSION } from '../../src/shapes/profiles.js';

const CAL = 'cccccccc-0000-4000-8000-0000000000c1';
/** A bus line with stops 1, 2, 3; times at the stops given. */
const ern = (/** @type {string} */ code, /** @type {string[]} */ times) => [
  '#LEV;T;TST', `#RUT;-1;${code};Linje ${code};;1;`, '#TRA;Tur', '#PER;;;;;;', `#KAL;${CAL}`, '#TAB;0;;;;', '#TUR;0;D;0;0;0;0',
  ...times.flatMap((tm, i) => [`#TRL;${i};NSR:Quay:${i + 1};Stopp ${i + 1};0;-1;-1;-1;0;-1`, `#TRC;0;${tm};0;0;0;0;0`]),
].join('\r\n') + '\r\n';
const POS = { 'NSR:Quay:1': [10.75, 59.91], 'NSR:Quay:2': [10.76, 59.912], 'NSR:Quay:3': [10.77, 59.915] };
const K12 = 'NSR:Quay:1|NSR:Quay:2|bus', K23 = 'NSR:Quay:2|NSR:Quay:3|bus';
const NOW = new Date('2026-10-19T12:00:00Z');

/** @type {any} */ let fs;
/** @type {string[]} */ let calls;
/** @type {Record<string, string[]>} warnings the fake engine adds per key */ let extra;
/** @type {(() => void)[]} */ let idleQueue;
let wired = false;
const engine = /** @type {any} */ ({
  tilesUsed: () => 0,
  shapeLink: async (/** @type {any} */ from, /** @type {any} */ to, /** @type {any} */ profile) => {
    const key = `${from.quayId}|${to.quayId}|${profile}`;
    calls.push(key);
    await Promise.resolve();
    return { key, status: 'OK', from, to, profile, coordinates: [[from.lon, from.lat], [to.lon, to.lat]], distanceM: 700, arriveBearing: 0,
      warnings: extra[key] ?? [], source: 'fake', engine: ENGINE_VERSION };
  },
});
const settle = async () => { for (let i = 0; i < 12; i++) await flush(); };
const wait = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));

/** @param {Record<string, string>} routes @param {Map<string, any>} [shapes] */
async function openProject(routes, shapes) {
  fs = createMemoryFs();
  await createProject(fs, { name: 'T', codespace: 'TST' });
  await writeCalendars(fs, [{ id: CAL, name: 'Vinter', ranges: [['20260101', '20261231']] }]);
  for (const [code, text] of Object.entries(routes)) await writeRoute(fs, code, text);
  if (shapes) await writeShapes(fs, shapes);
  await openFs(fs);
  /** @type {any} */ (document.getElementById('check-dlg')).close();
  await settle();
}

beforeEach(async () => {
  loadAppMarkup();
  initShell();
  initRouteList();
  await initProjectUi({ restoreLast: false });
  if (!wired) { initGrid(); initFootnoteEditor(); wired = true; }
  initRouteEditor();
  window.confirm = vi.fn(() => true);
  calls = []; extra = {}; idleQueue = [];
  setQuayLookup(async (ids) => new Map(ids.filter((id) => id in POS).map((id) => [id, { quayId: id, publicCode: '', stopPlaceId: '', stopPlaceName: id, mode: 'bus',
    lon: POS[/** @type {keyof typeof POS} */ (id)][0], lat: POS[/** @type {keyof typeof POS} */ (id)][1] }])));
  initLinkRouter({ engine, now: () => NOW, idle: (fn) => idleQueue.push(fn), restMs: 20, staleCap: 2 });
});

const saved = (/** @type {string} */ key, /** @type {Date} */ when) => {
  const [a, b] = key.split('|');
  const at = (/** @type {string} */ id) => ({ quayId: id, lon: POS[/** @type {keyof typeof POS} */ (id)][0], lat: POS[/** @type {keyof typeof POS} */ (id)][1] });
  return toSaved(/** @type {any} */ ({ key, status: 'OK', from: at(a), to: at(b), profile: 'bus', coordinates: [[0, 0], [1, 1]], distanceM: 1, arriveBearing: 0, warnings: [], source: 'x', engine: ENGINE_VERSION }), when);
};

describe('routing links as the timetable is edited', () => {
  it('opening a line routes its missing links', async () => {
    await openProject({ '50': ern('50', ['0700', '0710', '0720']) });
    await selectRoute('50');
    await settle();
    expect(calls.sort()).toEqual([K12, K23]);
    expect(linkFor(K12)?.status).toBe('OK');
  });

  it('a new time routes the new pair after the grid rests, not before, and each pair once', async () => {
    await openProject({ '50': ern('50', ['0700', '0710', '0720']) });
    await selectRoute('50');
    await settle();
    calls = [];
    grid.cols[0].cells[1] = { ...grid.cols[0].cells[1], time: '' }; // the trip now skips stop 2
    render(); render(); render(); // a paste: several renders in a row
    expect(calls).toEqual([]);
    await wait(60);
    await settle();
    expect(calls).toEqual(['NSR:Quay:1|NSR:Quay:3|bus']);
  });

  it('does not route a link that is already saved', async () => {
    await openProject({ '50': ern('50', ['0700', '0710']) }, new Map([[K12, saved(K12, NOW)]]));
    await selectRoute('50');
    await settle();
    expect(calls).toEqual([]);
  });

  it('re-routes stale links at idle time, at most the page load\'s cap', async () => {
    const old = new Date(NOW.getTime() - 200 * 86400000);
    await openProject({ '50': ern('50', ['0700', '0710', '0720']), '51': ern('51', ['0800', '0810', '0820']).replace(/NSR:Quay:1;/, 'NSR:Quay:3;') },
      new Map([[K12, saved(K12, old)], [K23, saved(K23, old)], ['NSR:Quay:3|NSR:Quay:2|bus', saved('NSR:Quay:3|NSR:Quay:2|bus', old)]]));
    await selectRoute('50');
    await settle();
    expect(calls).toEqual([]); // not at once: when the browser is idle
    for (const fn of idleQueue.splice(0)) fn();
    await settle();
    expect(calls.sort()).toEqual([K12, K23]);
    await selectRoute('51');
    await settle();
    for (const fn of idleQueue.splice(0)) fn();
    await settle();
    expect(calls).toHaveLength(2); // the cap (2 here, 100 in use) is used up
  });

  it('never re-routes a blocked link by itself; "Route again" does', async () => {
    await openProject({ '50': ern('50', ['0700', '0710']), '51': ern('51', ['0900', '0910']) });
    await selectRoute('50');
    await settle();
    blockLink(K12);
    expect(linkFor(K12)?.status).toBe('BLOCKED');
    expect(linesUsing(K12)).toBe(2);
    await saveNow();
    expect(JSON.parse(await readText(fs, 'data/shapes.json')).shapes[K12].status).toBe('BLOCKED');
    calls = [];
    await selectRoute('51');
    render();
    await wait(60); await settle();
    for (const fn of idleQueue.splice(0)) fn();
    await settle();
    expect(calls).toEqual([]);
    routeAgain(K12);
    await settle();
    expect(calls).toEqual([K12]);
    expect(linkFor(K12)?.status).toBe('OK');
  });

  it('a result that arrives after another project was opened is not saved in the new one', async () => {
    await openProject({ '50': ern('50', ['0700', '0710']) });
    let release = () => {};
    const slow = { ...engine, shapeLink: (/** @type {any} */ f, /** @type {any} */ t, /** @type {any} */ p) => new Promise((res) => { release = () => res(engine.shapeLink(f, t, p)); }) };
    initLinkRouter({ engine: slow, now: () => NOW, idle: (fn) => idleQueue.push(fn), restMs: 20 });
    await selectRoute('50');
    await settle();
    const first = fs;
    await openProject({ '60': ern('60', ['0700']) });
    release();
    await settle(); await wait(500);
    expect(app.shapes.has(K12)).toBe(false);
    expect(await readText(fs, 'data/shapes.json')).toBeNull();
    expect(fs).not.toBe(first);
  });

  it('a read-only line routes and draws, but saves nothing', async () => {
    await openProject({ '50': ern('50', ['0700', '0710']) });
    await selectRoute('50');
    await settle(); await wait(50); // the writable line's own routing is done first
    grid.readOnly = true;
    app.shapes.clear();
    routeAgain(K12);
    await settle(); await wait(500);
    expect(linkFor(K12)?.status).toBe('OK');
    expect(app.shapes.has(K12)).toBe(false);
    expect(JSON.parse(/** @type {string} */ (await readText(fs, 'data/shapes.json'))).shapes[K12]).toBeUndefined(); // the read-only result is not saved
    grid.readOnly = false;
  });

  it('stops background routing when the tile budget is used up', async () => {
    const old = new Date(NOW.getTime() - 200 * 86400000);
    await openProject({ '50': ern('50', ['0700', '0710', '0720']) }, new Map([[K12, saved(K12, old)], [K23, saved(K23, old)]]));
    extra[K12] = ['tile budget used']; extra[K23] = ['tile budget used'];
    initLinkRouter({ engine, now: () => NOW, idle: (fn) => idleQueue.push(fn), restMs: 20, staleCap: 100 });
    await selectRoute('50');
    await settle();
    for (const fn of idleQueue.splice(0)) fn();
    await settle();
    expect(linkBudgetLeft()).toBe(false);
    expect(calls).toHaveLength(1);
  });
});

describe('the final review\'s fixes (router)', () => {
  it('I2: opening another project drops the old project\'s queued links', async () => {
    await openProject({ '50': ern('50', ['0700', '0710', '0720']) });
    /** @type {(() => void)[]} */
    const releases = [];
    let asked = 0;
    const slow = { ...engine, shapeLink: (/** @type {any} */ f, /** @type {any} */ t, /** @type {any} */ p) => new Promise((res) => { asked++; releases.push(() => res(engine.shapeLink(f, t, p))); }) };
    initLinkRouter({ engine: slow, now: () => NOW, idle: (fn) => idleQueue.push(fn), restMs: 20 });
    await selectRoute('50');
    await settle();
    expect(asked).toBe(1); // one in flight, one queued
    await openProject({ '60': ern('60', ['0700']) });
    for (const r of releases.splice(0)) r();
    await settle(); await wait(50); await settle();
    for (const r of releases.splice(0)) r();
    await settle(); await wait(500);
    expect(asked).toBe(1); // the queued pair of the old project was never routed
    expect(app.shapes.size).toBe(0);
  });

  it('I3: an engine that cannot start (offline) leaves ERROR links, and routing works once it can', async () => {
    let online = false;
    initLinkRouter({ makeEngine: async () => { if (!online) throw new Error('offline'); return engine; }, now: () => NOW, idle: (fn) => idleQueue.push(fn), restMs: 20 });
    await openProject({ '50': ern('50', ['0700', '0710']) });
    await selectRoute('50');
    await settle();
    expect(linkFor(K12)?.status).toBe('ERROR');
    online = true;
    routeAgain(K12);
    await settle();
    expect(linkFor(K12)?.status).toBe('OK');
  });

  it('I4: with a raster map (no vector tiles) links are NOT_SHAPED, "no vector tiles"', async () => {
    initLinkRouter({ makeEngine: async () => null, now: () => NOW, idle: (fn) => idleQueue.push(fn), restMs: 20 });
    await openProject({ '50': ern('50', ['0700', '0710']) });
    await selectRoute('50');
    await settle();
    expect(linkFor(K12)?.status).toBe('NOT_SHAPED');
    expect(linkFor(K12)?.warnings).toContain('no vector tiles');
  });

  it('I5: "Route missing links" saves links even while a read-only line is open', async () => {
    const { routeMissingForExport } = await import('../../src/ui/link-router.js');
    await openProject({ '50': ern('50', ['0700', '0710']), '51': ern('51', ['0800', '0810']) });
    await selectRoute('50');
    await settle();
    app.shapes.clear();
    grid.readOnly = true;
    await routeMissingForExport(['51']);
    grid.readOnly = false;
    expect(app.shapes.get(K12)?.status).toBe('OK');
  });
});
