import { describe, it, expect, vi } from 'vitest';
import { createRouter, routeWithTiles } from '../../src/routing/router-core.js';
import { legFlags } from '../../src/routing/flags.js';
import { encodeTile } from './helpers/encode-tile.js';
import { tileOf, M_LAT, M_LON } from './helpers/graph.js';

const LAT = 59.91, LON = 10.75;
/** @returns {[number, number]} */
const P = (x, y) => [LON + x * M_LON, LAT + y * M_LAT];
const stop = (x, y) => ({ lon: P(x, y)[0], lat: P(x, y)[1] });

describe('legFlags', () => {
  const leg = (metres) => ({ metres, ferryMetres: 0, seconds: 0, coords: [], roads: [] });
  const a = { lon: LON, lat: LAT }, b = { lon: P(1000, 0)[0], lat: LAT };
  it('flags a detour over twice the straight line and over 300 m', () => {
    expect(legFlags(leg(2100), a, b, { off: 3 })).toEqual(['detour']);
    expect(legFlags(leg(1900), a, b, { off: 3 })).toEqual([]);
    const near = { lon: P(100, 0)[0], lat: LAT };
    expect(legFlags(leg(290), a, near, { off: 3 })).toEqual([]);
  });
  it('flags a stop snapped more than 25 m away', () => {
    expect(legFlags(leg(1000), a, b, { off: 26 })).toEqual(['far-snap']);
    expect(legFlags(leg(1000), a, b, { off: 25 })).toEqual([]);
  });
});

describe('router core', () => {
  // A street (0,0)-(1000,0), way 1, and a separate street far north, way 2.
  const tile = () => tileOf({
    nodes: [P(0, 0), P(1000, 0), P(0, 2000), P(1000, 2000)],
    edges: [{ from: 0, to: 1, way: 1, name: 1 }, { from: 2, to: 3, way: 2 }],
    names: ['', 'Storgata'],
  });

  it('routes with flags per leg', () => {
    const router = createRouter();
    expect(router.addTiles([{ key: 'a', buf: tile() }])).toEqual(['a']);
    expect(router.has('a')).toBe(true);
    const r = router.route([stop(100, -5), stop(500, -30), stop(900, -5)]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.legs).toHaveLength(2);
    expect(r.flags).toEqual([['far-snap'], []]);
  });

  it('names the leg that cannot be routed and reports no legs', () => {
    const router = createRouter();
    router.addTiles([{ key: 'a', buf: tile() }]);
    const r = router.route([stop(100, -5), stop(900, -5), stop(500, 1995)]);
    expect(r).toEqual({ ok: false, error: 'no-route', leg: 1 });
  });

  it('falls back to candidates when a saved snap\'s way is gone', () => {
    const router = createRouter();
    router.addTiles([{ key: 'a', buf: tile() }]);
    const fixed = { way: 77, lon: P(500, 0)[0], lat: LAT, along: true, off: 5, road: 'Storgata' };
    const r = router.route([stop(100, -5), { ...stop(500, -5), fixed }, stop(900, -5)]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.snaps[1].refLost).toBe(true);
    expect(r.snaps[1].way).toBe(1);
  });

  it('uses a saved snap when its way is there', () => {
    const router = createRouter();
    router.addTiles([{ key: 'a', buf: tile() }]);
    const fixed = { way: 1, lon: P(600, 0)[0], lat: LAT, along: true, off: 5, road: 'Storgata' };
    const r = router.route([stop(100, -5), { ...stop(500, -5), fixed }, stop(900, -5)]);
    if (!r.ok) throw new Error('no route');
    expect(r.snaps[1].refLost).toBeUndefined();
    expect(r.legs[0].metres).toBeCloseTo(500, 0);
  });
});

