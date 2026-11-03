// The routing session with vehicle groups (backlog 92, 93, 107; design 2026-11-03 §5–§9): Route passes the group's sizes
// and U-turn length, Accept writes the plain link or the group's variant, Keep confirms a route for a group, and the
// automatic check records the limits along routes saved before 2.6.1. On a fake router.
import { describe, it, expect, vi } from 'vitest';
import { createRoutingSession } from '../../src/routing/session.js';
import { encodePolyline } from '../../src/routing/geometry.js';

const QUAYS = new Map([['NSR:Quay:1', { lon: 11.0, lat: 59.0 }], ['NSR:Quay:2', { lon: 11.01, lat: 59.0 }]]);
const PAIR = 'NSR:Quay:1|NSR:Quay:2|bus';
const VEHICLES = [
  { name: 'TB', height: 4, width: null, length: null, weight: null },
  { name: 'LB', height: 3, width: null, length: null, weight: null },
  { name: 'Mini', height: 2.8, width: null, length: 8, weight: null },
];
const CAL = [{ id: 'c', name: 'Jan', ranges: /** @type {[string, string][]} */ ([['20260101', '20260131']]) }];
const NOW = () => new Date('2026-11-03T12:00:00Z');
const SHORT = /** @type {[number, number][]} */ ([[11.0, 59.0], [11.005, 59.0], [11.01, 59.0]]);
const LONG = /** @type {[number, number][]} */ ([[11.0, 59.0], [11.005, 59.004], [11.01, 59.0]]);
const H37 = { height: { kind: 'height', value: 3.7, way: 77, road: 'Matrandvegen', at: [11.007, 59.0] } };

/** One trip from Quay 1 to Quay 2 per vehicle name ('' = none). @param {string[]} vehicles */
function line(vehicles) {
  const stops = [{ name: 'A', stopId: 'NSR:Quay:1', isDwellArr: false }, { name: 'B', stopId: 'NSR:Quay:2', isDwellArr: false }];
  const cols = vehicles.map((v, i) => ({ uid: `t${i}`, dayCode: 'D', vehicle: v, cells: [{ time: '0700', dayOffset: 0 }, { time: '0710', dayOffset: 0 }] }));
  return { mode: 'bus', submode: 'localBus', tableSets: [{ id: 0, name: 'T' }], periods: [{ id: 0, setId: 0, calendarIds: ['c'] }], grids: { '0:0': { stops, cols } } };
}
/** A saved link along coords. @param {[number, number][]} coords @param {any} [extra] */
const saved = (coords, extra = {}) => ({ polyline: encodePolyline(coords, 6), precision: 6, distanceM: 600, status: 'OK', from: [11.0, 59.0], to: [11.01, 59.0], seconds: 60, ...extra });
/** A router answering every chain with one leg along coords. @param {[number, number][]} coords @param {any} [legExtra] */
function router(coords = SHORT, legExtra = {}) {
  return {
    has: () => true,
    addTiles: vi.fn(async () => []),
    route: vi.fn(async (/** @type {any[]} */ chain) => ({ ok: true, ms: 1, settled: 1, flags: [[]],
      legs: [{ metres: 600, ferryMetres: 0, seconds: 60, coords, roads: ['Matrandvegen'], limits: {}, edges: [1, 2], uturns: [], ...legExtra }],
      snaps: chain.map((p) => ({ way: 1, lon: p.lon, lat: p.lat, along: true, off: 3, road: 'Matrandvegen', radius: 75 })) })),
    place: vi.fn(async () => ({ limits: H37, matched: true })),
  };
}
const MANIFEST = { format: '2', set: 'road', built: '2026-11-01T00:00:00Z', dataDate: '', tileLon: 0.25, tileLat: 0.125, tiles: {} };
function tiles({ offline = false } = {}) {
  return {
    open: vi.fn(async () => { if (offline) throw new Error('routing-offline'); return { manifest: MANIFEST, newer: false }; }),
    loadTile: vi.fn(async () => new ArrayBuffer(0)),
    stats: () => ({ downloaded: 0, bytes: 0, cached: 0 }),
    published: vi.fn(async () => (offline ? null : MANIFEST)),
    saved: async () => {},
  };
}
/** @param {string[]} vehicles @param {any} [links] @param {any} [opts] */
function session(vehicles, links = {}, { r = router(), t = tiles() } = {}) {
  const s = createRoutingSession({ code: 'L1', rs: line(vehicles), setId: 0, calendars: CAL, quayInfo: QUAYS, vehicles: VEHICLES,
    lineLinks: { version: 1, line: 'L1', links, snaps: {} }, router: /** @type {any} */ (r), tiles: /** @type {any} */ (t), now: NOW });
  return Object.assign(s, { r, t });
}
const only = (/** @type {any} */ s) => s.states()[0];

describe('Route passes the vehicle group', () => {
  it('a 4 m vehicle: its sizes and the 12 m default U-turn length', async () => {
    const s = session(['TB']);
    await s.route(only(s).pattern.id);
    expect(s.r.route.mock.calls[0][1]).toEqual({ vehicle: { height: 4 }, uturnLength: 12 });
  });

  it('no vehicle: no sizes, the default U-turn length', async () => {
    const s = session(['']);
    await s.route(only(s).pattern.id);
    expect(s.r.route.mock.calls[0][1]).toEqual({ uturnLength: 12 });
  });

  it('a minibus: its own length', async () => {
    const s = session(['Mini']);
    await s.route(only(s).pattern.id);
    expect(s.r.route.mock.calls[0][1]).toEqual({ vehicle: { height: 2.8, length: 8 }, uturnLength: 8 });
  });
});

