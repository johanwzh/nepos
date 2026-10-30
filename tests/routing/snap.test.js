import { describe, it, expect } from 'vitest';
import { candidates, candidatesWidening, fromRef } from '../../src/routing/snap.js';
import { makeGraph, M_LAT, M_LON } from './helpers/graph.js';

const LAT = 59.91, LON = 10.75;
// Two parallel east-west roads, 400 m long: way 1 at LAT, way 2 50 m north.
const G = makeGraph({
  nodes: [[LON, LAT], [LON + 400 * M_LON, LAT], [LON, LAT + 50 * M_LAT], [LON + 400 * M_LON, LAT + 50 * M_LAT]],
  edges: [{ from: 0, to: 1, way: 1 }, { from: 2, to: 3, way: 2 }],
  names: ['', 'Storgata'],
});

describe('snap candidates', () => {
  it('finds the road beside a point, how far off and how far along', () => {
    const list = candidates(G, [LON + 100 * M_LON, LAT - 30 * M_LAT]);
    expect(list).toHaveLength(1);
    expect(list[0].edge).toBe(0);
    expect(list[0].off).toBeCloseTo(30, 0);
    expect(list[0].at).toBeCloseTo(100, 0);
    expect(list[0].lon).toBeCloseTo(LON + 100 * M_LON, 6);
    expect(list[0].lat).toBeCloseTo(LAT, 6);
  });

  it('keeps every road within the radius', () => {
    const list = candidates(G, [LON + 200 * M_LON, LAT + 10 * M_LAT]);
    expect(list.map((c) => c.edge).sort()).toEqual([0, 1]);
    expect(list.find((c) => c.edge === 1).off).toBeCloseTo(40, 0);
  });

  it('widens to 150 m, then 300 m', () => {
    const p = [LON + 200 * M_LON, LAT - 120 * M_LAT];
    expect(candidates(G, p)).toEqual([]);
    const { list, radius } = candidatesWidening(G, p);
    expect(radius).toBe(150);
    expect(list.map((c) => c.edge)).toEqual([0]);
    expect(candidatesWidening(G, [LON + 200 * M_LON, LAT - 1000 * M_LAT])).toEqual({ list: [], radius: 300 });
  });

  it('finds a saved snap by its way, and nothing for a way that is gone', () => {
    const ref = { way: 2, lon: LON + 300 * M_LON, lat: LAT + 50 * M_LAT, along: true, off: 7, road: 'x' };
    const c = fromRef(G, ref);
    expect(c.edge).toBe(1);
    expect(c.at).toBeCloseTo(300, 0);
    expect(c.off).toBe(7);
    expect(fromRef(G, { ...ref, way: 99 })).toBeNull();
    expect(fromRef(G, { ...ref, lat: LAT + 80 * M_LAT })).toBeNull();
  });
});
