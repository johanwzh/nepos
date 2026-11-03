// U-turns as a cost (backlog 107, design 2026-11-03 §6): on a small slow road a vehicle may turn at a stop, a waypoint
// or a node, for 15 s × (length / 4 m)²; never on larger or faster roads; a dead end stays free; without a U-turn length
// the 2.6.0 ban holds.
import { describe, it, expect } from 'vitest';
import { routeChain } from '../../src/routing/search.js';
import { makeGraph, M_LAT, M_LON } from './helpers/graph.js';

const LAT = 59.91, LON = 10.75;
/** @returns {[number, number]} */
const P = (x, y) => [LON + x * M_LON, LAT + y * M_LAT];
const stop = (x, y) => ({ lon: P(x, y)[0], lat: P(x, y)[1] });
const ok = (/** @type {any} */ r) => { if (!r.ok) throw new Error(`route failed: ${JSON.stringify(r)}`); return r; };
const total = (/** @type {any} */ r) => r.legs.reduce((/** @type {number} */ m, /** @type {any} */ l) => m + l.metres, 0);
const turns = (/** @type {any} */ r) => r.legs.flatMap((/** @type {any} */ l) => l.uturns);

// The user's case: a residential cul-de-sac J(500,0) - E(500,700) off a road A(0,0) - J; a stop on it 300 m in.
// Turning at the stop saves 800 m at 30 km/h (96 s): a minibus (60 s) turns there; a 12 m bus (135 s) drives past it
// to the dead end, turns there for free and serves the stop on the way back.
const culDeSac = () => makeGraph({
  nodes: [P(0, 0), P(500, 0), P(500, 700)],
  attrs: [{ cls: 2, speed: 30 }],
  names: ['', 'Blindvegen'],
  edges: [{ from: 0, to: 1, way: 1 }, { from: 1, to: 2, way: 2, name: 1 }],
});
const there = [stop(100, -5), stop(505, 300), stop(50, -5)];

describe('U-turns at a stop', () => {
  it('a minibus (8 m) turns at the stop and the turn is reported', () => {
    const r = ok(routeChain(culDeSac(), there, { uturnLength: 8 }));
    expect(total(r)).toBeCloseTo(400 + 300 + 300 + 450, -1);
    expect(turns(r)).toEqual([expect.objectContaining({ where: 'stop', road: 'Blindvegen' })]);
    expect(r.legs[1].uturns).toHaveLength(1);
  });

  it('a 12 m bus drives on to the dead end and turns there for free (not reported)', () => {
    const r = ok(routeChain(culDeSac(), there, { uturnLength: 12 }));
    expect(total(r)).toBeCloseTo(400 + 700 + 400 + 300 + 450, -1);
    expect(turns(r)).toEqual([]);
  });

  it('without a U-turn length: the 2.6.0 ban (the dead end)', () => {
    const r = ok(routeChain(culDeSac(), there));
    expect(total(r)).toBeCloseTo(2250, -1);
    expect(turns(r)).toEqual([]);
  });

  it('a saved snap keeps its kerb: arrive the kerb\'s way, then turn', () => {
    const G = culDeSac();
    const [lon, lat] = P(500, 300);
    const north = { way: 2, lon, lat, along: true, off: 5, road: 'Blindvegen' };
    const r = ok(routeChain(G, [there[0], { ...there[1], fixed: north }, there[2]], { uturnLength: 8 }));
    expect(turns(r)).toEqual([expect.objectContaining({ where: 'stop' })]);
    expect(r.snaps[1].along).toBe(true);
    // the kerb on the southbound side: drive to the dead end, come back to it, and leave the way it faces
    const south = { ...north, along: false };
    const r2 = ok(routeChain(G, [there[0], { ...there[1], fixed: south }, there[2]], { uturnLength: 8 }));
    expect(turns(r2)).toEqual([]);
    expect(r2.snaps[1].along).toBe(false);
  });
});

// A primary road A(0,0) - J(500,0) - B(1000,0) at 50 km/h, dead ends at A and B; a side road J - K(500,200) and on to
// L(800,400). Stops S0(100), S1(400), S2(300) on the primary road: after S1 the vehicle must turn. Turning on the
// primary road is never allowed; at K, on the side road, it is (when the side road is small and slow), else it drives
// to the dead end at B.
/** @param {import('./helpers/encode-tile.js').AttrIn} side @param {[number, number, number, number][]} [restrictions] */
const junction = (side, restrictions = []) => makeGraph({
  nodes: [P(0, 0), P(500, 0), P(1000, 0), P(500, 200), P(800, 400)],
  attrs: [{ cls: 1, speed: 50 }, side],
  names: ['', 'Hovedvegen', 'Sidevegen'],
  edges: [{ from: 0, to: 1, way: 1, name: 1 }, { from: 1, to: 2, way: 1, name: 1 }, { from: 1, to: 3, attr: 1, way: 2, name: 2 },
    { from: 3, to: 4, attr: 1, way: 3, name: 2 }],
  restrictions,
});
const triple = [stop(100, -5), stop(400, -5), stop(300, -5)];

describe('U-turns at a node', () => {
  it('a car (4 m) turns at K on the small side road', () => {
    const r = ok(routeChain(junction({ cls: 2, speed: 40 }), triple, { uturnLength: 4 }));
    expect(turns(r)).toEqual([expect.objectContaining({ where: 'node', road: 'Sidevegen' })]);
    // it may turn before S1 and serve it from the westbound kerb (S1 has no saved snap): either way, once, on Sidevegen
    expect(r.legs.flatMap((/** @type {any} */ l) => l.roads)).toContain('Sidevegen');
  });

  it('a 12 m bus drives to the dead end at B instead', () => {
    const r = ok(routeChain(junction({ cls: 2, speed: 40 }), triple, { uturnLength: 12 }));
    expect(turns(r)).toEqual([]);
    expect(r.legs.flatMap((/** @type {any} */ l) => l.roads)).not.toContain('Sidevegen');
  });

  it('never on a tertiary, a fast or a large road', () => {
    for (const side of [{ cls: 5 }, { cls: 2, speed: 60 }, { cls: 1, speed: 40 }]) {
      const r = ok(routeChain(junction(side), triple, { uturnLength: 4 }));
      expect(turns(r)).toEqual([]);
    }
  });

  it('a no_u_turn restriction is honoured', () => {
    const r = ok(routeChain(junction({ cls: 2, speed: 40 }, [[2, 3, 2, 0]]), triple, { uturnLength: 4 }));
    expect(turns(r)).toEqual([]);
  });
});
