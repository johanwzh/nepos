import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildGraph, components } from '../../src/shapes/graph.js';
import { profileFor, zoomFor, PROFILES } from '../../src/shapes/profiles.js';
import { decodeTile } from '../../src/shapes/tiles.js';

const X = 8681 * 4096, Y = 4765 * 4096;
/** A line in the Oslo S tile, from points given relative to the tile's corner. */
const line = (/** @type {string} */ cls, /** @type {[number, number][]} */ pts, props = {}) =>
  ({ cls, subclass: /** @type {any} */ (props).subclass ?? '', props: { class: cls, ...props }, extent: 4096, z: 14, points: pts.map(([x, y]) => /** @type {[number, number]} */ ([X + x, Y + y])) });
/** Can you get from the node at a to the node at b along directed edges? */
function reaches(/** @type {any} */ g, /** @type {[number, number]} */ a, /** @type {[number, number]} */ b) {
  const node = (/** @type {[number, number]} */ p) => g.nodeAt(X + p[0], Y + p[1]);
  const start = node(a), goal = node(b);
  if (start < 0 || goal < 0) return false;
  const seen = new Set([start]);
  const todo = [start];
  while (todo.length) {
    const n = /** @type {number} */ (todo.pop());
    if (n === goal) return true;
    for (const d of g.out[n]) { const t = g.dTo[d]; if (!seen.has(t)) { seen.add(t); todo.push(t); } }
  }
  return false;
}

