// @vitest-environment jsdom
// The map layer switch (2.5, user 2026-10-29): today's map, OpenStreetMap, aerial.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const setStyle = vi.fn();
const created = vi.fn();
vi.mock('../../src/ui/map-view.js', () => ({
  createMapView: (/** @type {any} */ _el, /** @type {any} */ opts) => {
    created(opts);
    const noop = () => {};
    return new Proxy({ setStyle }, { get: (o, k) => (k in o ? /** @type {any} */ (o)[k] : noop) });
  },
}));

const { loadAppMarkup } = await import('./dom-setup.js');
const { app } = await import('../../src/ui/state.js');
const { initShell } = await import('../../src/ui/shell.js');
const { initMapPanel } = await import('../../src/ui/map-panel.js');
const { DEFAULT_SETTINGS } = await import('../../src/project/settings.js');
const { ESRI_TILES, OSM_TILES } = await import('../../src/core/map-style.js');

const btn = (/** @type {string} */ layer) => /** @type {HTMLElement} */ (document.querySelector(`#map-layers [data-layer="${layer}"]`));

beforeEach(() => {
  loadAppMarkup();
  /** @type {any} */ (globalThis).ResizeObserver = class { observe() {} };
  initShell();
  setStyle.mockClear(); created.mockClear();
});

describe('the map layer switch', () => {
  it('three layers, today\'s map on by default', () => {
    app.settings = { ...DEFAULT_SETTINGS };
    initMapPanel();
    expect([...document.querySelectorAll('#map-layers [data-layer]')].map((b) => /** @type {HTMLElement} */ (b).dataset.layer)).toEqual(['vector', 'osm', 'aerial']);
    expect(/** @type {HTMLElement | null} */ (document.querySelector('#map-layers .on'))?.dataset.layer).toBe('vector');
  });

  it('a click saves the choice and restyles the map (the drawn trip comes back on style.load)', () => {
    app.settings = { ...DEFAULT_SETTINGS };
    initMapPanel();
    btn('osm').click(); // the map is made with OpenStreetMap
    expect(created.mock.calls.at(-1)?.[0].style.sources.raster.tiles[0]).toBe(OSM_TILES);
    btn('aerial').click(); // the same map, restyled
    expect(app.settings.mapLayer).toBe('aerial');
    expect(setStyle).toHaveBeenCalledTimes(1);
    expect(setStyle.mock.calls[0][0].sources.raster.tiles[0]).toBe(ESRI_TILES);
    expect(/** @type {HTMLElement | null} */ (document.querySelector('#map-layers .on'))?.dataset.layer).toBe('aerial');
  });

  it('hidden when the settings name a custom style', () => {
    app.settings = { ...DEFAULT_SETTINGS, mapStyleUrl: 'https://x/style.json' };
    initMapPanel();
    expect(/** @type {HTMLElement} */ (document.getElementById('map-layers')).hidden).toBe(true);
  });
});
