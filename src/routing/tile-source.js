// Where a routing session gets its road tiles (spec §9): the published build (manifest + gzip tiles) and the project's
// cache in cache/routing/road/ (<key>.bin.gz + manifest.json; deletable at any time). One build per session, chosen
// on the first open: the cached build when it already holds every tile the stops need (a newer published build is then
// only a notice), else the published build, downloading that area only. Each later open (a later Route) fetches only
// the tiles its points add. The cache holds one build: when it moves to a newer one, tiles that changed are dropped.
// Offline works when the tiles are cached.
// Speed (user 2026-10-31: 115 tiles written one by one into a OneDrive folder, then read back, took minutes): downloaded
// tiles are routed from memory at once, kept in memory for the page's life, and written to the cache in the
// background, the manifest last. A tile read from the cache is checked against the build's hash, so a cache write cut
// short never mixes two builds.
import { ROUTING_CACHE_DIR } from '../project/layout.js';
import { readText, writeJson } from '../project/fs.js';
import { tilesForChain } from './tile-select.js';
import { gunzip } from './tile-format.js';

/**
 * @typedef {{ format: string, set: string, built: string, dataDate: string, tileLon: number, tileLat: number,
 *   tiles: Record<string, { size: number, hash: string }> }} Manifest
 * @typedef {{ open: (points: { lon: number, lat: number }[], opts?: { latest?: boolean, onProgress?: (done: number, total: number) => void }) => Promise<{ manifest: Manifest, newer: boolean }>,
 *   loadTile: (key: string) => Promise<ArrayBuffer>, stats: () => { downloaded: number, bytes: number, cached: number },
 *   published: () => Promise<Manifest | null>, saved: () => Promise<void> }} TileSource
 *   open: the first call chooses the build, later calls fetch the tiles their points add; onProgress: tiles downloaded
 *   published: the newest build known without downloading tiles (routing editor, 2026-10-31: newer map data is orange);
 *   saved: settles when the background cache writes so far are done
 */

const MANIFEST = `${ROUTING_CACHE_DIR}/manifest.json`;
const tilePath = (/** @type {string} */ key) => `${ROUTING_CACHE_DIR}/${key}.bin.gz`;

/** Tiles downloaded in this page, by build and key (gzip bytes): a session opened again needs neither network nor disk. */
const pageTiles = new Map();
const PAGE_MAX = 600; // about 90 MB; the oldest go first

/** @param {string} built @param {string} key @param {Uint8Array} bytes */
function remember(built, key, bytes) {
  pageTiles.set(`${built}|${key}`, bytes);
  while (pageTiles.size > PAGE_MAX) pageTiles.delete(/** @type {string} */ (pageTiles.keys().next().value));
}

/** Forget the tiles kept in this page (tests; a reload does the same). */
export function clearTileMemory() { pageTiles.clear(); }

