// The tile source: the published build (manifest + tiles) and the project's cache, one build per session (spec §9).
import { describe, it, expect } from 'vitest';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { createMemoryFs, readText } from '../../src/project/fs.js';
import { createTileSource } from '../../src/routing/tile-source.js';
import { encodeTile } from './helpers/encode-tile.js';

const BASE = 'https://tiles.test/road/';
const DIR = 'cache/routing/road';
/** A one-edge tile around (lon, lat); `tag` changes its content (a new build). */
const tile = (/** @type {number} */ lon, /** @type {number} */ lat, tag = 0) => new Uint8Array(encodeTile({
  nodes: [[lon, lat], [lon + 0.001, lat]], attrs: [{ cls: 2 }], names: [`road ${tag}`], edges: [{ from: 0, to: 1, len: 57, way: 1 + tag }] }));
const sha = (/** @type {Uint8Array} */ b) => createHash('sha1').update(b).digest('hex').slice(0, 12);

/** A published build: tiles by key → raw bytes. */
function build(/** @type {string} */ built, /** @type {Record<string, Uint8Array>} */ raw) {
  /** @type {Record<string, Uint8Array>} */
  const gz = {};
  for (const [k, b] of Object.entries(raw)) gz[k] = new Uint8Array(gzipSync(b));
  const manifest = { format: 'NPT2', set: 'road', built, dataDate: built, source: 'x', tileLon: 0.25, tileLat: 0.125, q: 1e7,
    tiles: Object.fromEntries(Object.entries(gz).map(([k, b]) => [k, { size: b.length, hash: sha(b) }])) };
  return { manifest, gz, raw };
}

/** A fake fetch serving one build; `offline` makes every call fail. */
function server(/** @type {ReturnType<typeof build>} */ b) {
  const s = { b, offline: false, /** @type {string[]} */ calls: [] };
  const fetch = async (/** @type {string} */ url) => {
    s.calls.push(url.slice(BASE.length));
    if (s.offline) throw new TypeError('Failed to fetch');
    const name = url.slice(BASE.length);
    if (name === 'manifest.json') return new Response(JSON.stringify(s.b.manifest));
    const g = s.b.gz[name.replace('.bin.gz', '')];
    return g ? new Response(/** @type {any} */ (g)) : new Response('', { status: 404 });
  };
  return { s, fetch: /** @type {any} */ (fetch) };
}
const tileCalls = (/** @type {string[]} */ calls) => calls.filter((c) => c.endsWith('.bin.gz'));

// Two stops in tiles 40_472 and 41_472; 50_480 is far away.
const POINTS = [{ lon: 10.1, lat: 59.05 }, { lon: 10.3, lat: 59.05 }];
const v1 = () => build('2026-10-01T00:00:00Z', { '40_472': tile(10.1, 59.05), '41_472': tile(10.3, 59.05), '50_480': tile(12.6, 60.01) });

