import { describe, it, expect } from 'vitest';
import { styleUrlFor, OPENFREEMAP_POSITRON, OPENFREEMAP_DARK, OSM_TILES, ESRI_TILES } from '../../src/core/map-style.js';
const tilesOf = (s) => /** @type {any} */ (s).sources.raster.tiles[0];
const paintOf = (s) => /** @type {any} */ (s).layers[0].paint;

describe('map layers', () => {
  it('default (and old settings without mapLayer): today\'s map', () => {
    expect(styleUrlFor({}, 'light')).toBe(OPENFREEMAP_POSITRON);
    expect(styleUrlFor({ mapLayer: 'vector' }, 'dark')).toBe(OPENFREEMAP_DARK);
  });
  it('OpenStreetMap: bright in light mode, darkened in dark mode', () => {
    expect(tilesOf(styleUrlFor({ mapLayer: 'osm' }, 'light'))).toBe(OSM_TILES);
    expect(paintOf(styleUrlFor({ mapLayer: 'osm' }, 'light'))).toBeUndefined();
    expect(paintOf(styleUrlFor({ mapLayer: 'osm' }, 'dark'))).toMatchObject({ 'raster-brightness-min': 1, 'raster-brightness-max': 0 });
  });
  it('aerial: Esri, the same in both themes', () => {
    expect(tilesOf(styleUrlFor({ mapLayer: 'aerial' }, 'dark'))).toBe(ESRI_TILES);
    expect(ESRI_TILES).toContain('{z}/{y}/{x}');
  });
  it('a custom style URL still wins', () => {
    expect(styleUrlFor({ mapStyleUrl: 'https://x/style.json', mapLayer: 'aerial' }, 'light')).toBe('https://x/style.json');
  });
});
