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
