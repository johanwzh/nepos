// Routing for all modes (spec 2026-11-01): one tile set per network — its own URL under the tiles base, its own cache
// folder, its own page memory — and a routing session on a tram line routes on the tram set.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { createMemoryFs, readText } from '../../src/project/fs.js';
import { createTileSource, clearTileMemory, setUrl } from '../../src/routing/tile-source.js';
import { routingCacheDir } from '../../src/project/layout.js';
import { DEFAULT_SETTINGS } from '../../src/project/settings.js';
import { createRouter } from '../../src/routing/router-core.js';
import { createRoutingSession } from '../../src/routing/session.js';
import { encodeTile } from './helpers/encode-tile.js';
import { tileOf, M_LAT, M_LON } from './helpers/graph.js';

const sha = (/** @type {Uint8Array} */ b) => createHash('sha1').update(b).digest('hex').slice(0, 12);
const raw = (tag = 0) => new Uint8Array(encodeTile({ nodes: [[10.1, 59.05], [10.101, 59.05]], attrs: [{ cls: 0 }], names: [`t${tag}`], edges: [{ from: 0, to: 1, len: 57, way: 1 + tag }] }));
/** A server holding one build per set at https://tiles.test/<set>/; every URL asked is recorded. */
function server(/** @type {Record<string, Uint8Array>} */ bySet, built = '2026-11-01T00:00:00Z') {
  /** @type {string[]} */
  const calls = [];
  const builds = Object.fromEntries(Object.entries(bySet).map(([set, bytes]) => {
    const gz = new Uint8Array(gzipSync(bytes));
    return [set, { gz, manifest: { format: 'NPT2', set, built, dataDate: built, source: 'x', tileLon: 0.25, tileLat: 0.125, q: 1e7, tiles: { '40_472': { size: gz.length, hash: sha(gz) } } } }];
  }));
  const fetch = async (/** @type {string} */ url) => {
    calls.push(url);
    const m = /^https:\/\/tiles\.test\/([a-z]+)\/(.+)$/.exec(url);
    const b = m && builds[m[1]];
    if (!b) return new Response('', { status: 404 });
    if (m[2] === 'manifest.json') return new Response(JSON.stringify(b.manifest));
    return m[2] === '40_472.bin.gz' ? new Response(/** @type {any} */ (b.gz)) : new Response('', { status: 404 });
  };
  return { calls, fetch: /** @type {any} */ (fetch) };
}
const POINTS = [{ lon: 10.1, lat: 59.05 }];

beforeEach(() => clearTileMemory());

describe('one tile set per network', () => {
  it('the URL of a set under the tiles base; an old saved …/road/ base is read as its parent (Review Focus 2)', () => {
    expect(setUrl('https://x/nepos-tiles/road/', 'rail')).toBe('https://x/nepos-tiles/rail/');
    expect(setUrl('https://x/nepos-tiles/', 'ferry')).toBe('https://x/nepos-tiles/ferry/');
    expect(setUrl('https://x/nepos-tiles/road', 'road')).toBe('https://x/nepos-tiles/road/');
    expect(setUrl('https://x/nepos-tiles', 'tram')).toBe('https://x/nepos-tiles/tram/');
    expect(setUrl('http://localhost:8765/', 'cable')).toBe('http://localhost:8765/cable/');
    expect(DEFAULT_SETTINGS.routingTilesUrl).toBe('https://johanwzh.github.io/nepos-tiles/');
  });

  it('a rail source fetches the rail build and caches it in cache/routing/rail', async () => {
    const fs = createMemoryFs(), { calls, fetch } = server({ rail: raw() });
    const src = createTileSource({ fs, baseUrl: 'https://tiles.test/', set: 'rail', fetch });
    await src.open(POINTS);
    await src.saved();
    expect(calls).toEqual(['https://tiles.test/rail/manifest.json', 'https://tiles.test/rail/40_472.bin.gz']);
    expect(routingCacheDir('rail')).toBe('cache/routing/rail');
    expect(JSON.parse(/** @type {string} */ (await readText(fs, 'cache/routing/rail/manifest.json'))).set).toBe('rail');
    expect(await readText(fs, 'cache/routing/road/manifest.json')).toBeNull();
  });

  it('road keeps its old cache folder: an existing road cache is read offline (Review Focus 1)', async () => {
    const fs = createMemoryFs(), { fetch } = server({ road: raw() });
    const first = createTileSource({ fs, baseUrl: 'https://tiles.test/road/', fetch });
    await first.open(POINTS);
    await first.saved();
    expect(await readText(fs, 'cache/routing/road/manifest.json')).not.toBeNull();
    clearTileMemory();
    const offline = createTileSource({ fs, baseUrl: 'https://tiles.test/road/', fetch: /** @type {any} */ (async () => { throw new TypeError('offline'); }) });
    await offline.open(POINTS);
    expect(new Uint8Array(await offline.loadTile('40_472'))).toEqual(raw());
  });

  it('two sets with the same build time and tile key do not share page memory', async () => {
    const fs = createMemoryFs(), { fetch } = server({ road: raw(0), rail: raw(1) });
    const road = createTileSource({ fs, baseUrl: 'https://tiles.test/', set: 'road', fetch });
    const rail = createTileSource({ fs, baseUrl: 'https://tiles.test/', set: 'rail', fetch });
    await road.open(POINTS); await rail.open(POINTS);
    expect(new Uint8Array(await road.loadTile('40_472'))).toEqual(raw(0));
    expect(new Uint8Array(await rail.loadTile('40_472'))).toEqual(raw(1));
  });

  it('a set not published yet and not cached: routing-no-set, not offline (final review I3)', async () => {
    const fs = createMemoryFs(), { fetch } = server({ road: raw() });
    const src = createTileSource({ fs, baseUrl: 'https://tiles.test/', set: 'cable', fetch });
    await expect(src.open(POINTS)).rejects.toThrow('routing-no-set');
    const offline = createTileSource({ fs, baseUrl: 'https://tiles.test/', set: 'cable', fetch: /** @type {any} */ (async () => { throw new TypeError('offline'); }) });
    await expect(offline.open(POINTS)).rejects.toThrow('routing-offline');
  });
});

