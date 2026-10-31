// The routing session engine (routing editor, 2026-10-31): it routes only on request, holds proposals per journey
// pattern, and changes the links file only on Accept / Keep. On real road tiles (tests/fixtures/routing/ostfold, the
// reviewed spike cases).
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
function fixtureTiles(published = manifest) {
  return {
    open: vi.fn(async () => ({ manifest, newer: false })),
    loadTile: vi.fn(async (/** @type {string} */ key) => { const b = gunzipSync(readFileSync(new URL(`${key}.bin.gz`, FIX))); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); }),
    stats: () => ({ downloaded: 0, bytes: 0, cached: 0 }),
    published: vi.fn(async () => published),
  };
}

/** @type {Map<string, { lat: number, lon: number }>} */
const QUAYS = new Map();
for (const c of Object.values(cases)) for (const p of /** @type {any[]} */ (c.chain)) if (p?.quay) QUAYS.set(p.quay, { lon: p.lon, lat: p.lat });
QUAYS.set('NSR:Quay:9', { lon: 12.5, lat: 59.28 }); // off the fixture's map
const key = (/** @type {string} */ a, /** @type {string} */ b) => `NSR:Quay:${a}|NSR:Quay:${b}|bus`;
const pid = (/** @type {string[]} */ ids) => ids.map((n) => `NSR:Quay:${n}`).join(' ');
const SARPSBORG = ['4455', '5181', '5221'];
const AMFI = ['4446', '4455', '5181'];
const WAYPOINT = /** @type {[number, number]} */ ([11.104135, 59.277299]); // on Sandesundsveien
const NOW = () => new Date('2026-10-31T12:00:00Z');
const CAL = [{ id: 'c', name: 'Jan', ranges: /** @type {[string, string][]} */ ([['20260101', '20260131']]) }];

/** A bus line with one table set: one trip (uid t<i>) per pattern of Quay numbers, each on rows of its own. @param {string[][]} patterns */
function line(patterns) {
  const stops = patterns.flat().map((n) => ({ name: `S${n}`, stopId: `NSR:Quay:${n}`, isDwellArr: false }));
  let row = 0;
  const cols = patterns.map((p, i) => {
    const cells = stops.map(() => /** @type {any} */ (null));
    p.forEach((_, j) => { cells[row + j] = { time: `07${String(10 + j * 5).padStart(2, '0')}`, dayOffset: 0 }; });
    row += p.length;
    return { uid: `t${i}`, dayCode: 'D', cells };
  });
  return { mode: 'bus', submode: 'localBus', tableSets: [{ id: 0, name: 'T' }], periods: [{ id: 0, setId: 0, calendarIds: ['c'] }], grids: { '0:0': { stops, cols } } };
}
const EMPTY = { version: 1, line: 'L1', links: {}, snaps: {} };

/** @param {string[][]} patterns @param {any} [lineLinks] */
function session(patterns, lineLinks = EMPTY, { router = createRouter(), tiles = fixtureTiles(), quayInfo = QUAYS, rs = line(patterns) } = {}) {
  const s = createRoutingSession({ code: 'L1', rs, setId: 0, calendars: CAL, lineLinks, quayInfo, router, tiles, now: NOW });
  return Object.assign(s, { router, tiles });
}
const stateOf = (/** @type {any} */ s, /** @type {string} */ id) => s.states().find((/** @type {any} */ x) => x.pattern.id === id);
const leg = (/** @type {any} */ s, /** @type {string} */ id, /** @type {string} */ k) => s.proposal(id)?.legs.get(k);

