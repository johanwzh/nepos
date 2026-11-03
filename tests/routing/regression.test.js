// The spike cases the user reviewed (2026-10-30), on real OSM tiles cut to small boxes (tests/fixtures/routing/README.md).
// A failure here is a router bug: never loosen a check to make it pass.
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createRouter, routeWithTiles } from '../../src/routing/router-core.js';

const FIX = new URL('../fixtures/routing/', import.meta.url);
const cases = JSON.parse(readFileSync(new URL('cases.json', FIX), 'utf8'));
const raw = (path) => { const b = gunzipSync(readFileSync(path)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };

/** A router with every tile of a fixture area. */
function area(name) {
  const dir = new URL(`${name}/`, FIX), router = createRouter();
  router.addTiles(readdirSync(dir).filter((f) => f.endsWith('.bin.gz')).map((f) => ({ key: f.slice(0, -7), buf: raw(new URL(f, dir)) })));
  return router;
}
const routers = new Map();
/** opts: the U-turn length (backlog 107: every case must hold with U-turns allowed too). */
let opts = {};
function run(name, chain = cases.cases[name].chain) {
  const a = cases.cases[name].area;
  if (!routers.has(a)) routers.set(a, area(a));
  const r = routers.get(a).route(chain, opts);
  if (!r.ok) throw new Error(`${name}: ${JSON.stringify(r)}`);
  return r;
}
const noImmediateReversal = (coords) => coords.every((c, i) => i < 2 || c[0] !== coords[i - 2][0] || c[1] !== coords[i - 2][1]);

describe.each([['2.6.0 rules', {}], ['U-turns costed for a 12 m bus (backlog 107)', { uturnLength: 12 }]])('regression: the reviewed spike cases, %s', (_, o) => {
  beforeEach(() => { opts = o; });
  it('Manglerud T (B): on Ring 3 eastbound, no car-park loop', () => {
    const r = run('manglerud-b');
    expect(r.snaps[1].off).toBeLessThanOrEqual(15);
    expect(r.snaps[1].road).toContain('Adolf Hedins vei');
    expect(r.legs[0].metres).toBeLessThan(700);
  });

  it('Manglerud T (A): on Ring 3 westbound, no car-park loop', () => {
    const r = run('manglerud-a');
    expect(r.snaps[1].off).toBeLessThanOrEqual(15);
    expect(r.snaps[1].road).toContain('Adolf Hedins vei');
    expect(r.legs[1].metres).toBeLessThan(700);
  });

  it('Kalnes: snaps to the roundabout road, not E6 under the bridge', () => {
    const r = run('kalnes');
    expect(r.snaps[1].off).toBeLessThanOrEqual(10);
    expect(r.snaps[1].road).not.toContain('E 6');
  });

  it('Sarpsborg bussterminal: on Korsgata, no U-turn', () => {
    const r = run('sarpsborg');
    expect(r.snaps[1].off).toBeLessThanOrEqual(10);
    expect(r.snaps[1].road).toContain('Korsgata');
    r.legs.forEach((l) => expect(noImmediateReversal(l.coords)).toBe(true));
  });

  it('Sarpsborg with a waypoint on Sandesundsveien: that road, still two legs', () => {
    const r = run('sarpsborg-waypoint');
    expect(r.legs).toHaveLength(2);
    expect(r.legs[0].roads.join(' | ')).toContain('Sandesundsveien');
  });

  it('AMFI Borg: on the eastbound side', () => {
    const r = run('amfi-borg');
    expect(r.snaps[1].off).toBeLessThanOrEqual(10);
    const c = r.legs[0].coords;
    let i = c.length - 1, run_ = 0;
    while (i > 0 && run_ < 50) { run_ += Math.hypot((c[i][0] - c[i - 1][0]) * 56000, (c[i][1] - c[i - 1][1]) * 111000); i--; }
    expect(c[c.length - 1][0]).toBeGreaterThan(c[i][0]);
  });

  it('Lysaker brygge: on Strandveien, not the car park across it', () => {
    const r = run('lysaker-brygge');
    expect(r.snaps[1].off).toBeLessThanOrEqual(10);
    expect(r.snaps[1].road).toContain('Strandveien');
  });

  it('Sonsveien stasjon: not the petrol station', () => {
    const c = cases.cases.sonsveien.chain;
    // the outer stops (Mosseporten, Vestby bru) lie outside the box: points on the route over full tiles, 1 km either side
    const r = run('sonsveien', [{ lon: 10.7208753, lat: 59.5105202 }, c[1], { lon: 10.7274518, lat: 59.5201762 }]);
    expect(r.snaps[1].off).toBeLessThanOrEqual(10);
  });
});

const TILES = process.env.NEPOS_TILES_DIR;
describe.skipIf(!TILES || !existsSync(`${TILES}/manifest.json`))('regression on full tiles (NEPOS_TILES_DIR)', () => {
  const manifest = TILES ? JSON.parse(readFileSync(`${TILES}/manifest.json`, 'utf8')) : null;
  const router = createRouter();
  const load = async (k) => raw(`${TILES}/${k}.bin.gz`);

  it('E6 via Vinterbro: Korsegården to Ryen on E6, not Mosseveien', async () => {
    const r = await routeWithTiles(router, manifest, cases.optIn['e6-vinterbro'], load);
    if (!r.ok) throw new Error(JSON.stringify(r));
    const roads = r.legs[0].roads.join(' | ');
    expect(roads).toContain('E 6');
    expect(roads).not.toContain('Mosseveien');
  });

  it('line 23 (38 stops) routes in under a second', async () => {
    const chain = cases.optIn.line23;
    await routeWithTiles(router, manifest, chain, load);
    const t0 = performance.now();
    const r = router.route(chain);
    const ms = performance.now() - t0;
    console.info(`line 23: ${Math.round(ms)} ms`);
    expect(r.ok).toBe(true);
    expect(ms).toBeLessThan(1000);
  }, 30000);
});
