import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildGraph } from '../../src/shapes/graph.js';
import { decodeTile } from '../../src/shapes/tiles.js';
import { snap } from '../../src/shapes/snap.js';
import { route } from '../../src/shapes/search.js';
import { createHeap } from '../../src/shapes/heap.js';
import { tileToLonLat, haversineM } from '../../src/shapes/geometry.js';

const X = 8681 * 4096, Y = 4765 * 4096;
const line = (/** @type {string} */ cls, /** @type {[number, number][]} */ pts, props = {}) =>
  ({ cls, subclass: /** @type {any} */ (props).subclass ?? '', props: { class: cls, ...props }, extent: 4096, z: 14, points: pts.map(([x, y]) => /** @type {[number, number]} */ ([X + x, Y + y])) });
/** A point in the tile, as [lon, lat]. */
const at = (/** @type {number} */ x, /** @type {number} */ y) => tileToLonLat(X + x, Y + y, 14, 4096);
/** Route between two points on a graph made of `lines`. */
function go(/** @type {any[]} */ lines, /** @type {any} */ profile, /** @type {[number, number]} */ a, /** @type {[number, number]} */ b, opts = {}) {
  const g = buildGraph(lines, profile, 14);
  return route(g, snap(g, at(...a), profile), snap(g, at(...b), profile), profile, { ...opts, fromPoint: at(...a), toPoint: at(...b) });
}

describe('the heap', () => {
  it('pops the smallest first', () => {
    const h = createHeap(4);
    for (const [id, p] of [[1, 5], [2, 1], [3, 9], [4, 3], [5, 2]]) h.push(id, p);
    const order = [];
    while (h.size()) order.push(h.pop());
    expect(order).toEqual([2, 5, 4, 1, 3]);
  });
});

describe('snapping a Quay to the network', () => {
  it('finds the nearest edge within the radius; one 12 m further is another road (2026-10-19)', () => {
    const g = buildGraph([line('minor', [[0, 0], [1000, 0]]), line('minor', [[0, 60], [1000, 60]]), line('minor', [[0, 2000], [1000, 2000]])], 'bus', 14);
    const c = snap(g, at(500, 20), 'bus');
    expect(c.length).toBe(1); // the second road is 12 m further, the third far beyond 40 m
    expect(c[0].distM).toBeLessThan(8);
  });
});