describe('routing session: nothing happens without the user', () => {
  it('open() reads the published build only: no tiles, no routing; every pattern red (Review Focus 2)', async () => {
    const s = session([SARPSBORG]);
    const spy = vi.spyOn(s.router, 'route');
    await s.open();
    expect(s.tiles.open).not.toHaveBeenCalled();
    expect(s.tiles.loadTile).not.toHaveBeenCalled();
    expect(spy).not.toHaveBeenCalled();
    expect(s.states().map((x) => x.state)).toEqual(['red']);
    expect(s.pending()).toEqual([]);
  });

  it('route() on a red pattern proposes; the state stays red until Accept', async () => {
    const s = session([SARPSBORG]);
    await s.open();
    await s.route(pid(SARPSBORG));
    const l = /** @type {any} */ (leg(s, pid(SARPSBORG), key('4455', '5181')));
    expect(l.status).toBe('OK');
    const pts = decodePolyline(l.polyline, l.precision);
    expect(haversineM(pts[0], [11.10, 59.28])).toBeLessThan(5000);
    expect(l).toMatchObject({ routedAt: '2026-10-31T12:00:00.000Z', tiles: { set: 'road', built: manifest.built } });
    expect(s.tiles.open).toHaveBeenCalledTimes(1);
    expect(stateOf(s, pid(SARPSBORG)).state).toBe('red');
    expect(s.pending()).toEqual([pid(SARPSBORG)]);
  });

  it('accept() returns the file with the links, the pattern record and one snap per Quay; then green', async () => {
    const s = session([SARPSBORG]);
    await s.open();
    await s.route(pid(SARPSBORG));
    const file = await s.accept(pid(SARPSBORG));
    expect(Object.keys(file.links).sort()).toEqual([key('4455', '5181'), key('5181', '5221')]);
    expect(file.patterns?.[pid(SARPSBORG)]).toMatchObject({ stops: SARPSBORG.map((n) => `NSR:Quay:${n}`), keys: [key('4455', '5181'), key('5181', '5221')], trips: ['t0'], acceptedAt: '2026-10-31T12:00:00.000Z' });
    expect(Object.keys(file.snaps).sort()).toEqual(['NSR:Quay:4455', 'NSR:Quay:5181', 'NSR:Quay:5221']);
    expect(stateOf(s, pid(SARPSBORG)).state).toBe('green');
    expect(s.pending()).toEqual([]);
  });

  it('a shared leg accepted in one pattern: the other pattern shows it routed (Review Focus 4)', async () => {
    const s = session([SARPSBORG, AMFI]);
    await s.open();
    await s.route(pid(SARPSBORG));
    await s.accept(pid(SARPSBORG));
    expect(stateOf(s, pid(AMFI)).legs.map((/** @type {any} */ l) => l.state)).toEqual(['none', 'routed']);
    await s.route(pid(AMFI));
    // only the red leg is routed; the shared one keeps the accepted link
    expect([...(/** @type {any} */ (s.proposal(pid(AMFI)))).legs.keys()]).toEqual([key('4446', '4455')]);
    const file = await s.accept(pid(AMFI));
    expect(Object.keys(file.patterns ?? {})).toHaveLength(2);
    expect(s.states().map((x) => x.state)).toEqual(['green', 'green']);
  });

  it('waypoints placed before Route are stored only, then used by Route', async () => {
    const s = session([SARPSBORG]);
    const spy = vi.spyOn(s.router, 'route');
    await s.open();
    await s.setWaypoints(pid(SARPSBORG), key('4455', '5181'), [WAYPOINT]);
    expect(spy).not.toHaveBeenCalled();
    await s.route(pid(SARPSBORG));
    const l = /** @type {any} */ (leg(s, pid(SARPSBORG), key('4455', '5181')));
    expect(l.via).toEqual([WAYPOINT]);
    expect(l.roads.join(' | ')).toContain('Sandesundsveien');
  });

  it('a waypoint on a proposed leg routes that leg again, and nothing else', async () => {
    const s = session([SARPSBORG]);
    await s.open();
    await s.route(pid(SARPSBORG));
    const other = leg(s, pid(SARPSBORG), key('5181', '5221'));
    await s.setWaypoints(pid(SARPSBORG), key('4455', '5181'), [WAYPOINT]);
    expect(/** @type {any} */ (leg(s, pid(SARPSBORG), key('4455', '5181'))).roads.join(' | ')).toContain('Sandesundsveien');
    expect(leg(s, pid(SARPSBORG), key('5181', '5221'))).toBe(other);
  });

  it('discard() drops the proposal; nothing changes', async () => {
    const s = session([SARPSBORG]);
    await s.open();
    await s.route(pid(SARPSBORG));
    s.discard(pid(SARPSBORG));
    expect(s.proposal(pid(SARPSBORG))).toBeNull();
    expect(s.pending()).toEqual([]);
  });

  it('updateAll() routes and accepts every red and orange pattern', async () => {
    const s = session([SARPSBORG, AMFI]);
    await s.open();
    const file = await s.updateAll();
    expect(Object.keys(file.links)).toHaveLength(3);
    expect(s.states().map((x) => x.state)).toEqual(['green', 'green']);
  });
});