describe('Accept: the plain link or the group\'s own (§7)', () => {
  it('a 4 m route that went round becomes the variant, with what blocked it; the plain link stays as it was', async () => {
    const plain = saved(SHORT, { limits: H37 });
    const s = session(['TB'], { [PAIR]: plain }, { r: router(LONG, { around: [H37.height], free: SHORT }) });
    const id = only(s).pattern.id;
    await s.route(id);
    const file = /** @type {any} */ (await s.accept(id));
    expect(file.links[PAIR]).toBe(plain);
    expect(file.links[`${PAIR}|h4`]).toMatchObject({ around: [{ value: 3.7, way: 77 }], uturn: 12, limits: { built: MANIFEST.built } });
    expect(file.links[`${PAIR}|h4`].free).toBeUndefined();
    expect(file.links[`${PAIR}|h4`].edges).toBeUndefined();
    expect(file.patterns[id]).toMatchObject({ keys: [`${PAIR}|h4`], vehicle: 'h4' });
    expect(only(s).state).toBe('green');
  });

  it('a 3 m route equal to the plain link: the plain link, no variant', async () => {
    const plain = saved(SHORT, { limits: H37 });
    const s = session(['LB'], { [PAIR]: plain });
    const id = only(s).pattern.id;
    await s.route(id);
    const file = /** @type {any} */ (await s.accept(id));
    expect(Object.keys(file.links)).toEqual([PAIR]);
    expect(file.links[PAIR].kept).toBeUndefined();
  });

  it('a minibus route equal to the plain link (not provable: it may turn): the plain link, kept for the minibus', async () => {
    const s = session(['Mini'], { [PAIR]: saved(SHORT, { limits: {} }) });
    const id = only(s).pattern.id;
    expect(only(s).legs[0].state).toBe('reconfirm');
    await s.route(id);
    const file = /** @type {any} */ (await s.accept(id));
    expect(Object.keys(file.links)).toEqual([PAIR]);
    expect(file.links[PAIR].kept).toEqual(['h2.8l8']);
    expect(only(s).state).toBe('green');
  });

  it('a 4 m route that did not go round, at the default U-turn length, is the plain link', async () => {
    const s = session(['TB']);
    const id = only(s).pattern.id;
    await s.route(id);
    const file = /** @type {any} */ (await s.accept(id));
    expect(Object.keys(file.links)).toEqual([PAIR]);
    expect(file.links[PAIR]).toMatchObject({ uturn: 12, limits: { built: MANIFEST.built } });
  });

  it('a route equal to a plain link saved before 2.6.1 records the limits without changing a metre', async () => {
    const old = saved(SHORT);
    const s = session([''], { [PAIR]: old }, { r: router(SHORT, { limits: H37 }) });
    const id = only(s).pattern.id;
    await s.route(id);
    const file = /** @type {any} */ (await s.accept(id));
    expect(file.links[PAIR]).toMatchObject({ polyline: old.polyline, distanceM: old.distanceM, limits: { height: { value: 3.7 } } });
  });
});

describe('Keep on a route to reconfirm', () => {
  it('a 3 m vehicle on the 4 m route (it went round): Keep confirms it for the 3 m group', () => {
    const s = session(['LB'], { [`${PAIR}|h4`]: saved(LONG, { limits: {}, uturn: 12, around: [H37.height] }) });
    expect(only(s).legs[0].state).toBe('reconfirm');
    const file = /** @type {any} */ (s.keep(only(s).pattern.id));
    expect(file.links[`${PAIR}|h4`].kept).toEqual(['h3']);
    expect(only(s).state).toBe('green');
  });
});

describe('the automatic check when Routing opens (§8)', () => {
  it('a route saved before 2.6.1 used by a sized trip: placed, its limits recorded, nothing else changed', async () => {
    const old = saved(SHORT);
    const s = session(['TB'], { [PAIR]: old });
    expect(only(s).legs[0].state).toBe('unchecked');
    const file = /** @type {any} */ (await s.checkLimits());
    expect(s.r.place).toHaveBeenCalledTimes(1);
    expect(file.links[PAIR]).toEqual({ ...old, limits: { ...H37, built: MANIFEST.built } });
    expect(only(s).legs[0].state).toBe('over');
  });

  it('offline: nothing, and the route stays unchecked (Review Focus 5)', async () => {
    const s = session(['TB'], { [PAIR]: saved(SHORT) }, { t: tiles({ offline: true }) });
    expect(await s.checkLimits()).toBeNull();
    expect(only(s).legs[0].state).toBe('unchecked');
  });

  it('no trip with a sized vehicle: no map data fetched', async () => {
    const s = session([''], { [PAIR]: saved(SHORT) });
    expect(await s.checkLimits()).toBeNull();
    expect(s.t.open).not.toHaveBeenCalled();
  });

  it('limits read from the published build already: nothing to do', async () => {
    const s = session(['TB'], { [PAIR]: saved(SHORT, { limits: { built: MANIFEST.built } }) });
    expect(await s.checkLimits()).toBeNull();
    expect(s.r.place).not.toHaveBeenCalled();
  });
});
