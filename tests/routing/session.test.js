// The routing session engine (spec §5–§7) on real road tiles (tests/fixtures/routing/ostfold, the reviewed spike cases).
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createRouter } from '../../src/routing/router-core.js';
import { createRoutingSession } from '../../src/routing/session.js';
import { decodePolyline, haversineM } from '../../src/routing/geometry.js';

const FIX = new URL('../fixtures/routing/ostfold/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', FIX), 'utf8'));
const cases = JSON.parse(readFileSync(new URL('../fixtures/routing/cases.json', import.meta.url), 'utf8')).cases;

/** A tile source over the fixture folder. */
function fixtureTiles() {
  return {
    open: vi.fn(async () => ({ manifest, newer: false })),
    loadTile: async (/** @type {string} */ key) => { const b = gunzipSync(readFileSync(new URL(`${key}.bin.gz`, FIX))); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); },
    stats: () => ({ downloaded: 0, bytes: 0, cached: 0 }),
  };
}

/** @type {Record<string, import('../../src/core/link-pairs.js').QuayRef>} */
const Q = {};
for (const c of Object.values(cases)) for (const p of /** @type {any[]} */ (c.chain)) if (p?.quay) Q[p.quay.slice(9)] = { quayId: p.quay, lon: p.lon, lat: p.lat };
const key = (/** @type {string} */ a, /** @type {string} */ b) => `NSR:Quay:${a}|NSR:Quay:${b}|bus`;
/** A chain of Quay numbers, as linkChains gives it. */
const chain = (/** @type {string[]} */ ids) => ({ stops: ids.map((id) => Q[id]), keys: ids.slice(1).map((id, i) => key(ids[i], id)) });
const SARPSBORG = chain(['4455', '5181', '5221']);
const AMFI = chain(['4446', '4455', '5181']);
const WAYPOINT = /** @type {[number, number]} */ ([11.104135, 59.277299]); // on Sandesundsveien
const NOW = () => new Date('2026-10-31T12:00:00Z');

/** @param {any[]} chains @param {any} [lineLinks] */
function session(chains, lineLinks = { version: 1, line: 'L1', links: {}, snaps: {} }, router = createRouter()) {
  return createRoutingSession({ code: 'L1', chains, lineLinks, quayInfo: new Map(), router, tiles: fixtureTiles(), now: NOW });
}
const byKey = (/** @type {any} */ s) => new Map(s.pairs().map((/** @type {any} */ p) => [p.key, p]));

