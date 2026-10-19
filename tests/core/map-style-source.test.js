import { describe, it, expect } from 'vitest';
import { styleSourceFrom } from '../../src/core/map-style.js';

describe('the tile source the router uses (the map\'s own tiles)', () => {
  it('reads the vector source from the style, following its TileJSON', async () => {
    const style = { sources: { openmaptiles: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' }, ne2: { type: 'raster', tiles: ['x'] } } };
    const asked = [];
    const fetchJson = async (/** @type {string} */ url) => { asked.push(url); return { tiles: ['https://tiles.openfreemap.org/planet/20261011_080001_pt/{z}/{x}/{y}.pbf'], maxzoom: 14 }; };
    expect(await styleSourceFrom(style, fetchJson)).toEqual({ tiles: ['https://tiles.openfreemap.org/planet/20261011_080001_pt/{z}/{x}/{y}.pbf'], maxzoom: 14, buildId: 'openfreemap 20261011_080001_pt' });
    expect(asked).toEqual(['https://tiles.openfreemap.org/planet']);
  });

  it('uses tiles listed in the style itself', async () => {
    const style = { sources: { v: { type: 'vector', tiles: ['https://t.example.no/{z}/{x}/{y}.pbf'], maxzoom: 15 } } };
    expect(await styleSourceFrom(style, async () => ({}))).toEqual({ tiles: ['https://t.example.no/{z}/{x}/{y}.pbf'], maxzoom: 15, buildId: 't.example.no' });
  });

  it('gives null for a raster-only style: no vector tiles, links stay straight', async () => {
    expect(await styleSourceFrom({ sources: { r: { type: 'raster', tiles: ['x'] } } }, async () => ({}))).toBeNull();
  });
});