describe('the turn-aware search (Lasse\'s spec: snapping and search)', () => {
  it('takes the shortest way round a block', () => {
    const lines = [line('minor', [[0, 0], [1000, 0]]), line('minor', [[1000, 0], [1000, 1000]]), line('minor', [[0, 0], [0, 3000], [1000, 3000], [1000, 1000]])];
    const r = /** @type {any} */ (go(lines, 'bus', [500, 0], [1000, 600]));
    expect(r).not.toBeNull();
    expect(r.distanceM).toBeLessThan(haversineM(at(500, 0), at(1000, 0)) + haversineM(at(1000, 0), at(1000, 600)) + 5);
  });

  it('never lets a train reverse through a switch (a V-shaped move is rejected)', () => {
    // A main line west–east and a branch leaving the switch back towards the west at a sharp angle
    const lines = [line('rail', [[0, 1000], [1000, 1000], [2000, 1000]], { subclass: 'rail' }), line('rail', [[1000, 1000], [200, 500]], { subclass: 'rail' })];
    expect(go(lines, 'rail', [300, 1000], [300, 562])).toBeNull();
    expect(go(lines, 'bus', [300, 1000], [300, 562])).toBeNull(); // rail lines are not roads
    const roads = lines.map((l) => ({ ...l, cls: 'minor', props: { class: 'minor' } }));
    expect(go(roads, 'bus', [300, 1000], [300, 562])).not.toBeNull(); // a bus may turn there
  });

  it('a bus takes the faster main road over a shorter back road (travel time, as Entur\'s OSRM bus profile)', () => {
    // A back road straight across (about 300 m at 25 km/h) against a trunk road round three sides (about 480 m at 65 km/h)
    const lines = [line('minor', [[0, 4000], [1000, 4000]]), line('trunk', [[0, 4000], [0, 4300], [1000, 4300], [1000, 4000]])];
    const r = /** @type {any} */ (go(lines, 'bus', [0, 4000], [1000, 4000]));
    expect(r.distanceM).toBeGreaterThan(400); // went round on the trunk road
    const back = /** @type {any} */ (go([lines[0]], 'bus', [0, 4000], [1000, 4000]));
    expect(back.cost).toBeGreaterThan(r.cost);
  });

  it('a bus costs seconds: road class speeds, and a slip road is slower than its road', () => {
    const one = (/** @type {string} */ cls, props = {}) => /** @type {any} */ (go([line(cls, [[0, 4500], [1000, 4500]], props)], 'bus', [0, 4500], [1000, 4500]));
    const trunk = one('trunk'), minor = one('minor'), ramp = one('trunk', { ramp: 1 }), service = one('service'), aisle = one('service', { service: 'parking_aisle' });
    expect(trunk.cost).toBeCloseTo(trunk.distanceM / (65 / 3.6), 0);
    expect(minor.cost).toBeCloseTo(minor.distanceM / (25 / 3.6), 0);
    expect(ramp.cost).toBeCloseTo(ramp.distanceM / (40 / 3.6), 0);
    expect(service.cost).toBeCloseTo(service.distanceM / (15 / 3.6), 0);
    expect(aisle.cost).toBeCloseTo(aisle.distanceM / (7.5 / 3.6), 0);
  });

  it('a bus turn at a junction costs a few seconds, a left turn more than a right; a bend without a junction costs nothing', () => {
    // A junction at (1000, 5000): from the west, turn left (north, y smaller) or right (south)
    const cross = [line('minor', [[0, 5000], [1000, 5000]]), line('minor', [[1000, 5000], [1000, 4400]]), line('minor', [[1000, 5000], [1000, 5600]])];
    const left = /** @type {any} */ (go(cross, 'bus', [0, 5000], [1000, 4400]));
    const right = /** @type {any} */ (go(cross, 'bus', [0, 5000], [1000, 5600]));
    const travel = (/** @type {any} */ r) => r.distanceM / (25 / 3.6);
    expect(left.cost - travel(left)).toBeGreaterThan(right.cost - travel(right));
    expect(left.cost - travel(left)).toBeLessThan(7.6);
    expect(right.cost - travel(right)).toBeGreaterThan(1);
    const bend = [line('minor', [[0, 6000], [1000, 6000]]), line('minor', [[1000, 6000], [1000, 6600]])];
    const b = /** @type {any} */ (go(bend, 'bus', [0, 6000], [1000, 6600]));
    expect(b.cost - travel(b)).toBeLessThan(0.5);
  });

  it('lets a tram take a 90° street corner but not a hairpin', () => {
    const corner = [line('transit', [[0, 2000], [1000, 2000]], { subclass: 'tram' }), line('transit', [[1000, 2000], [1000, 3000]], { subclass: 'tram' })];
    expect(go(corner, 'tram', [500, 2000], [1000, 2500])).not.toBeNull();
    const hairpin = [line('transit', [[0, 2000], [1000, 2000]], { subclass: 'tram' }), line('transit', [[1000, 2000], [100, 2300]], { subclass: 'tram' })];
    expect(go(hairpin, 'tram', [300, 2000], [300, 2233])).toBeNull();
  });

  it('starts in the direction the train arrived, and reverses at the stop only when it must', () => {
    const track = [line('rail', [[0, 3000], [2000, 3000]], { subclass: 'rail' })];
    const ahead = /** @type {any} */ (go(track, 'rail', [500, 3000], [1500, 3000], { arriveBearing: 90 }));
    expect(ahead.warnings).toEqual([]);
    const back = /** @type {any} */ (go(track, 'rail', [1500, 3000], [500, 3000], { arriveBearing: 90 }));
    expect(back).not.toBeNull();
    expect(back.warnings).toContain('reversed at stop');
    expect(Math.abs(back.arriveBearing - 270)).toBeLessThan(5);
  });

  it('a stop belongs to the lane it stands beside, not the far carriageway 10 m away (Bjerke, user 2026-10-19)', () => {
    const lanes = [line('primary', [[0, 3500], [1000, 3500]], { oneway: 1 }), line('primary', [[1000, 3530], [0, 3530]], { oneway: 1 })];
    const g = buildGraph(lanes, 'bus', 14);
    const c = snap(g, at(500, 3495), 'bus');
    expect(c).toHaveLength(1);
    expect(g.edges[c[0].edge].geom[0][0]).toBeLessThan(g.edges[c[0].edge].geom.at(-1)[0]); // the eastbound lane
  });

  it('a stop between two roads (on an island) keeps both', () => {
    const lanes = [line('primary', [[0, 3700], [1000, 3700]], { oneway: 1 }), line('primary', [[1000, 3730], [0, 3730]], { oneway: 1 })];
    const g = buildGraph(lanes, 'bus', 14);
    expect(snap(g, at(500, 3715), 'bus')).toHaveLength(2);
    const r = /** @type {any} */ (go(lanes, 'bus', [900, 3715], [100, 3715]));
    expect(r).not.toBeNull();
  });

  it('a service road a little nearer does not win over the main road the stop stands beside', () => {
    const g = buildGraph([line('trunk', [[0, 3900], [1000, 3900]]), line('service', [[0, 3880], [1000, 3880]])], 'bus', 14);
    const c = snap(g, at(500, 3887), 'bus'); // 13 units from the trunk road, 7 from the service road: doubled, 14
    expect(g.edges[c[0].edge].cls).toBe('trunk');
    const near = snap(g, at(500, 3884), 'bus'); // 16 from the trunk, 4 from the service road: doubled, 8, still nearer
    expect(g.edges[near[0].edge].cls).toBe('service');
  });

  it('gives null when there is no path', () => {
    expect(go([line('minor', [[0, 0], [100, 0]]), line('minor', [[2000, 0], [2100, 0]])], 'bus', [50, 0], [2050, 0])).toBeNull();
  });

  it('starts at the first Quay and ends at the second', () => {
    const r = /** @type {any} */ (go([line('minor', [[0, 0], [1000, 0]])], 'bus', [100, 30], [900, 30]));
    expect(haversineM(r.coords[0], at(100, 30))).toBeLessThan(0.01);
    expect(haversineM(r.coords[r.coords.length - 1], at(900, 30))).toBeLessThan(0.01);
  });

  it('routes Jernbanetorget to Oslo bussterminal on the real Oslo tiles', () => {
    const lines = [];
    for (const x of [8680, 8681, 8682]) for (const y of [4764, 4765, 4766]) lines.push(...decodeTile(new Uint8Array(readFileSync(`tests/fixtures/shapes/14-${x}-${y}.pbf`)), 14, x, y));
    const g = buildGraph(lines, 'bus', 14);
    const a = /** @type {[number, number]} */ ([10.749736, 59.911425]), b = /** @type {[number, number]} */ ([10.758242, 59.911848]);
    const r = /** @type {any} */ (route(g, snap(g, a, 'bus'), snap(g, b, 'bus'), 'bus', { fromPoint: a, toPoint: b }));
    expect(r).not.toBeNull();
    expect(r.distanceM).toBeGreaterThan(400);
    expect(r.distanceM).toBeLessThan(1500);
  });
});
