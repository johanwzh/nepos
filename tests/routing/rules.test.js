// Routing for all modes (2026-11-01): each profile routes on its own network with its own rules — default speed, snap
// radius, the search's top speed, the far-snap flag — and track never turns sharply at a switch.
import { describe, it, expect } from 'vitest';
import { routeChain } from '../../src/routing/search.js';
import { legFlags } from '../../src/routing/flags.js';
import { turnDeg } from '../../src/routing/edge-geometry.js';
import { createRouter } from '../../src/routing/router-core.js';
import { RULES, rulesFor } from '../../src/routing/rules.js';
import { makeGraph, tileOf, M_LAT, M_LON } from './helpers/graph.js';

const LAT = 59.91, LON = 10.75;
/** A point x metres east and y metres north of the origin. @returns {[number, number]} */
const P = (/** @type {number} */ x, /** @type {number} */ y) => [LON + x * M_LON, LAT + y * M_LAT];
const stop = (/** @type {number} */ x, /** @type {number} */ y) => ({ lon: P(x, y)[0], lat: P(x, y)[1] });
const total = (/** @type {any} */ r) => r.legs.reduce((/** @type {number} */ m, /** @type {any} */ l) => m + l.metres, 0);
const TRACK = [{ cls: 0 }];

// A switch: main line A(0,0) - J(1000,0) - B(2000,0), a branch J - C leaving towards B at 30°.
const C = [1000 + 1000 * Math.cos(Math.PI / 6), 1000 * Math.sin(Math.PI / 6)];
const yGraph = (/** @type {any} */ profile) => makeGraph({
  nodes: [P(0, 0), P(1000, 0), P(2000, 0), P(C[0], C[1])], attrs: TRACK,
  edges: [{ from: 0, to: 1 }, { from: 1, to: 2 }, { from: 1, to: 3 }],
}, profile);
const onBranch = stop(1000 + 500 * Math.cos(Math.PI / 6), 500 * Math.sin(Math.PI / 6));

describe('the rules table', () => {
  it('has the spec\'s values', () => {
    expect(Object.keys(RULES).sort()).toEqual(['bus', 'cable', 'ferry', 'metro', 'rail', 'tram']);
    expect(rulesFor('rail')).toEqual({ set: 'rail', kmh: 100, radius: 75, vmax: 70, farSnap: 25, track: true });
    expect(rulesFor('tram')).toEqual({ set: 'tram', kmh: 40, radius: 75, vmax: 25, farSnap: 25, track: true });
    expect(rulesFor('metro')).toEqual({ set: 'metro', kmh: 60, radius: 75, vmax: 30, farSnap: 25, track: true });
    expect(rulesFor('ferry')).toEqual({ set: 'ferry', kmh: 30, radius: 500, vmax: 25, farSnap: 170, track: false, turnAtStops: true });
    expect(rulesFor('cable')).toEqual({ set: 'cable', kmh: 15, radius: 150, vmax: 15, farSnap: 50, track: true });
    expect(rulesFor('bus')).toEqual({ set: 'road', kmh: null, radius: 75, vmax: 25, farSnap: 25, track: false });
  });
});

describe('track: no sharp turns', () => {
  it('turnDeg measures the turn at the shared node', () => {
    const G = yGraph('rail');
    // edge 2 is J -> C; driven backwards (de 5) it arrives at J heading south-west
    expect(turnDeg(G, 2 * 2 + 1, 0 * 2 + 1)).toBeCloseTo(30, 0); // on to A
    expect(turnDeg(G, 2 * 2 + 1, 1 * 2 + 0)).toBeCloseTo(150, 0); // back up to B
  });

  it('a train does not reverse through a switch; a bus may turn there', () => {
    const toA = routeChain(yGraph('rail'), [onBranch, stop(500, -5)]);
    expect(toA.ok).toBe(true);
    expect(total(toA)).toBeCloseTo(1000, -1);
    // C → B through J is a 150° turn: the train goes on to A's dead end and comes back, or finds nothing
    const toB = routeChain(yGraph('rail'), [onBranch, stop(1500, -5)]);
    expect(!toB.ok || total(toB) > 2500).toBe(true);
    const bus = routeChain(yGraph('bus'), [onBranch, stop(1500, -5)]);
    expect(bus.ok && total(bus)).toBeCloseTo(1000, -1);
  });

  it('a stub terminus still allows the U-turn (Review Focus 3)', () => {
    const G = makeGraph({ nodes: [P(0, 0), P(500, 0)], attrs: TRACK, edges: [{ from: 0, to: 1 }] }, 'tram');
    const r = routeChain(G, [stop(50, -5), stop(450, -5), stop(50, -5)]);
    expect(r.ok).toBe(true);
  });

  it('a smooth turning loop is driveable (Review Focus 3)', () => {
    const ring = Array.from({ length: 8 }, (_, i) => P(200 * Math.cos((i * Math.PI) / 4), 200 * Math.sin((i * Math.PI) / 4)));
    const G = makeGraph({ nodes: ring, attrs: TRACK, edges: ring.map((_, i) => ({ from: i, to: (i + 1) % 8 })) }, 'tram');
    const mid = (/** @type {number} */ i) => { const a = ring[i], b = ring[(i + 1) % 8]; return { lon: (a[0] + b[0]) / 2, lat: (a[1] + b[1]) / 2 }; };
    const r = routeChain(G, [mid(0), mid(4), mid(0)]);
    expect(r.ok).toBe(true);
  });
});

