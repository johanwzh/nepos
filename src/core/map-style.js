// Which map style MapLibre shows (2.3): OpenFreeMap's vector tiles, Positron in light mode and Dark in dark mode,
// unless the settings name a style of their own. An old custom raster tile URL (Nepos 2.0–2.2) keeps working as a
// raster style; links are then not routed (no vector tiles). Pure.

export const OPENFREEMAP_POSITRON = 'https://tiles.openfreemap.org/styles/positron';
export const OPENFREEMAP_DARK = 'https://tiles.openfreemap.org/styles/dark';
/** The raster default before 2.3: not a choice the user made. */
const OLD_DEFAULT_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
// The other map layers (2.5, user 2026-10-29): OpenStreetMap's standard tiles, darkened in dark mode, and Esri aerials
export const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
/** Inverts lightness and mutes the colours: a dark OpenStreetMap. */
const OSM_DARK_PAINT = { 'raster-brightness-min': 1, 'raster-brightness-max': 0, 'raster-saturation': -0.6, 'raster-contrast': 0.1 };
export const ESRI_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const ESRI_ATTRIBUTION = 'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community';

/**
 * A MapLibre style with one raster source.
 * @param {string} tileUrl @param {string} attribution @param {object} [paint] raster paint properties
 */
export function rasterStyle(tileUrl, attribution, paint) {
  return {
    version: 8,
    sources: { raster: { type: 'raster', tiles: [tileUrl], tileSize: 256, attribution, maxzoom: 19 } },
    layers: [{ id: 'raster', type: 'raster', source: 'raster', ...(paint ? { paint } : {}) }],
  };
}

/**
 * @param {{ mapStyleUrl?: string, tileUrl?: string, tileAttribution?: string, mapLayer?: string }} settings
 * @param {'light' | 'dark'} theme
 * @returns {string | object} a style URL, or a raster style object
 */
export function styleUrlFor(settings, theme) {
  if (settings.mapStyleUrl) return settings.mapStyleUrl;
  if (settings.tileUrl && settings.tileUrl !== OLD_DEFAULT_TILES) return rasterStyle(settings.tileUrl, settings.tileAttribution ?? '');
  if (settings.mapLayer === 'osm') return rasterStyle(OSM_TILES, OSM_ATTRIBUTION, theme === 'dark' ? OSM_DARK_PAINT : undefined);
  if (settings.mapLayer === 'aerial') return rasterStyle(ESRI_TILES, ESRI_ATTRIBUTION);
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
