// Where a routing session gets its road tiles (spec §9): the published build (manifest + gzip tiles) and the project's
// cache in cache/routing/road/ (<key>.bin.gz + manifest.json; deletable at any time). One build per session, chosen
// on open: the cached build when it already holds every tile the stops need (a newer published build is then only a
// notice), else the published build, downloading that area only. The cache always holds one build: when it moves to
// a newer one, tiles that changed are dropped (2026-10-31). Offline works when the tiles are cached. Downloaded tiles
// are routed from memory at once and written to the cache in the background (user 2026-10-31: writing 115 tiles one by
// one into a OneDrive folder took minutes before routing began); the old manifest goes first and the new one is written
// last, so a cache left half-written is never taken for a build it does not hold.
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
 *   published: the newest build known without downloading tiles (routing editor, 2026-10-31: newer map data is orange);
 *   saved: settles when the background cache writes so far are done
 */

const MANIFEST = `${ROUTING_CACHE_DIR}/manifest.json`;
const tilePath = (/** @type {string} */ key) => `${ROUTING_CACHE_DIR}/${key}.bin.gz`;

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
  /** This session's downloaded tiles (gzip bytes), routed from memory. @type {Map<string, Uint8Array>} */
  const mem = new Map();
  /** Cached tiles that belong to this session's build (only these are read from the cache). @type {Set<string>} */
  const valid = new Set();
  /** The background cache writes, one after the other; a failure only costs a download next time. */
  let saving = Promise.resolve();
  const save = (/** @type {() => Promise<void>} */ fn) => { saving = saving.then(fn).catch(() => {}); };

  /** @param {string} name */
  async function get(name) {
    let res;
    try { res = await fetch(`${base}${name}`, { cache: 'no-cache' }); } catch { throw new Error('routing-offline'); }
    if (!res.ok) throw new Error('routing-offline');
    return new Uint8Array(await res.arrayBuffer());
  }

  /** Downloaded and checked against the manifest; not written. @param {Manifest} m @param {string} key */
  async function download(m, key) {
    const bytes = await get(`${key}.bin.gz`);
    if ((await hash12(bytes)) !== m.tiles[key]?.hash) throw new Error('routing-bad-tile');
    counts.downloaded++; counts.bytes += bytes.length;
    return bytes;
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
      if (session) return { manifest: session, newer };
      const cached = await readCachedManifest();
      const files = new Set((await fs.list(ROUTING_CACHE_DIR)).filter((e) => e.kind === 'file').map((e) => e.name));
      const inCache = (/** @type {Manifest} */ m, /** @type {string} */ k) => k in m.tiles && files.has(`${k}.bin.gz`);
      /** @type {Manifest | null} */
      let published = null;
      try { published = JSON.parse(new TextDecoder().decode(await get('manifest.json'))); } catch { published = null; }

      /** The cache's build for this session. @param {Manifest} m */
      const useCache = (m) => {
        session = m;
        for (const name of files) { const k = name.replace(/\.bin\.gz$/, ''); if (inCache(m, k)) valid.add(k); }
      };
      if (!published) {
        if (!cached || !tilesForChain(cached, points, 1).every((k) => inCache(cached, k))) throw new Error('routing-offline');
        useCache(cached);
        return { manifest: cached, newer };
      }
      if (cached && (!latest || cached.built === published.built) && tilesForChain(published, points, 1).every((k) => inCache(cached, k))) {
        useCache(cached);
        newer = published.built > cached.built;
        return { manifest: cached, newer };
      }
      // The published build: fetch the needed tiles the cache lacks or holds from another build, then switch the cache
      const same = (/** @type {string} */ k) => !!cached && inCache(cached, k) && cached.tiles[k].hash === published?.tiles[k]?.hash;
      const need = tilesForChain(published, points, 1).filter((k) => !same(k));
      // onProgress: the tiles downloaded so far (user 2026-10-31: a new area takes a while, and it must show)
      let done = 0;
      onProgress?.(0, need.length);
      const got = await Promise.all(need.map(async (k) => {
        const bytes = await download(/** @type {Manifest} */ (published), k);
        onProgress?.(++done, need.length);
        return /** @type {[string, Uint8Array]} */ ([k, bytes]);
      }));
      const pub = /** @type {Manifest} */ (published);
      for (const name of files) { const k = name.replace(/\.bin\.gz$/, ''); if (name.endsWith('.bin.gz') && same(k)) valid.add(k); }
      for (const [k, bytes] of got) mem.set(k, bytes);
      if (cached) await fs.remove(MANIFEST);
      save(async () => {
        for (const name of files) {
          const k = name.replace(/\.bin\.gz$/, '');
          if (name.endsWith('.bin.gz') && !same(k)) await fs.remove(tilePath(k));
        }
        // a few at a time: a OneDrive folder is slow per file
        for (let i = 0; i < got.length; i += 8) await Promise.all(got.slice(i, i + 8).map(([k, bytes]) => fs.writeBytes(tilePath(k), bytes)));
        await writeJson(fs, MANIFEST, pub);
      });
      session = pub;
      return { manifest: session, newer };
    },

    async loadTile(key) {
      if (!session) throw new Error('routing-not-open');
      const m = mem.get(key);
      if (m) return gunzip(/** @type {ArrayBuffer} */ (m.slice().buffer));
      const hit = valid.has(key) ? await fs.readBytes(tilePath(key)) : null;
      if (hit) { counts.cached++; return gunzip(/** @type {ArrayBuffer} */ (hit.slice().buffer)); }
      const bytes = await download(session, key);
      mem.set(key, bytes);
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