describe('routeWithTiles', () => {
  // A small grid (0.01°) so the road between two stops runs through a tile three rings out.
  const near = encodeTile({
    nodes: [[10.801, 59.905], [10.803, 59.905], [10.803, 59.93, 1], [10.807, 59.905], [10.809, 59.905], [10.807, 59.93, 1]],
    attrs: [{ cls: 2 }],
    edges: [{ from: 0, to: 1, len: 112, way: 1 }, { from: 1, to: 2, len: 2780, way: 2 }, { from: 3, to: 4, len: 112, way: 3 }, { from: 3, to: 5, len: 2780, way: 4 }],
  });
  const far = encodeTile({
    nodes: [[10.803, 59.93, 1], [10.803, 59.935], [10.807, 59.935], [10.807, 59.93, 1]],
    attrs: [{ cls: 2 }],
    edges: [{ from: 0, to: 1, len: 556, way: 2 }, { from: 1, to: 2, len: 224, way: 5 }, { from: 2, to: 3, len: 556, way: 4 }],
  });
  const manifest = { tileLon: 0.01, tileLat: 0.01, tiles: { '1080_5990': {}, '1080_5993': {} } };

  it('a vehicle that has no route yet loads more map data before calling it no route for this vehicle', async () => {
    // the same tiles, plus a low road (3.7 m) straight between the two streets in the near tile
    const low = encodeTile({
      nodes: [[10.801, 59.905], [10.803, 59.905], [10.803, 59.93, 1], [10.807, 59.905], [10.809, 59.905], [10.807, 59.93, 1]],
      attrs: [{ cls: 2 }, { cls: 2, maxheight: 3.7 }],
      edges: [{ from: 0, to: 1, len: 112, way: 1 }, { from: 1, to: 2, len: 2780, way: 2 }, { from: 3, to: 4, len: 112, way: 3 },
        { from: 3, to: 5, len: 2780, way: 4 }, { from: 1, to: 3, len: 223, attr: 1, way: 6 }],
    });
    const chain = [{ lon: 10.8015, lat: 59.9049 }, { lon: 10.8085, lat: 59.9049 }];
    const r = /** @type {any} */ (await routeWithTiles(createRouter(), manifest, chain, async (key) => (key === '1080_5990' ? low : far), 3, { vehicle: { height: 4 } }));
    expect(r.ok).toBe(true);
    expect(r.legs[0].metres).toBeGreaterThan(6000);
    expect(r.legs[0].around).toEqual([expect.objectContaining({ kind: 'height', value: 3.7, way: 6 })]);
    const plain = /** @type {any} */ (await routeWithTiles(createRouter(), manifest, chain, async (key) => (key === '1080_5990' ? low : far), 3));
    expect(plain.legs[0].metres).toBeLessThan(1000);
  });

  it('widens the ring until the road is found, joining the tiles at their border', async () => {
    const router = createRouter();
    const loadTile = vi.fn(async (key) => (key === '1080_5990' ? near : far));
    const chain = [{ lon: 10.8015, lat: 59.9049 }, { lon: 10.8085, lat: 59.9049 }];
    const r = await routeWithTiles(router, manifest, chain, loadTile, 3);
    expect(r.ok).toBe(true);
    expect(loadTile.mock.calls.map((c) => c[0])).toEqual(['1080_5990', '1080_5993']);
    if (r.ok) expect(r.legs[0].metres).toBeGreaterThan(6000);
  });

  it('gives up after the widest ring', async () => {
    const router = createRouter();
    const chain = [{ lon: 10.8015, lat: 59.9049 }, { lon: 10.8085, lat: 59.9049 }];
    const r = await routeWithTiles(router, manifest, chain, async () => near, 2);
    expect(r).toMatchObject({ ok: false, error: 'no-route' });
  });
});

