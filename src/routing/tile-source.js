// Where a routing session gets its road tiles (spec §9): the published build (manifest + gzip tiles) and the project's
// cache in cache/routing/road/ (<key>.bin.gz + manifest.json; deletable at any time). One build per session, chosen
// on open: the cached build when it already holds every tile the stops need (a newer published build is then only a
// notice), else the published build, downloading that area only. The cache always holds one build: when it moves to
// a newer one, tiles that changed are dropped (2026-10-31). Offline works when the tiles are cached.
import { ROUTING_CACHE_DIR } from '../project/layout.js';
import { readText, writeJson } from '../project/fs.js';
import { tilesForChain } from './tile-select.js';
import { gunzip } from './tile-format.js';

/**
 * @typedef {{ format: string, set: string, built: string, dataDate: string, tileLon: number, tileLat: number,
 *   tiles: Record<string, { size: number, hash: string }> }} Manifest
 * @typedef {{ open: (points: { lon: number, lat: number }[], opts?: { latest?: boolean }) => Promise<{ manifest: Manifest, newer: boolean }>,
 *   loadTile: (key: string) => Promise<ArrayBuffer>, stats: () => { downloaded: number, bytes: number, cached: number },
 *   published: () => Promise<Manifest | null> }} TileSource
 *   published: the newest build known without downloading tiles (routing editor, 2026-10-31: newer map data is orange)
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
    async open(points, { latest = false } = {}) {
      if (session) return { manifest: session, newer };
      const cached = await readCachedManifest();
      const files = new Set((await fs.list(ROUTING_CACHE_DIR)).filter((e) => e.kind === 'file').map((e) => e.name));
      const inCache = (/** @type {Manifest} */ m, /** @type {string} */ k) => k in m.tiles && files.has(`${k}.bin.gz`);
      /** @type {Manifest | null} */
      let published = null;
      try { published = JSON.parse(new TextDecoder().decode(await get('manifest.json'))); } catch { published = null; }

      if (!published) {
        if (!cached || !tilesForChain(cached, points, 1).every((k) => inCache(cached, k))) throw new Error('routing-offline');
        session = cached;
        return { manifest: session, newer };
      }
      if (cached && (!latest || cached.built === published.built) && tilesForChain(published, points, 1).every((k) => inCache(cached, k))) {
        session = cached;
        newer = published.built > cached.built;
        return { manifest: session, newer };
      }
      // The published build: fetch the needed tiles the cache lacks or holds from another build, then switch the cache
      const same = (/** @type {string} */ k) => !!cached && inCache(cached, k) && cached.tiles[k].hash === published?.tiles[k]?.hash;
      const need = tilesForChain(published, points, 1).filter((k) => !same(k));
      const got = await Promise.all(need.map(async (k) => /** @type {[string, Uint8Array]} */ ([k, await download(/** @type {Manifest} */ (published), k)])));
      for (const name of files) {
        const k = name.replace(/\.bin\.gz$/, '');
        if (name.endsWith('.bin.gz') && !same(k)) await fs.remove(tilePath(k));
      }
      for (const [k, bytes] of got) await fs.writeBytes(tilePath(k), bytes);
      await writeJson(fs, MANIFEST, published);
      session = published;
      return { manifest: session, newer };
    },

    async loadTile(key) {
      if (!session) throw new Error('routing-not-open');
      const hit = await fs.readBytes(tilePath(key));
      if (hit) { counts.cached++; return gunzip(/** @type {ArrayBuffer} */ (hit.slice().buffer)); }
      const bytes = await download(session, key);
      await fs.writeBytes(tilePath(key), bytes);
      return gunzip(/** @type {ArrayBuffer} */ (bytes.slice().buffer));
    },

    stats: () => ({ ...counts }),

    async published() {
      try { return JSON.parse(new TextDecoder().decode(await get('manifest.json'))); } catch { return readCachedManifest(); }
    },
  };
}