/** First 12 hex of the SHA-1 of the gzip bytes, as the manifest has it. @param {Uint8Array} bytes */
async function hash12(bytes) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-1', /** @type {BufferSource} */ (bytes)));
  return [...d.slice(0, 6)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * @param {{ fs: import('../project/fs.js').ProjectFs, baseUrl: string, fetch?: typeof globalThis.fetch }} opts
 * @returns {TileSource}
 */
export function createTileSource({ fs, baseUrl, fetch = globalThis.fetch.bind(globalThis) }) {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  /** @type {Manifest | null} */
  let session = null;
  let newer = false;
  const counts = { downloaded: 0, bytes: 0, cached: 0 };
  /** Whether a tile of this session's build may be in the cache (its file is there and the build's hash matches). */
  let onDisk = (/** @type {string} */ _k) => false;
  /** The background cache writes, one after the other; a failure only costs a download next time. */
  let saving = Promise.resolve();
  const save = (/** @type {() => Promise<void>} */ fn) => { saving = saving.then(fn).catch(() => {}); };
  const inMemory = (/** @type {string} */ k) => !!session && pageTiles.has(`${session.built}|${k}`);

  /** @param {string} name */
  async function get(name) {
    let res;
    try { res = await fetch(`${base}${name}`, { cache: 'no-cache' }); } catch { throw new Error('routing-offline'); }
    if (!res.ok) throw new Error('routing-offline');
    return new Uint8Array(await res.arrayBuffer());
  }

  /** Downloaded and checked against the manifest, kept in memory; not written. @param {Manifest} m @param {string} key */
  async function download(m, key) {
    const bytes = await get(`${key}.bin.gz`);
    if ((await hash12(bytes)) !== m.tiles[key]?.hash) throw new Error('routing-bad-tile');
    counts.downloaded++; counts.bytes += bytes.length;
    remember(m.built, key, bytes);
    return bytes;
  }

  /** Download these tiles of the session's build, a few at a time, reporting progress; then cache them in the background. @param {string[]} keys */
  async function fetchAll(keys, /** @type {((d: number, n: number) => void) | undefined} */ onProgress, writeManifest = false) {
    const m = /** @type {Manifest} */ (session);
    let done = 0;
    onProgress?.(0, keys.length);
    const got = await Promise.all(keys.map(async (k) => {
      const bytes = await download(m, k);
      onProgress?.(++done, keys.length);
      return /** @type {[string, Uint8Array]} */ ([k, bytes]);
    }));
    save(async () => {
      // a few at a time: a OneDrive folder is slow per file
      for (let i = 0; i < got.length; i += 8) await Promise.all(got.slice(i, i + 8).map(([k, bytes]) => fs.writeBytes(tilePath(k), bytes)));
      if (writeManifest) await writeJson(fs, MANIFEST, m);
    });
  }

  async function readCachedManifest() {
    try {
      const v = JSON.parse((await readText(fs, MANIFEST)) ?? 'null');
      return v && typeof v.tiles === 'object' ? /** @type {Manifest} */ (v) : null;
    } catch { return null; }
  }

  return {
    /** latest: route on the published build when there is one, even if the cache covers the area (final review 1) */
    async open(points, { latest = false, onProgress } = {}) {
      if (session) {
        const s = session;
        await fetchAll(tilesForChain(s, points, 1).filter((k) => !inMemory(k) && !onDisk(k)), onProgress);
        return { manifest: s, newer };
      }
      const cached = await readCachedManifest();
      const files = new Set((await fs.list(ROUTING_CACHE_DIR)).filter((e) => e.kind === 'file').map((e) => e.name));
      const inCache = (/** @type {Manifest} */ m, /** @type {string} */ k) => k in m.tiles && files.has(`${k}.bin.gz`);
      /** @type {Manifest | null} */
      let published = null;
      try { published = JSON.parse(new TextDecoder().decode(await get('manifest.json'))); } catch { published = null; }

      if (!published) {
        if (!cached || !tilesForChain(cached, points, 1).every((k) => inCache(cached, k) || pageTiles.has(`${cached.built}|${k}`))) throw new Error('routing-offline');
        session = cached;
        onDisk = (k) => inCache(cached, k);
        return { manifest: cached, newer };
      }
      const pub = published;
      if (cached && (!latest || cached.built === pub.built) && tilesForChain(pub, points, 1).every((k) => inCache(cached, k))) {
        session = cached;
        onDisk = (k) => inCache(cached, k);
        newer = pub.built > cached.built;
        return { manifest: cached, newer };
      }
      // The published build: fetch the needed tiles neither this page nor the cache holds, then move the cache to it
      const same = (/** @type {string} */ k) => !!cached && inCache(cached, k) && cached.tiles[k].hash === pub.tiles[k]?.hash;
      session = pub;
      onDisk = same;
      const stale = [...files].filter((name) => name.endsWith('.bin.gz') && !same(name.replace(/\.bin\.gz$/, '')));
      try {
        await fetchAll(tilesForChain(pub, points, 1).filter((k) => !inMemory(k) && !same(k)), onProgress, true);
      } catch (e) { session = null; throw e; }
      // tiles of another build leave the cache (before the new manifest is written, after the downloads above)
      save(async () => { for (const name of stale) if (!inMemory(name.replace(/\.bin\.gz$/, ''))) await fs.remove(`${ROUTING_CACHE_DIR}/${name}`); });
      return { manifest: pub, newer };
    },

    async loadTile(key) {
      if (!session) throw new Error('routing-not-open');
      const m = session;
      const mem = pageTiles.get(`${m.built}|${key}`);
      if (mem) return gunzip(/** @type {ArrayBuffer} */ (mem.slice().buffer));
      const hit = onDisk(key) ? await fs.readBytes(tilePath(key)) : null;
      // checked against the build: a cache write cut short may have left another build's tile
      if (hit && (await hash12(hit)) === m.tiles[key]?.hash) {
        counts.cached++;
        remember(m.built, key, hit);
        return gunzip(/** @type {ArrayBuffer} */ (hit.slice().buffer));
      }
      const bytes = await download(m, key);
      save(() => fs.writeBytes(tilePath(key), bytes));
      return gunzip(/** @type {ArrayBuffer} */ (bytes.slice().buffer));
    },

    saved: () => saving,

    stats: () => ({ ...counts }),

    async published() {
      try { return JSON.parse(new TextDecoder().decode(await get('manifest.json'))); } catch { return readCachedManifest(); }
    },
  };
}
