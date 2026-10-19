import { describe, it, expect } from 'vitest';
import { styleUrlFor, OPENFREEMAP_POSITRON, OPENFREEMAP_DARK } from '../../src/core/map-style.js';
import { DEFAULT_SETTINGS } from '../../src/project/settings.js';

describe('the map style (MapLibre on OpenFreeMap, 2.3)', () => {
  it('is Positron in light mode and Dark in dark mode by default', () => {
    expect(styleUrlFor({ ...DEFAULT_SETTINGS }, 'light')).toBe(OPENFREEMAP_POSITRON);
    expect(styleUrlFor({ ...DEFAULT_SETTINGS }, 'dark')).toBe(OPENFREEMAP_DARK);
  });

  it('uses the settings\' own style for both themes', () => {
    const s = { ...DEFAULT_SETTINGS, mapStyleUrl: 'https://tiles.example.no/style.json' };
    expect(styleUrlFor(s, 'light')).toBe('https://tiles.example.no/style.json');
    expect(styleUrlFor(s, 'dark')).toBe('https://tiles.example.no/style.json');
  });

  it('keeps an old custom raster tile URL working as a raster style', () => {
    const style = /** @type {any} */ (styleUrlFor({ ...DEFAULT_SETTINGS, tileUrl: 'https://maps.example.no/{z}/{x}/{y}.png' }, 'light'));
    expect(typeof style).toBe('object');
    expect(Object.values(style.sources)[0]).toMatchObject({ type: 'raster', tiles: ['https://maps.example.no/{z}/{x}/{y}.png'] });
  });

  it('treats the old OpenStreetMap default as not set', () => {
    expect(styleUrlFor({ ...DEFAULT_SETTINGS, tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png' }, 'light')).toBe(OPENFREEMAP_POSITRON);
  });
});
