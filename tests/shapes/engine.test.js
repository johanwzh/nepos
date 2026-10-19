import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { createEngineCore } from '../../src/shapes/engine.js';
import { ENGINE_VERSION } from '../../src/shapes/profiles.js';
import { tileToLonLat } from '../../src/shapes/geometry.js';

const JBT = { quayId: 'NSR:Quay:7203', lon: 10.749736, lat: 59.911425 };
const OBT = { quayId: 'NSR:Quay:11972', lon: 10.758242, lat: 59.911848 };

/** Serves the fixture tiles; a tile not in the fixtures is empty (as a 404 would be). */
function fixtures() {
  const asked = [];
  const fetchTile = async (/** @type {number} */ z, /** @type {number} */ x, /** @type {number} */ y) => {
    asked.push(`${z}/${x}/${y}`);
    const f = `tests/fixtures/shapes/${z}-${x}-${y}.pbf`;
    return existsSync(f) ? new Uint8Array(readFileSync(f)) : null;
  };
  return { fetchTile, asked };
}

describe('shaping one link (Lasse\'s spec + the design\'s limits)', () => {
  it('never fetches a tile for an extreme link: Kristiansand → Vadsø by bus is TOO_FAR', async () => {
    const { fetchTile, asked } = fixtures();
    const core = createEngineCore({ fetchTile, source: 'test' });
    const r = await core.shapeLink({ quayId: 'NSR:Quay:1', lon: 7.99, lat: 58.15 }, { quayId: 'NSR:Quay:2', lon: 29.75, lat: 70.07 }, 'bus');
    expect(r.status).toBe('TOO_FAR');
    expect(asked).toEqual([]);
    expect(r.coordinates).toHaveLength(2);
  });

  it('does not route a mode without a profile', async () => {
    const { fetchTile, asked } = fixtures();
    const r = await createEngineCore({ fetchTile, source: 'test' }).shapeLink(JBT, OBT, null);
    expect(r.status).toBe('NOT_SHAPED');
    expect(asked).toEqual([]);
  });

  it('routes Jernbanetorget → Oslo bussterminal on the tiles, and a second time from its cache', async () => {
    const { fetchTile, asked } = fixtures();
    const core = createEngineCore({ fetchTile, source: 'openfreemap test' });
    const r = await core.shapeLink(JBT, OBT, 'bus');
    expect(r.status).toBe('OK');
    expect(r.key).toBe('NSR:Quay:7203|NSR:Quay:11972|bus');
    expect(r.engine).toBe(ENGINE_VERSION);
    expect(r.source).toBe('openfreemap test');
    expect(r.distanceM).toBeGreaterThan(400);
    expect(r.coordinates[0]).toEqual([JBT.lon, JBT.lat]);
    const before = asked.length;
    const t0 = Date.now();
    const again = await core.shapeLink(JBT, OBT, 'bus');
    expect(again.status).toBe('OK');
    expect(asked.length).toBe(before);
    expect(core.tilesUsed()).toBe(before);
    console.log(`warm link: ${Date.now() - t0} ms`); // performance log (target < 200 ms), not asserted
  });

  it('is ERROR (and fetches no more) when the tile host fails for a Quay\'s own tile', async () => {
    const core = createEngineCore({ fetchTile: async () => { throw new Error('offline'); }, source: 'test' });
    const r = await core.shapeLink(JBT, OBT, 'bus');
    expect(r.status).toBe('ERROR');
    expect(r.coordinates).toHaveLength(2);
  });

  it('stops at the tile budget: ERROR "tile budget used", never over it', async () => {
    const { fetchTile } = fixtures();
    const core = createEngineCore({ fetchTile, source: 'test', budget: 3 });
    const r = await core.shapeLink(JBT, OBT, 'bus');
    expect(r.status).toBe('ERROR');
    expect(r.warnings).toContain('tile budget used');
    expect(core.tilesUsed()).toBeLessThanOrEqual(3);
  });

  it('is the same place for two Quays a few metres apart', async () => {
    const r = await createEngineCore({ fetchTile: fixtures().fetchTile, source: 'test' }).shapeLink(JBT, { ...JBT, quayId: 'NSR:Quay:7204', lon: JBT.lon + 0.00002 }, 'bus');
    expect(r.status).toBe('OK');
    expect(r.warnings).toContain('same place');
  });

  it('warns about a long detour', async () => {
    // Two Quays 100 m apart, joined only by a road 3 km round
    const X = 8681 * 4096, Y = 4765 * 4096;
    const pts = /** @type {[number, number][]} */ ([[1000, 2000], [1000, 4000], [8000, 4000], [8000, 2000], [1330, 2000]]);
    const road = [{ cls: 'primary', subclass: '', props: { class: 'primary' }, extent: 4096, z: 14, points: pts.map(([x, y]) => /** @type {[number, number]} */ ([X + x, Y + y])) }];
    const core = createEngineCore({ fetchTile: async () => new Uint8Array(1), decode: () => road, source: 'test' });
    const [lonA, latA] = tileToLonLat(X + 1000, Y + 1990, 14, 4096), [lonB, latB] = tileToLonLat(X + 1330, Y + 1990, 14, 4096);
    const r = await core.shapeLink({ quayId: 'NSR:Quay:A', lon: lonA, lat: latA }, { quayId: 'NSR:Quay:B', lon: lonB, lat: latB }, 'bus');
    expect(r.status).toBe('OK');
    expect(r.warnings).toContain('long detour');
  });

  it('says NO_NETWORK_NEAR when a Quay is far from any road', async () => {
    const core = createEngineCore({ fetchTile: async () => new Uint8Array(1), decode: () => [], source: 'test' });
    const r = await core.shapeLink(JBT, OBT, 'bus');
    expect(r.status).toBe('NO_NETWORK_NEAR');
  });
});