describe('routing session: orange patterns', () => {
  /** A file with SARPSBORG accepted. */
  async function acceptedFile() {
    const s = session([SARPSBORG]);
    await s.open();
    await s.route(pid(SARPSBORG));
    return s.accept(pid(SARPSBORG));
  }

  it('a Quay moved: orange; keep() turns it green without changing a metre', async () => {
    const saved = await acceptedFile();
    const moved = new Map(QUAYS);
    const q = /** @type {any} */ (QUAYS.get('NSR:Quay:5181'));
    moved.set('NSR:Quay:5181', { lon: q.lon, lat: q.lat + 0.0015 }); // about 170 m north
    const s = session([SARPSBORG], saved, { quayInfo: moved });
    await s.open();
    expect(stateOf(s, pid(SARPSBORG)).state).toBe('orange');
    const file = s.keep(pid(SARPSBORG));
    expect(stateOf(s, pid(SARPSBORG)).state).toBe('green');
    for (const k of [key('4455', '5181'), key('5181', '5221')]) {
      expect(file.links[k].polyline).toBe(saved.links[k].polyline);
      expect(file.links[k].distanceM).toBe(saved.links[k].distanceM);
    }
  });

  it('a Quay moved and routed again snaps again on Accept; the other Quays keep theirs (final I4)', async () => {
    const saved = await acceptedFile();
    const moved = new Map(QUAYS);
    const q = /** @type {any} */ (QUAYS.get('NSR:Quay:5181'));
    moved.set('NSR:Quay:5181', { lon: q.lon, lat: q.lat + 0.0015 });
    const s = session([SARPSBORG], saved, { quayInfo: moved });
    await s.open();
    await s.route(pid(SARPSBORG));
    const file = await s.accept(pid(SARPSBORG));
    expect(file.snaps['NSR:Quay:5181']).not.toEqual(saved.snaps['NSR:Quay:5181']);
    expect(file.snaps['NSR:Quay:4455']).toEqual(saved.snaps['NSR:Quay:4455']);
  });

  it('newer road data: orange; Route on it again gives the saved link object when nothing changed', async () => {
    const saved = await acceptedFile();
    const s = session([SARPSBORG], saved, { tiles: fixtureTiles({ ...manifest, built: '2099-01-01T00:00:00Z' }) });
    await s.open();
    expect(stateOf(s, pid(SARPSBORG)).legs.map((/** @type {any} */ l) => l.state)).toEqual(['map', 'map']);
    await s.route(pid(SARPSBORG));
    expect(leg(s, pid(SARPSBORG), key('4455', '5181'))).toBe(saved.links[key('4455', '5181')]);
  });

  it('a green pattern routed again with nothing changed proposes the saved links (a loop line too, final I5)', async () => {
    const loop = ['4446', '4455', '4446'];
    const first = session([loop]);
    await first.open();
    await first.route(pid(loop));
    const saved = await first.accept(pid(loop));
    const again = session([loop], saved);
    await again.open();
    expect(stateOf(again, pid(loop)).state).toBe('green');
    await again.route(pid(loop));
    expect(leg(again, pid(loop), key('4446', '4455'))).toBe(saved.links[key('4446', '4455')]);
    expect(Object.keys(saved.snaps)).toEqual(['NSR:Quay:4446', 'NSR:Quay:4455']);
  });

  it('a changed leg (Quay replaced on a row) carries the old key in its proposal', async () => {
    const saved = await acceptedFile();
    // same trip t0, row 2 now calls 5221 → 4446 replaced: 4455, 4446, 5221
    const s = session([['4455', '4446', '5221']], saved);
    await s.open();
    expect(stateOf(s, pid(['4455', '4446', '5221'])).state).toBe('orange');
    await s.route(pid(['4455', '4446', '5221']));
    expect((/** @type {any} */ (s.proposal(pid(['4455', '4446', '5221'])))).old.get(key('4455', '4446'))).toBe(key('4455', '5181'));
  });
});