describe('why a route goes round (backlog 92): the limited run, then one without limits', () => {
  // A(0,0) to B(1000,0): the short road passes under a 3.7 m bridge (way 77, Matrandvegen) on M(500,0) - B; the long
  // road A - N(500,600) - B has no limits.
  const roads = () => tileOf({
    nodes: [P(0, 0), P(500, 0), P(1000, 0), P(500, 600)],
    attrs: [{ cls: 2 }, { cls: 2, maxheight: 3.7 }],
    names: ['', 'Matrandvegen', 'Hesbølvegen'],
    edges: [{ from: 0, to: 1, way: 76, name: 1 }, { from: 1, to: 2, attr: 1, way: 77, name: 1 },
      { from: 0, to: 3, way: 80, name: 2 }, { from: 3, to: 2, way: 81, name: 2 }],
  });
  const router = () => { const r = createRouter(); r.addTiles([{ key: 'a', buf: roads() }]); return r; };
  const AB = [stop(0, -5), stop(1000, -5)];

  it('a 4 m vehicle goes round: the leg names the 3.7 m bridge and carries the route it would have taken', () => {
    const r = /** @type {any} */ (router().route(AB, { vehicle: { height: 4 }, uturnLength: 12 }));
    expect(r.ok).toBe(true);
    expect(r.legs[0].metres).toBeGreaterThan(1500);
    expect(r.legs[0].around).toEqual([expect.objectContaining({ kind: 'height', value: 3.7, way: 77, road: 'Matrandvegen' })]);
    expect(r.legs[0].free.length).toBeGreaterThan(1);
    expect(r.legs[0].free.every((/** @type {[number, number]} */ c) => c[1] < LAT + 10 * M_LAT)).toBe(true);
  });

  it('a 3 m vehicle passes: no blockers, no second route', () => {
    const r = /** @type {any} */ (router().route(AB, { vehicle: { height: 3 } }));
    expect(r.legs[0].around).toBeUndefined();
    expect(r.legs[0].free).toBeUndefined();
  });

  it('no route with the limits but one without: no route for this vehicle, with what blocks it', () => {
    const t = tileOf({
      nodes: [P(0, 0), P(400, 0), P(600, 0), P(1000, 0)],
      attrs: [{ cls: 2 }, { cls: 2, maxheight: 3.7 }], names: ['', 'Brua'],
      edges: [{ from: 0, to: 1 }, { from: 1, to: 2, attr: 1, way: 9, name: 1 }, { from: 2, to: 3 }],
    });
    const rt = createRouter(); rt.addTiles([{ key: 'a', buf: t }]);
    const r = /** @type {any} */ (rt.route(AB, { vehicle: { height: 4 } }));
    expect(r).toMatchObject({ ok: false, error: 'no-route-vehicle', leg: 0, around: [{ kind: 'height', value: 3.7, way: 9, road: 'Brua' }] });
    expect(r.free.length).toBeGreaterThan(1);
  });

  it('a stop on a road the vehicle cannot use: no route for this vehicle, naming that road', () => {
    const r = /** @type {any} */ (router().route([stop(0, -5), stop(750, -5)], { vehicle: { height: 4 } }));
    expect(r).toMatchObject({ ok: false, error: 'no-route-vehicle', around: [{ kind: 'height', way: 77 }] });
  });
});

describe('placing a saved route on the road data (design 2026-11-03 §8)', () => {
  // W(0,0) - E(1000,0), way 1, with a 3.7 m stretch (way 2) in the middle; a bridge N(500,100) - S(500,-100) crosses it
  // without a shared node, with maxweight 8 (way 3).
  const t = () => tileOf({
    nodes: [P(0, 0), P(400, 0), P(600, 0), P(1000, 0), P(500, 100), P(500, -100)],
    attrs: [{ cls: 2 }, { cls: 2, maxheight: 3.7 }, { cls: 2, maxweight: 8 }], names: ['', 'Vegen', 'Brua'],
    edges: [{ from: 0, to: 1, way: 1, name: 1 }, { from: 1, to: 2, attr: 1, way: 2, name: 1 }, { from: 2, to: 3, way: 1, name: 1 },
      { from: 4, to: 5, attr: 2, way: 3, name: 2 }],
  });
  const router = () => { const r = createRouter(); r.addTiles([{ key: 'a', buf: t() }]); return r; };
  /** @param {[number, number][]} coords */
  const at6 = (coords) => coords.map(([lon, lat]) => /** @type {[number, number]} */ ([Math.round(lon * 1e6) / 1e6, Math.round(lat * 1e6) / 1e6]));

  it('finds the lowest limits along a route routed on it (polyline precision), not the bridge crossing above', () => {
    const rt = router();
    const r = /** @type {any} */ (rt.route([stop(100, -5), stop(900, -5)]));
    const placed = rt.place(at6(r.legs[0].coords));
    expect(placed.matched).toBe(true);
    expect(placed.limits.height).toMatchObject({ value: 3.7, way: 2, road: 'Vegen' });
    expect(placed.limits.weight).toBeUndefined();
  });

  it('a route with a stretch off every road is not matched', () => {
    const placed = router().place([P(100, 0), P(300, 0), P(300, 50), P(900, 0)]);
    expect(placed.matched).toBe(false);
  });
});