describe('track: a level crossing (final review I2)', () => {
  // Two tram lines cross at X(500,0): W(0,0) - X - E(1000,0) and S(500,-500) - X - N(500,500)
  const cross = (/** @type {number[]} */ crossings) => makeGraph({
    nodes: [P(0, 0), P(500, 0), P(1000, 0), P(500, -500), P(500, 500)], attrs: TRACK, crossings,
    edges: [{ from: 0, to: 1 }, { from: 1, to: 2 }, { from: 3, to: 1 }, { from: 1, to: 4 }],
  }, 'tram');

  it('a tram cannot turn onto the track it crosses; it goes straight through', () => {
    expect(routeChain(cross([1]), [stop(200, -5), stop(495, 300)]).ok).toBe(false);
    const straight = routeChain(cross([1]), [stop(200, -5), stop(800, -5)]);
    expect(straight.ok && total(straight)).toBeCloseTo(600, -1);
  });

  it('a node that is not a crossing still lets track turn up to 90°', () => {
    expect(routeChain(cross([]), [stop(200, -5), stop(495, 300)]).ok).toBe(true);
  });

  it('a crossing node is not a tile border', () => {
    expect(cross([1]).open[1]).toBe(0);
  });
});

describe('speeds, snaps and flags per profile', () => {
  it('rail runs at 100 km/h where the track has no maxspeed; the bus defaults are as before', () => {
    const g = { nodes: [P(0, 0), P(1000, 0)], attrs: TRACK, edges: [{ from: 0, to: 1 }] };
    const rail = routeChain(makeGraph(g, 'rail'), [stop(0, 0), stop(1000, 0)]);
    expect(rail.ok && rail.legs[0].seconds).toBeCloseTo(36, 0);
    const bus = routeChain(makeGraph(g, 'bus'), [stop(0, 0), stop(1000, 0)]);
    expect(bus.ok && bus.legs[0].seconds).toBeCloseTo(45, 0); // motorway class default 80 km/h
  });

  it('a ferry quay 400 m from the route snaps; a bus stop that far does not (Review Focus 4)', () => {
    const g = { nodes: [P(0, 0), P(3000, 0)], attrs: [{ cls: 4, ferry: true }], edges: [{ from: 0, to: 1 }] };
    const boat = routeChain(makeGraph(g, 'ferry'), [stop(0, -400), stop(3000, -400)]);
    expect(boat.ok).toBe(true);
    const bus = routeChain(makeGraph(g, 'bus'), [stop(0, -400), stop(3000, -400)]);
    expect(bus).toMatchObject({ ok: false, error: 'no-road' });
  });

  it('a boat turns round at a quay: A → B → A goes straight back; a bus drives on to where it can turn (user 2026-11-01)', () => {
    const g = { nodes: [P(0, 0), P(3000, 0)], attrs: [{ cls: 4, ferry: true }], edges: [{ from: 0, to: 1 }] };
    const chain = [stop(500, -5), stop(1500, -5), stop(500, -5)];
    const boat = routeChain(makeGraph(g, 'ferry'), chain);
    expect(boat.ok && total(boat)).toBeCloseTo(2000, -1);
    const bus = routeChain(makeGraph(g, 'bus'), chain);
    expect(bus.ok && total(bus)).toBeCloseTo(5000, -1); // on to the end at 3000, round, and back
  });

  it('routed again from the saved snaps, the boat still turns at the quay (a saved snap fixes no direction for a boat)', () => {
    const G = makeGraph({ nodes: [P(0, 0), P(3000, 0)], attrs: [{ cls: 4, ferry: true }], edges: [{ from: 0, to: 1 }] }, 'ferry');
    const chain = [stop(500, -5), stop(1500, -5), stop(500, -5)];
    const first = routeChain(G, chain);
    if (!first.ok) throw new Error('first route failed');
    const again = routeChain(G, chain.map((p, i) => ({ ...p, fixed: first.snaps[i] })));
    expect(again.ok && total(again)).toBeCloseTo(2000, -1);
  });

  it('the far-snap flag follows the profile', () => {
    const leg = { metres: 1000, ferryMetres: 1000, seconds: 120, coords: [], roads: [] };
    const a = { lon: 10, lat: 60 }, b = { lon: 10.02, lat: 60 };
    expect(legFlags(leg, a, b, { off: 150 })).toEqual(['far-snap']);
    expect(legFlags(leg, a, b, { off: 150 }, 170)).toEqual([]);
  });

  it('a ferry router does not flag its first quay 150 m off', () => {
    const router = createRouter('ferry');
    router.addTiles([{ key: 't', buf: tileOf({ nodes: [P(0, 0), P(3000, 0)], attrs: [{ cls: 4, ferry: true }], edges: [{ from: 0, to: 1 }] }) }]);
    const r = router.route([stop(0, -150), stop(3000, -150)]);
    expect(r.ok && r.flags).toEqual([[]]);
  });
});
