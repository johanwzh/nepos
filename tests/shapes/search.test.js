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
  it('finds up to K nearby edges, nearest first, one per edge, within the radius', () => {
    const g = buildGraph([line('minor', [[0, 0], [1000, 0]]), line('minor', [[0, 60], [1000, 60]]), line('minor', [[0, 2000], [1000, 2000]])], 'bus', 14);
    const c = snap(g, at(500, 20), 'bus');
    expect(c.length).toBe(2); // the third road is far beyond 40 m
    expect(c[0].distM).toBeLessThan(c[1].distM);
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

  it('a sharp bus turn costs the profile\'s turn cost', () => {
    const hairpin = [line('minor', [[0, 1600], [1000, 1600]]), line('minor', [[1000, 1600], [100, 1900]])];
    const r = /** @type {any} */ (go(hairpin, 'bus', [300, 1600], [300, 1833]));
    expect(r).not.toBeNull();
    expect(r.cost).toBeGreaterThan(r.distanceM + 450);
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

  it('reaches the far lane of a dual carriageway when the near lane runs the wrong way', () => {
    const lanes = [line('primary', [[0, 3500], [1000, 3500]], { oneway: 1 }), line('primary', [[1000, 3530], [0, 3530]], { oneway: 1 })];
    // The Quay is beside the eastbound lane, the next stop to the west
    const r = /** @type {any} */ (go(lanes, 'bus', [900, 3495], [100, 3495]));
    expect(r).not.toBeNull();
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