describe('routing session', () => {
  it('routes a chain into its pairs, each with a polyline along the leg, from Quay to Quay', async () => {
    const s = session([SARPSBORG]);
    const progress = vi.fn();
    await s.start(progress);
    expect(progress).toHaveBeenLastCalledWith(1, 1);
    const pairs = s.pairs();
    expect(pairs.map((p) => [p.key, p.state])).toEqual([[key('4455', '5181'), 'routed'], [key('5181', '5221'), 'routed']]);
    const link = /** @type {any} */ (pairs[0].link);
    const pts = decodePolyline(link.polyline, link.precision);
    expect(haversineM(pts[0], [Q['4455'].lon, Q['4455'].lat])).toBeLessThan(30);
    expect(haversineM(pts[pts.length - 1], [Q['5181'].lon, Q['5181'].lat])).toBeLessThan(30);
    expect(link).toMatchObject({ status: 'OK', from: [Q['4455'].lon, Q['4455'].lat], to: [Q['5181'].lon, Q['5181'].lat], via: [], routedAt: '2026-10-31T12:00:00.000Z',
      tiles: { set: 'road', built: manifest.built, dataDate: manifest.dataDate } });
    expect(link.distanceM).toBeGreaterThan(1000);
    expect(link.seconds).toBeGreaterThan(0);
    expect(Object.keys(link.tiles.hashes).sort()).toEqual(['43_474', '44_474']);
    expect(Object.keys(s.result().snaps).sort()).toEqual(['NSR:Quay:4455', 'NSR:Quay:5181', 'NSR:Quay:5221']);
    expect(s.result().snaps['NSR:Quay:5181'].road).toContain('Korsgata');
  });

  it('two patterns sharing a pair: one link, one snap per Quay (Review Focus 1)', async () => {
    const both = session([SARPSBORG, AMFI]);
    await both.start();
    const alone = session([SARPSBORG]);
    await alone.start();
    const pairs = byKey(both);
    expect([...pairs.keys()]).toEqual([key('4455', '5181'), key('5181', '5221'), key('4446', '4455')]);
    expect([...pairs.values()].every((p) => p.state === 'routed')).toBe(true);
    expect(pairs.get(key('4455', '5181')).link.polyline).toBe(byKey(alone).get(key('4455', '5181')).link.polyline);
    expect(both.result().snaps['NSR:Quay:4455']).toEqual(alone.result().snaps['NSR:Quay:4455']);
  });

  it('a waypoint re-routes that pair through it, and nothing else', async () => {
    const router = createRouter(), spy = vi.spyOn(router, 'route');
    const s = session([SARPSBORG], undefined, router);
    await s.start();
    const other = byKey(s).get(key('5181', '5221')).link;
    expect(byKey(s).get(key('4455', '5181')).link.roads.join(' | ')).not.toContain('Sandesundsveien');
    spy.mockClear();
    await s.setWaypoints(key('4455', '5181'), [WAYPOINT]);
    const p = byKey(s).get(key('4455', '5181'));
    expect(p.via).toEqual([WAYPOINT]);
    expect(p.link.via).toEqual([WAYPOINT]);
    expect(p.link.roads.join(' | ')).toContain('Sandesundsveien');
    expect(byKey(s).get(key('5181', '5221')).link).toBe(other);
    expect(spy.mock.calls.every(([c]) => c.some((/** @type {any} */ x) => x.via))).toBe(true);
    expect(spy.mock.calls.flatMap(([c]) => c.filter((/** @type {any} */ x) => !x.via).map((/** @type {any} */ x) => x.lon))).not.toContain(Q['5221'].lon);
  });

  it('a stop off the map: its pairs fail, the other pairs of the chain are still routed (Review Focus 2)', async () => {
    const far = { quayId: 'NSR:Quay:9', lon: 12.5, lat: 59.28 };
    const s = session([{ stops: [Q['4446'], Q['4455'], far, Q['5181']], keys: [key('4446', '4455'), `NSR:Quay:4455|NSR:Quay:9|bus`, `NSR:Quay:9|NSR:Quay:5181|bus`] }]);
    await s.start();
    expect(s.pairs().map((p) => p.state)).toEqual(['routed', 'no-road', 'no-road']);
    expect(Object.keys(s.result().links)).toEqual([key('4446', '4455')]);
  });

  it('result() keeps the links and snaps of other table sets (Review Focus 4); a failed pair keeps its old link', async () => {
    const other = { polyline: 'x', precision: 6, distanceM: 5, status: 'OK', from: [10, 59], to: [10.1, 59] };
    const oldFailed = { ...other, polyline: 'y' };
    const s = session([SARPSBORG, { stops: [Q['5221'], { quayId: 'NSR:Quay:9', lon: 12.5, lat: 59.28 }], keys: ['NSR:Quay:5221|NSR:Quay:9|bus'] }],
      { version: 1, line: 'L1', links: { [key('1', '2')]: other, 'NSR:Quay:5221|NSR:Quay:9|bus': oldFailed }, snaps: { 'NSR:Quay:1': { way: 1, lon: 10, lat: 59, along: true, off: 1, road: 'x' } } });
    await s.start();
    const r = s.result();
    expect(r.line).toBe('L1');
    expect(r.links[key('1', '2')]).toBe(other);
    expect(r.links['NSR:Quay:5221|NSR:Quay:9|bus']).toBe(oldFailed);
    expect(r.links[key('4455', '5181')].status).toBe('OK');
    expect(r.snaps['NSR:Quay:1'].road).toBe('x');
  });

  it('a saved line opened again routes the same: nothing to save; the saved waypoints are used', async () => {
    const first = session([SARPSBORG]);
    await first.start();
    expect(first.dirty()).toBe(true);
    await first.setWaypoints(key('4455', '5181'), [WAYPOINT]);
    const saved = first.result();
    const again = session([SARPSBORG], saved);
    expect(again.pairs().map((p) => p.state)).toEqual(['pending', 'pending']);
    expect(byKey(again).get(key('4455', '5181')).via).toEqual([WAYPOINT]);
    await again.start();
    expect(again.dirty()).toBe(false);
    expect(again.result()).toEqual(saved);
    await again.setWaypoints(key('4455', '5181'), []);
    expect(again.dirty()).toBe(true);
  });

  it('opens the tiles once for every stop, and says when newer map data exists', async () => {
    const tiles = fixtureTiles();
    tiles.open.mockResolvedValue({ manifest, newer: true });
    const s = createRoutingSession({ code: 'L1', chains: [SARPSBORG, AMFI], lineLinks: { version: 1, line: 'L1', links: {}, snaps: {} }, quayInfo: new Map(), router: createRouter(), tiles, now: NOW });
    await s.start();
    expect(tiles.open).toHaveBeenCalledTimes(1);
    expect(/** @type {any[]} */ (tiles.open.mock.calls[0])[0]).toHaveLength(4);
    expect(s.newerMap()).toBe(true);
  });
});