describe('a routing session on a tram line', () => {
  const LON = 10.75, LAT = 59.91;
  const P = (/** @type {number} */ x, /** @type {number} */ y) => /** @type {[number, number]} */ ([LON + x * M_LON, LAT + y * M_LAT]);
  const quayInfo = new Map([['NSR:Quay:901', { lon: P(0, -5)[0], lat: P(0, -5)[1] }], ['NSR:Quay:902', { lon: P(800, -5)[0], lat: P(800, -5)[1] }]]);
  const KEY = `${Math.floor(LON / 0.25)}_${Math.floor(LAT / 0.125)}`;
  const buf = tileOf({ nodes: [P(-100, 0), P(900, 0)], attrs: [{ cls: 0 }], names: ['', 'Trikken'], edges: [{ from: 0, to: 1, name: 1 }] });
  const manifest = { format: 'NPT2', set: 'tram', built: '2026-11-01T00:00:00Z', dataDate: '2026-11-01T00:00:00Z', tileLon: 0.25, tileLat: 0.125, tiles: { [KEY]: { size: 1, hash: 'h' } } };
  const tiles = { open: vi.fn(async () => ({ manifest, newer: false })), loadTile: vi.fn(async () => buf.slice(0)), stats: () => ({ downloaded: 0, bytes: 0, cached: 0 }),
    published: vi.fn(async () => manifest), saved: async () => {} };
  const stops = ['901', '902'].map((n) => ({ name: n, stopId: `NSR:Quay:${n}`, isDwellArr: false }));
  const rs = { mode: 'tram', submode: 'cityTram', tableSets: [{ id: 0, name: 'T' }], periods: [{ id: 0, setId: 0, calendarIds: ['c'] }],
    grids: { '0:0': { stops, cols: [{ uid: 't0', dayCode: 'D', cells: [{ time: '0700', dayOffset: 0 }, { time: '0703', dayOffset: 0 }] }] } } };
  const CAL = [{ id: 'c', name: 'Jan', ranges: /** @type {[string, string][]} */ ([['20260101', '20260131']]) }];

  it('Route proposes tram links on the tram set', async () => {
    const s = createRoutingSession({ code: 'L', rs, setId: 0, calendars: CAL, lineLinks: { version: 1, line: 'L', links: {}, snaps: {} },
      quayInfo, router: createRouter('tram'), tiles: /** @type {any} */ (tiles), now: () => new Date('2026-11-01T12:00:00Z') });
    await s.open();
    const id = 'NSR:Quay:901 NSR:Quay:902';
    await s.route(id);
    const link = /** @type {any} */ (s.proposal(id)?.legs.get('NSR:Quay:901|NSR:Quay:902|tram'));
    expect(link?.status).toBe('OK');
    expect(link.tiles.set).toBe('tram');
    expect(link.distanceM).toBeCloseTo(800, -1);
  });
});