describe('the routing graph (Lasse\'s spec: graph construction)', () => {
  it('a one-way bus street is one directed edge, a two-way street two', () => {
    const g = buildGraph([line('minor', [[100, 100], [400, 100]], { oneway: 1 }), line('minor', [[100, 300], [400, 300]])], 'bus', 14);
    expect(reaches(g, [100, 100], [400, 100])).toBe(true);
    expect(reaches(g, [400, 100], [100, 100])).toBe(false);
    expect(reaches(g, [400, 300], [100, 300])).toBe(true);
  });

  it('a bridge over a road does not connect to it', () => {
    const g = buildGraph([line('primary', [[100, 500], [500, 500]]), line('primary', [[300, 300], [300, 500], [300, 700]], { brunnel: 'bridge', layer: 1 })], 'bus', 14);
    expect(reaches(g, [100, 500], [300, 700])).toBe(false);
  });

  it('a bridge connects to the ground at its ends', () => {
    const g = buildGraph([line('primary', [[100, 100], [300, 100]]), line('primary', [[300, 100], [500, 100]], { brunnel: 'bridge', layer: 1 }), line('primary', [[500, 100], [700, 100]])], 'bus', 14);
    expect(reaches(g, [100, 100], [700, 100])).toBe(true);
  });

  it('two roads meeting on the same bridge connect', () => {
    const g = buildGraph([line('primary', [[100, 900], [300, 900], [500, 900]], { brunnel: 'bridge', layer: 1 }), line('secondary', [[300, 700], [300, 900]], { brunnel: 'bridge', layer: 1 })], 'bus', 14);
    expect(reaches(g, [300, 700], [500, 900])).toBe(true);
  });

  it('a vertex shared in the middle of two lines splits both', () => {
    const g = buildGraph([line('minor', [[100, 1200], [300, 1200], [500, 1200]]), line('minor', [[300, 1000], [300, 1200], [300, 1400]])], 'bus', 14);
    expect(reaches(g, [100, 1200], [300, 1400])).toBe(true);
    expect(g.nodeAt(X + 300, Y + 1200)).toBeGreaterThanOrEqual(0);
  });

  it('a side road ending on the middle of a segment (no vertex there) joins it: T-junctions in the tiles', () => {
    const g = buildGraph([line('primary', [[100, 2500], [900, 2500]]), line('minor', [[500, 2300], [501, 2499]])], 'bus', 14);
    expect(reaches(g, [500, 2300], [900, 2500])).toBe(true);
    expect(reaches(g, [100, 2500], [500, 2300])).toBe(true);
  });

  it('two line ends one tile unit apart (a road cut at a tile edge) join: Trondheimsveien at Bjerke, user 2026-10-19', () => {
    const g = buildGraph([line('trunk', [[3000, 3300], [4095, 3300]], { oneway: 1 }), line('trunk', [[4096, 3300], [4300, 3300]], { oneway: 1 })], 'bus', 14);
    expect(reaches(g, [3000, 3300], [4300, 3300])).toBe(true);
  });

  it('a road ending a few metres short of another does not join it', () => {
    const g = buildGraph([line('primary', [[100, 2800], [900, 2800]]), line('minor', [[500, 2600], [500, 2780]])], 'bus', 14);
    expect(reaches(g, [500, 2600], [900, 2800])).toBe(false);
  });

  it('lines cut at a tile edge stitch together', () => {
    const left = { ...line('primary', [[3900, 2000], [4096, 2000]]) };
    const right = { cls: 'primary', subclass: '', props: { class: 'primary' }, extent: 4096, z: 14, points: /** @type {[number, number][]} */ ([[X + 4096, Y + 2000], [X + 4300, Y + 2000]]) };
    const g = buildGraph([left, right], 'bus', 14);
    expect(reaches(g, [3900, 2000], [4300, 2000])).toBe(true);
  });

  it('a rail graph never holds a road, and a bus graph never holds rail, paths or construction', () => {
    const lines = [line('rail', [[0, 0], [100, 0]], { subclass: 'rail' }), line('primary', [[0, 50], [100, 50]]), line('path', [[0, 80], [100, 80]], { subclass: 'footway' }), line('trunk_construction', [[0, 90], [100, 90]])];
    expect(buildGraph(lines, 'rail', 14).edges.length).toBe(1);
    expect(buildGraph(lines, 'bus', 14).edges.length).toBe(1);
  });

  it('builds one connected bus network over the 3 × 3 Oslo tiles', () => {
    const lines = [];
    for (const x of [8680, 8681, 8682]) for (const y of [4764, 4765, 4766]) lines.push(...decodeTile(new Uint8Array(readFileSync(`tests/fixtures/shapes/14-${x}-${y}.pbf`)), 14, x, y));
    const g = buildGraph(lines, 'bus', 14);
    const comp = components(g);
    const sizes = new Map();
    for (const c of comp) sizes.set(c, (sizes.get(c) ?? 0) + 1);
    const largest = Math.max(...sizes.values());
    expect(largest / comp.length).toBeGreaterThan(0.9);
  });
});

describe('profiles', () => {
  it('maps the line\'s mode to a profile', () => {
    expect(profileFor('bus', 'localBus')).toBe('bus');
    expect(profileFor('coach', 'nationalCoach')).toBe('bus');
    expect(profileFor('taxi', 'waterTaxi')).toBe('ferry');
    expect(profileFor('taxi', 'communalTaxi')).toBe('bus');
    expect(profileFor('water', 'localCarFerry')).toBe('ferry');
    expect(profileFor('metro', 'metro')).toBe('metro');
    expect(profileFor('air', 'domesticFlight')).toBe(null);
    expect(profileFor('', '')).toBe(null);
  });

  it('picks the zoom by the straight distance', () => {
    expect(zoomFor('bus', 5000)).toBe(14);
    expect(zoomFor('bus', 30000)).toBe(12);
    expect(zoomFor('rail', 120000)).toBe(11);
    expect(zoomFor('ferry', 2000)).toBe(11);
    expect(zoomFor('metro', 40000)).toBe(14);
  });

  it('has the design\'s limits for extreme links', () => {
    expect([PROFILES.bus.maxStraightKm, PROFILES.tram.maxStraightKm, PROFILES.metro.maxStraightKm, PROFILES.rail.maxStraightKm, PROFILES.ferry.maxStraightKm]).toEqual([150, 30, 50, 600, 300]);
  });
});
