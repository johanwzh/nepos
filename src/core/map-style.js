// Which map style MapLibre shows (2.3): OpenFreeMap's vector tiles, Positron in light mode and Dark in dark mode,
// unless the settings name a style of their own. An old custom raster tile URL (Nepos 2.0–2.2) keeps working as a
// raster style; links are then not routed (no vector tiles). Pure.

export const OPENFREEMAP_POSITRON = 'https://tiles.openfreemap.org/styles/positron';
export const OPENFREEMAP_DARK = 'https://tiles.openfreemap.org/styles/dark';
/** The raster default before 2.3: not a choice the user made. */
const OLD_DEFAULT_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

/**
 * A MapLibre style with one raster source.
 * @param {string} tileUrl @param {string} attribution
 */
export function rasterStyle(tileUrl, attribution) {
  return {
    version: 8,
    sources: { raster: { type: 'raster', tiles: [tileUrl], tileSize: 256, attribution, maxzoom: 19 } },
    layers: [{ id: 'raster', type: 'raster', source: 'raster' }],
  };
}

/**
 * @param {{ mapStyleUrl?: string, tileUrl?: string, tileAttribution?: string }} settings
 * @param {'light' | 'dark'} theme
 * @returns {string | object} a style URL, or a raster style object
 */
export function styleUrlFor(settings, theme) {
  if (settings.mapStyleUrl) return settings.mapStyleUrl;
  if (settings.tileUrl && settings.tileUrl !== OLD_DEFAULT_TILES) return rasterStyle(settings.tileUrl, settings.tileAttribution ?? '');
  return theme === 'dark' ? OPENFREEMAP_DARK : OPENFREEMAP_POSITRON;
}

/**
 * The vector tile source a style draws from, which the router fetches too (only the map's own tiles). Follows a
 * source's TileJSON `url` when the style does not list the tiles. Null for a raster-only style.
 * @param {any} style a MapLibre style object
 * @param {(url: string) => Promise<any>} fetchJson
 * @returns {Promise<{ tiles: string[], maxzoom: number, buildId: string } | null>}
 */
export async function styleSourceFrom(style, fetchJson) {
  for (const src of Object.values(style?.sources ?? {})) {
    const s = /** @type {any} */ (src);
    if (s?.type !== 'vector') continue;
    const tj = s.tiles?.length ? s : s.url ? await fetchJson(s.url) : null;
    if (!tj?.tiles?.length) continue;
    const url = String(tj.tiles[0]);
    const host = url.match(/^https?:\/\/([^/]+)/)?.[1] ?? '';
    const build = url.match(/\/(\d{8}_\d{6}_[a-z]+)\//)?.[1];
    const name = host.startsWith('tiles.openfreemap.org') ? 'openfreemap' : host;
    return { tiles: tj.tiles, maxzoom: Number(tj.maxzoom ?? s.maxzoom ?? 14), buildId: build ? `${name} ${build}` : host };
  }
  return null;
}
