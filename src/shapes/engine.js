// One link, Quay to Quay (Lasse's spec, as changed by the design): the checks that need no tiles first (no
// profile, same place, too far in a straight line), then the corridor of tiles, the graph, the snap and the search.
// Every outcome has a status; only OK carries a routed shape. Tiles are fetched through the injected `fetchTile`
// and counted against the page load's budget; decoded tiles and built graphs are kept for the next link. Pure apart
// from `fetchTile` (the worker passes `fetch`; tests pass the fixtures).
import { decodeTile, corridorTiles } from './tiles.js';
import { buildGraph } from './graph.js';
import { snap } from './snap.js';
import { route } from './search.js';
import { PROFILES, ENGINE_VERSION, zoomFor, SOURCES } from './profiles.js';
import { haversineM, lonLatToTile } from './geometry.js';

/** @typedef {import('./profiles.js').Profile} Profile */
/** @typedef {{ quayId: string, lon: number, lat: number }} QuayRef */
/** @typedef {'OK' | 'BLOCKED' | 'NOT_SHAPED' | 'NO_NETWORK_NEAR' | 'NO_PATH' | 'TOO_FAR' | 'ERROR'} LinkStatus */
/**
 * @typedef {{ key: string, status: LinkStatus, from: QuayRef, to: QuayRef, profile: Profile | null,
 *             coordinates: [number, number][], distanceM: number, arriveBearing: number | null,
 *             warnings: string[], source: string, engine: number }} LinkResult
 */

const SAME_PLACE_M = 5;
const LRU_TILES = 300;
const GRAPHS = 8;

/** @param {QuayRef} from @param {QuayRef} to @param {Profile | null} profile */
export const linkKey = (from, to, profile) => `${from.quayId}|${to.quayId}|${profile ?? ''}`;

/**
 * @param {{ fetchTile: (z: number, x: number, y: number) => Promise<Uint8Array | null>, source: string,
 *           maxTiles?: number, budget?: number, concurrency?: number,
 *           decode?: (bytes: Uint8Array, z: number, x: number, y: number) => import('./tiles.js').DecodedLine[] }} opts
 */
export function createEngineCore({ fetchTile, source, maxTiles = 400, budget = SOURCES.default.budget, concurrency = SOURCES.default.concurrency, decode = decodeTile }) {
  /** @type {Map<string, import('./tiles.js').DecodedLine[] | 'failed'>} decoded tiles, least recently used first */
  const tiles = new Map();
  /** @type {Map<string, import('./graph.js').Graph>} */
  const graphs = new Map();
  let used = 0;

  /** Fetch what is missing, at most `concurrency` at a time. Failed tiles are remembered as failed. @param {string[]} keys */
  async function load(keys) {
    const missing = keys.filter((k) => !tiles.has(k));
    let next = 0;
    const worker = async () => {
      while (next < missing.length) {
        const k = missing[next++];
        const [z, x, y] = k.split('/').map(Number);
        used++;
        try {
          const bytes = await fetchTile(z, x, y);
          tiles.set(k, bytes ? decode(bytes, z, x, y) : []);
        } catch {
          tiles.set(k, 'failed');
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, missing.length) }, worker));
    for (const k of keys) { const v = tiles.get(k); if (v !== undefined) { tiles.delete(k); tiles.set(k, v); } }
    while (tiles.size > LRU_TILES) tiles.delete(/** @type {string} */ (tiles.keys().next().value));
  }

  /** @param {Profile} profile @param {number} z @param {string[]} keys */
  function graphFor(profile, z, keys) {
    const gk = `${profile}|${z}|${[...keys].sort().join(',')}`;
    let g = graphs.get(gk);
    if (!g) {
      const lines = keys.flatMap((k) => { const v = tiles.get(k); return Array.isArray(v) ? v : []; });
      g = buildGraph(lines, profile, z);
      graphs.set(gk, g);
      while (graphs.size > GRAPHS) graphs.delete(/** @type {string} */ (graphs.keys().next().value));
    }
    return g;
  }

  /**
   * @param {QuayRef} from @param {QuayRef} to @param {Profile | null} profile
   * @param {{ arriveBearing?: number | null }} [opts]
   * @returns {Promise<LinkResult>}
   */
  async function shapeLink(from, to, profile, opts = {}) {
    const a = /** @type {[number, number]} */ ([from.lon, from.lat]), b = /** @type {[number, number]} */ ([to.lon, to.lat]);
    const straight = haversineM(a, b);
    /** @param {LinkStatus} status @param {string[]} [warnings] @returns {LinkResult} */
    const plain = (status, warnings = []) => ({ key: linkKey(from, to, profile), status, from, to, profile, coordinates: [a, b],
      distanceM: Math.round(straight), arriveBearing: null, warnings, source, engine: ENGINE_VERSION });
    if (!profile) return plain('NOT_SHAPED');
    if (from.quayId === to.quayId || straight < SAME_PLACE_M) return { ...plain('OK', ['same place']), distanceM: Math.round(straight) };
    if (straight > PROFILES[profile].maxStraightKm * 1000) return plain('TOO_FAR');
    const z = zoomFor(profile, straight);
    const own = [a, b].map((p) => { const t = lonLatToTile(p[0], p[1], z); return `${z}/${Math.floor(t.x)}/${Math.floor(t.y)}`; });

    for (const factor of [1, 2]) { // a link along a fjord may leave the corridor: once more, twice as wide
      const corridor = corridorTiles(a, b, z, Math.max(1000, 0.15 * straight) * factor).map((t) => `${z}/${t.x}/${t.y}`);
      if (corridor.length > maxTiles) return plain('TOO_FAR');
      const missing = corridor.filter((k) => !tiles.has(k)).length;
      if (used + missing > budget) return plain('ERROR', ['tile budget used']);
      await load(corridor);
      if (own.some((k) => tiles.get(k) === 'failed')) { for (const k of own) if (tiles.get(k) === 'failed') tiles.delete(k); return plain('ERROR', ['tiles not loaded']); }
      const g = graphFor(profile, z, corridor);
      const fromC = snap(g, a, profile), toC = snap(g, b, profile);
      if (!fromC.length || !toC.length) return plain('NO_NETWORK_NEAR');
      const r = route(g, fromC, toC, profile, { arriveBearing: opts.arriveBearing ?? null, fromPoint: a, toPoint: b });
      if (!r) continue;
      const warnings = [...r.warnings];
      if (r.distanceM > 3 * straight + 2000) warnings.push('long detour');
      return { key: linkKey(from, to, profile), status: 'OK', from, to, profile, coordinates: r.coords, distanceM: Math.round(r.distanceM),
        arriveBearing: r.arriveBearing, warnings, source, engine: ENGINE_VERSION };
    }
    return plain('NO_PATH');
  }

  return { shapeLink, tilesUsed: () => used };
}