describe('routing session: failures stay contained', () => {
  it('a stop off the map: its legs fail, the other leg is still proposed (plan-3 Review Focus 2)', async () => {
    const p = ['4446', '4455', '9', '5181'];
    const s = session([p]);
    await s.open();
    await s.route(pid(p));
    const legs = /** @type {any} */ (s.proposal(pid(p))).legs;
    expect([...legs.values()].map((l) => l.status ?? l.state)).toEqual(['OK', 'no-road', 'no-road']);
    const file = await s.accept(pid(p));
    expect(Object.keys(file.links)).toEqual([key('4446', '4455')]);
    expect(stateOf(s, pid(p)).state).toBe('red');
  });

  it('a map tile that cannot be loaded fails only its legs (final I3)', async () => {
    const tiles = fixtureTiles();
    tiles.loadTile = vi.fn(async () => { throw new Error('routing-offline'); });
    const s = session([SARPSBORG], EMPTY, { tiles });
    await s.open();
    await s.route(pid(SARPSBORG));
    expect([...(/** @type {any} */ (s.proposal(pid(SARPSBORG)))).legs.values()]).toEqual([
      { state: 'no-route', error: 'routing-offline' }, { state: 'no-route', error: 'routing-offline' }]);
  });

  it('a waypoint whose routing throws leaves the proposed leg as it was (final I3)', async () => {
    const s = session([SARPSBORG]);
    await s.open();
    await s.route(pid(SARPSBORG));
    const before = leg(s, pid(SARPSBORG), key('4455', '5181'));
    s.router.route = () => { throw new Error('routing-bad-tile'); };
    await expect(s.setWaypoints(pid(SARPSBORG), key('4455', '5181'), [WAYPOINT])).rejects.toThrow('routing-bad-tile');
    expect(leg(s, pid(SARPSBORG), key('4455', '5181'))).toBe(before);
    expect(/** @type {any} */ (s.proposal(pid(SARPSBORG))).via.get(key('4455', '5181')) ?? []).toEqual([]);
  });

  it('final review 1: newer road data, Route then Accept on an unchanged route turns it green without changing a metre', async () => {
    const first = session([SARPSBORG]);
    await first.open();
    await first.route(pid(SARPSBORG));
    const saved = /** @type {any} */ (await first.accept(pid(SARPSBORG)));
    for (const k of Object.keys(saved.links)) saved.links[k] = { ...saved.links[k], tiles: { ...saved.links[k].tiles, built: '2000-01-01T00:00:00Z' } };
    const s = session([SARPSBORG], saved);
    await s.open();
    expect(stateOf(s, pid(SARPSBORG)).state).toBe('orange');
    await s.route(pid(SARPSBORG));
    expect(/** @type {any} */ (s.tiles.open.mock.calls[0])[1]).toEqual({ latest: true });
    const file = await s.accept(pid(SARPSBORG));
    expect(stateOf(s, pid(SARPSBORG)).state).toBe('green');
    const k = key('4455', '5181');
    expect([file.links[k].polyline, file.links[k].distanceM]).toEqual([saved.links[k].polyline, saved.links[k].distanceM]);
  });

  it('says when newer map data exists than the build it routes on', async () => {
    const tiles = fixtureTiles();
    tiles.open.mockResolvedValue({ manifest, newer: true });
    const s = session([SARPSBORG], EMPTY, { tiles });
    await s.open();
    await s.route(pid(SARPSBORG));
    expect(s.newerMap()).toBe(true);
  });

  it('accept keeps the links, snaps and patterns of other table sets', async () => {
    const other = { polyline: 'x', precision: 6, distanceM: 5, status: 'OK', from: [10, 59], to: [10.1, 59] };
    const file0 = { version: 1, line: 'L1', links: { [key('1', '2')]: other }, snaps: { 'NSR:Quay:1': { way: 1, lon: 10, lat: 59, along: true, off: 1, road: 'x' } },
      patterns: { 'NSR:Quay:1 NSR:Quay:2': { stops: ['NSR:Quay:1', 'NSR:Quay:2'], keys: [key('1', '2')], trips: ['x1'], acceptedAt: '' } } };
    const s = session([SARPSBORG], file0);
    await s.open();
    await s.route(pid(SARPSBORG));
    const r = await s.accept(pid(SARPSBORG));
    expect(r.links[key('1', '2')]).toBe(other);
    expect(r.snaps['NSR:Quay:1'].road).toBe('x');
    expect(Object.keys(r.patterns ?? {})).toContain('NSR:Quay:1 NSR:Quay:2');
  });
});