describe('tile source', () => {
  it('first open downloads the area and caches it with the manifest', async () => {
    const fs = createMemoryFs(), b = v1(), { s, fetch } = server(b);
    const src = createTileSource({ fs, baseUrl: BASE, fetch });
    const { manifest, newer } = await src.open(POINTS);
    expect(newer).toBe(false);
    expect(manifest.built).toBe('2026-10-01T00:00:00Z');
    expect(tileCalls(s.calls).sort()).toEqual(['40_472.bin.gz', '41_472.bin.gz']);
    expect(fs.paths().filter((p) => p.startsWith(DIR)).sort()).toEqual([`${DIR}/40_472.bin.gz`, `${DIR}/41_472.bin.gz`, `${DIR}/manifest.json`]);
    expect(new Uint8Array(await src.loadTile('40_472'))).toEqual(b.raw['40_472']);
    expect(tileCalls(s.calls)).toHaveLength(2); // served from the cache
    expect(src.stats()).toEqual({ downloaded: 2, bytes: b.gz['40_472'].length + b.gz['41_472'].length, cached: 1 });
  });

  it('a later session uses the cache: no tile is fetched again', async () => {
    const fs = createMemoryFs(), b = v1(), { s, fetch } = server(b);
    await createTileSource({ fs, baseUrl: BASE, fetch }).open(POINTS);
    s.calls.length = 0;
    const src = createTileSource({ fs, baseUrl: BASE, fetch });
    expect((await src.open(POINTS)).newer).toBe(false);
    expect(new Uint8Array(await src.loadTile('41_472'))).toEqual(b.raw['41_472']);
    expect(tileCalls(s.calls)).toEqual([]);
    expect(src.stats().downloaded).toBe(0);
  });

  it('a newer published build with every needed tile cached: keeps the cached build, says newer', async () => {
    const fs = createMemoryFs(), { s, fetch } = server(v1());
    await createTileSource({ fs, baseUrl: BASE, fetch }).open(POINTS);
    s.b = build('2026-11-01T00:00:00Z', { '40_472': tile(10.1, 59.05, 1), '41_472': tile(10.3, 59.05, 1), '50_480': tile(12.6, 60.01) });
    s.calls.length = 0;
    const src = createTileSource({ fs, baseUrl: BASE, fetch });
    const { manifest, newer } = await src.open(POINTS);
    expect(newer).toBe(true);
    expect(manifest.built).toBe('2026-10-01T00:00:00Z');
    expect(tileCalls(s.calls)).toEqual([]);
  });

  it('a newer build and a tile not cached: that area comes from the new build, stale tiles leave the cache', async () => {
    const fs = createMemoryFs(), { s, fetch } = server(v1());
    await createTileSource({ fs, baseUrl: BASE, fetch }).open([POINTS[0]]); // caches 40_472 and 41_472 (ring 1)
    await createTileSource({ fs, baseUrl: BASE, fetch }).open([{ lon: 12.6, lat: 60.01 }]); // and 50_480
    const v2 = build('2026-11-01T00:00:00Z', { '40_472': tile(10.1, 59.05, 1), '41_472': tile(10.3, 59.05), '42_472': tile(10.6, 59.05), '50_480': tile(12.6, 60.01, 1) });
    s.b = v2;
    s.calls.length = 0;
    const src = createTileSource({ fs, baseUrl: BASE, fetch });
    const { manifest, newer } = await src.open([...POINTS, { lon: 10.6, lat: 59.05 }]);
    expect(newer).toBe(false);
    expect(manifest.built).toBe('2026-11-01T00:00:00Z');
    expect(tileCalls(s.calls).sort()).toEqual(['40_472.bin.gz', '42_472.bin.gz']); // 41_472 did not change
    expect(JSON.parse(/** @type {string} */ (await readText(fs, `${DIR}/manifest.json`))).built).toBe('2026-11-01T00:00:00Z');
    expect(fs.paths()).not.toContain(`${DIR}/50_480.bin.gz`); // changed in the new build, not needed now
    expect(new Uint8Array(await src.loadTile('40_472'))).toEqual(v2.raw['40_472']);
  });

  it('offline with every needed tile cached: routes from the cache', async () => {
    const fs = createMemoryFs(), b = v1(), { s, fetch } = server(b);
    await createTileSource({ fs, baseUrl: BASE, fetch }).open(POINTS);
    s.offline = true;
    const src = createTileSource({ fs, baseUrl: BASE, fetch });
    expect(await src.open(POINTS)).toMatchObject({ newer: false, manifest: { built: '2026-10-01T00:00:00Z' } });
    expect(new Uint8Array(await src.loadTile('40_472'))).toEqual(b.raw['40_472']);
  });

  it('offline with a tile missing: routing-offline', async () => {
    const fs = createMemoryFs(), { s, fetch } = server(v1());
    await createTileSource({ fs, baseUrl: BASE, fetch }).open([POINTS[0]]);
    s.offline = true;
    await expect(createTileSource({ fs, baseUrl: BASE, fetch }).open([{ lon: 12.6, lat: 60.01 }])).rejects.toThrow('routing-offline');
    await expect(createTileSource({ fs: createMemoryFs(), baseUrl: BASE, fetch }).open(POINTS)).rejects.toThrow('routing-offline');
  });

  it('a tile whose bytes do not match the manifest: routing-bad-tile, nothing cached', async () => {
    const fs = createMemoryFs(), b = v1(), { fetch } = server(b);
    b.gz['41_472'] = new Uint8Array(gzipSync(tile(10.3, 59.05, 7)));
    await expect(createTileSource({ fs, baseUrl: BASE, fetch }).open(POINTS)).rejects.toThrow('routing-bad-tile');
    expect(fs.paths().filter((p) => p.startsWith('cache/'))).toEqual([]);
  });

  it('one build per session: a second open keeps it', async () => {
    const fs = createMemoryFs(), { s, fetch } = server(v1());
    const src = createTileSource({ fs, baseUrl: BASE, fetch });
    await src.open([POINTS[0]]);
    s.b = build('2026-11-01T00:00:00Z', { '40_472': tile(10.1, 59.05, 1), '41_472': tile(10.3, 59.05, 1) });
    expect((await src.open(POINTS)).manifest.built).toBe('2026-10-01T00:00:00Z');
  });

  it('published(): the published manifest only, else the cached one, else null — no tile fetched (routing editor)', async () => {
    const fs = createMemoryFs(), b = v1(), { s, fetch } = server(b);
    expect((await createTileSource({ fs, baseUrl: BASE, fetch }).published())?.built).toBe('2026-10-01T00:00:00Z');
    expect(tileCalls(s.calls)).toEqual([]);
    s.offline = true;
    expect(await createTileSource({ fs, baseUrl: BASE, fetch }).published()).toBeNull();
    s.offline = false;
    await createTileSource({ fs, baseUrl: BASE, fetch }).open(POINTS);
    s.offline = true;
    expect((await createTileSource({ fs, baseUrl: BASE, fetch }).published())?.built).toBe('2026-10-01T00:00:00Z');
  });
});
