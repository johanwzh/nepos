// The route search honours a vehicle's sizes (backlog 92/93, design 2026-11-03 §5): an edge the vehicle is over is
// never driven, a stop is never snapped onto one, and each leg reports the lowest limits along it.
import { describe, it, expect } from 'vitest';
import { routeChain } from '../../src/routing/search.js';
import { makeGraph, M_LAT, M_LON } from './helpers/graph.js';

const LAT = 59.91, LON = 10.75;
/** @returns {[number, number]} */
const P = (x, y) => [LON + x * M_LON, LAT + y * M_LAT];
const stop = (x, y) => ({ lon: P(x, y)[0], lat: P(x, y)[1] });
const ok = (/** @type {any} */ r) => { if (!r.ok) throw new Error(`route failed: ${JSON.stringify(r)}`); return r; };

// A(0,0) to B(1000,0): the short road A - M(500,0) - B passes under a 3.7 m bridge on M - B (way 77, "Matrandvegen");
// the long road A - N(500,600) - B has no limits.
const twoRoads = () => makeGraph({
  nodes: [P(0, 0), P(500, 0), P(1000, 0), P(500, 600)],
  attrs: [{ cls: 2 }, { cls: 2, maxheight: 3.7 }],
  names: ['', 'Matrandvegen', 'Hesbølvegen'],
  edges: [{ from: 0, to: 1, way: 76, name: 1 }, { from: 1, to: 2, attr: 1, way: 77, name: 1 },
    { from: 0, to: 3, way: 80, name: 2 }, { from: 3, to: 2, way: 81, name: 2 }],
});

describe('a vehicle on the road\'s limits', () => {
  it('without a vehicle the short road under the bridge', () => {
    const r = ok(routeChain(twoRoads(), [stop(0, -5), stop(1000, -5)]));
    expect(r.legs[0].metres).toBeLessThan(1100);
  });

  it('a 4 m vehicle goes round the 3.7 m bridge, and its snap at B is on the long road', () => {
    const r = ok(routeChain(twoRoads(), [stop(0, -5), stop(1000, -5)], { vehicle: { height: 4 } }));
    expect(r.legs[0].metres).toBeGreaterThan(1500);
    expect(r.legs[0].limits.height).toBeUndefined();
    expect(r.snaps[1].way).toBe(81);
  });

  it('a 3 m vehicle passes under it, and the leg reports the 3.7 m clearance and where it is', () => {
    const r = ok(routeChain(twoRoads(), [stop(0, -5), stop(1000, -5)], { vehicle: { height: 3 } }));
    expect(r.legs[0].metres).toBeLessThan(1100);
    expect(r.legs[0].limits.height).toMatchObject({ kind: 'height', value: 3.7, way: 77, road: 'Matrandvegen' });
    const [lon, lat] = r.legs[0].limits.height.at;
    expect(lon).toBeGreaterThan(P(500, 0)[0]);
    expect(lon).toBeLessThan(P(1000, 0)[0]);
    expect(lat).toBeCloseTo(LAT, 4);
  });

  it('every leg reports its limits, also without a vehicle', () => {
    const r = ok(routeChain(twoRoads(), [stop(0, -5), stop(1000, -5)]));
    expect(r.legs[0].limits.height?.value).toBe(3.7);
    expect(r.legs[0].edges.length).toBeGreaterThan(0);
  });

  it('only a road under the bridge: no route for a 4 m vehicle', () => {
    const G = makeGraph({
      nodes: [P(0, 0), P(400, 0), P(600, 0), P(1000, 0)],
      attrs: [{ cls: 2 }, { cls: 2, maxheight: 3.7 }],
      edges: [{ from: 0, to: 1 }, { from: 1, to: 2, attr: 1 }, { from: 2, to: 3 }],
    });
    expect(routeChain(G, [stop(0, -5), stop(1000, -5)], { vehicle: { height: 4 } })).toMatchObject({ ok: false, error: 'no-route' });
    ok(routeChain(G, [stop(0, -5), stop(1000, -5)], { vehicle: { height: 3.5 } }));
  });

  it('weight: a bridge of 8 t takes 8.3 t (within 5 %), not 8.5 t', () => {
    const G = makeGraph({
      nodes: [P(0, 0), P(400, 0), P(600, 0), P(1000, 0)],
      attrs: [{ cls: 2 }, { cls: 2, maxweight: 8 }],
      edges: [{ from: 0, to: 1 }, { from: 1, to: 2, attr: 1 }, { from: 2, to: 3 }],
    });
    ok(routeChain(G, [stop(0, -5), stop(1000, -5)], { vehicle: { weight: 8.3 } }));
    expect(routeChain(G, [stop(0, -5), stop(1000, -5)], { vehicle: { weight: 8.5 } })).toMatchObject({ ok: false, error: 'no-route' });
  });

  it('a stop whose only road is one the vehicle cannot use: no route, naming the stop and the edge', () => {
    const G = twoRoads();
    // a stop on M - B, 150 m from the long road: its only candidates are under the bridge
    const r = routeChain(G, [stop(0, -5), stop(750, -5)], { vehicle: { height: 4 } });
    expect(r).toMatchObject({ ok: false, error: 'no-route', blockedSnap: { point: 1 } });
    expect(G.way[/** @type {any} */ (r).blockedSnap.edge]).toBe(77);
  });

  it('a saved snap on an edge the vehicle cannot use: no route for this vehicle', () => {
    const G = twoRoads();
    const [lon, lat] = P(750, 0);
    const fixed = { way: 77, lon, lat, along: true, off: 5, road: 'Matrandvegen' };
    const r = routeChain(G, [stop(0, -5), { ...stop(750, -5), fixed }], { vehicle: { height: 4 } });
    expect(r).toMatchObject({ ok: false, error: 'no-route', blockedSnap: { point: 1 } });
    ok(routeChain(G, [stop(0, -5), { ...stop(750, -5), fixed }], { vehicle: { height: 3 } }));
  });
});
