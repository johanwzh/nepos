import { describe, it, expect } from 'vitest';
import { routeChain } from '../../src/routing/search.js';
import { makeGraph, M_LAT, M_LON } from './helpers/graph.js';

const LAT = 59.91, LON = 10.75;
/** A point x metres east and y metres north of the origin. @returns {[number, number]} */
const P = (x, y) => [LON + x * M_LON, LAT + y * M_LAT];
const stop = (x, y) => ({ lon: P(x, y)[0], lat: P(x, y)[1] });
const legOk = (r) => { if (!r.ok) throw new Error(`route failed: ${JSON.stringify(r)}`); return r; };

// A street A(0,0) - B(200,0) - C(400,0) with a block north of B-C: C - E(400,100) - D(200,100) - B.
const block = () => makeGraph({
  nodes: [P(0, 0), P(200, 0), P(400, 0), P(400, 100), P(200, 100)],
  edges: [{ from: 0, to: 1, way: 1, name: 1 }, { from: 1, to: 2, way: 1, name: 1 }, { from: 2, to: 3, way: 2 }, { from: 3, to: 4, way: 3 }, { from: 4, to: 1, way: 4 }],
  names: ['', 'Storgata'],
});

describe('routeChain', () => {
  it('prefers the fast road over the short one', () => {
    const G = makeGraph({
      nodes: [P(0, 0), P(1000, 0), P(500, 700)],
      attrs: [{ cls: 2, speed: 30 }, { cls: 0, speed: 90 }],
      names: ['', 'Gata', 'E 6'],
      edges: [{ from: 0, to: 1, attr: 0, name: 1 }, { from: 0, to: 2, attr: 1, name: 2 }, { from: 2, to: 1, attr: 1, name: 2 }],
    });
    const r = legOk(routeChain(G, [stop(0, -5), stop(1000, -5)]));
    expect(r.legs).toHaveLength(1);
    expect(r.legs[0].roads).toEqual(['E 6']);
    expect(r.legs[0].metres).toBeGreaterThan(1600);
  });

  // On these small graphs every valid route drives the same metres in total (a loop or dead end is driven once,
  // before or after the middle stop), so the tests check the totals a U-turn would make shorter.
  const total = (r) => r.legs.reduce((m, l) => m + l.metres, 0);

  it('makes no U-turn on open road', () => {
    const r = legOk(routeChain(block(), [stop(50, -5), stop(300, -5), stop(100, -5)]));
    expect(total(r)).toBeCloseTo(850, -1);             // a U-turn at C would make it 650
    expect(Math.max(...r.legs.flatMap((l) => l.coords.map((c) => c[1])))).toBeGreaterThan(LAT + 90 * M_LAT);
  });

  it('goes round when the next stop is behind on the same edge', () => {
    // B-C one way east: the stop at 380 is passed eastbound, the next one (300) is behind it
    const G = makeGraph({
      nodes: [P(0, 0), P(200, 0), P(400, 0), P(400, 100), P(200, 100)],
      attrs: [{ cls: 2 }, { cls: 2, dir: 1 }],
      edges: [{ from: 0, to: 1 }, { from: 1, to: 2, attr: 1 }, { from: 2, to: 3 }, { from: 3, to: 4 }, { from: 4, to: 1 }],
    });
    const r = legOk(routeChain(G, [stop(250, -5), stop(380, -5), stop(300, -5)]));
    expect(r.legs[1].metres).toBeCloseTo(520, -1);
  });

  it('leaves a stop in the direction it arrived', () => {
    // a street between two dead ends, A(0,0) and B(1000,0); turning at the middle stop would make it 600
    const G = makeGraph({ nodes: [P(0, 0), P(1000, 0)], edges: [{ from: 0, to: 1 }] });
    const r = legOk(routeChain(G, [stop(100, -5), stop(500, -5), stop(300, -5)]));
    expect(total(r)).toBeCloseTo(1600, -1);
    const [a, b] = r.legs[1].coords;
    expect(b[0] > a[0]).toBe(r.snaps[1].along);
  });

  it('turns in a dead end', () => {
    const G = makeGraph({
      nodes: [P(0, 0), P(200, 0), P(400, 0), P(200, -150)],
      edges: [{ from: 0, to: 1 }, { from: 1, to: 2 }, { from: 1, to: 3 }],
    });
    const r = legOk(routeChain(G, [stop(50, -5), stop(205, -140), stop(350, -5)]));
    expect(total(r)).toBeCloseTo(600, -1);
  });

  describe('turn restrictions', () => {
    // A crossing X(0,0) with arms W, E, N, S and loops E - NE - N and E - SE - S.
    const crossing = (restrictions) => makeGraph({
      nodes: [P(0, 0), P(-200, 0), P(200, 0), P(0, 200), P(0, -200), P(200, 200), P(200, -200)],
      edges: [{ from: 1, to: 0 }, { from: 0, to: 2 }, { from: 0, to: 3 }, { from: 0, to: 4 },
        { from: 2, to: 5 }, { from: 5, to: 3 }, { from: 2, to: 6 }, { from: 6, to: 4 }],
      restrictions,
    });

    it('honours a no_left_turn', () => {
      expect(legOk(routeChain(crossing([]), [stop(-150, -5), stop(5, 120)])).legs[0].metres).toBeCloseTo(270, -1);
      expect(legOk(routeChain(crossing([[0, 0, 2, 0]]), [stop(-150, -5), stop(5, 120)])).legs[0].metres).toBeCloseTo(830, -1);
    });

    it('honours an only_straight_on', () => {
      expect(legOk(routeChain(crossing([]), [stop(-150, -5), stop(5, -120)])).legs[0].metres).toBeCloseTo(270, -1);
      expect(legOk(routeChain(crossing([[0, 0, 1, 1]]), [stop(-150, -5), stop(5, -120)])).legs[0].metres).toBeCloseTo(830, -1);
    });
  });

  it('a waypoint changes the road but not the number of legs', () => {
    const G = makeGraph({
      nodes: [P(0, 0), P(1000, 0), P(0, 300), P(1000, 300)],
      names: ['', 'Sørveien', 'Nordveien'],
      edges: [{ from: 0, to: 1, name: 1 }, { from: 0, to: 2, name: 2 }, { from: 2, to: 3, name: 2 }, { from: 3, to: 1, name: 2 }],
    });
    const plain = legOk(routeChain(G, [stop(0, -5), stop(1000, -5)]));
    expect(plain.legs[0].roads).toEqual(['Sørveien']);
    const via = legOk(routeChain(G, [stop(0, -5), { ...stop(500, 305), via: true }, stop(1000, -5)]));
    expect(via.legs).toHaveLength(1);
    expect(via.legs[0].roads).toEqual(['Nordveien']);
    expect(via.snaps).toHaveLength(3);
  });

  it('drives to the stop rather than snapping 70 m away (4 s/m)', () => {
    // main road along y = 0; the stop's own street hangs off it: (700,0) - (700,-70) - (400,-70), a dead end
    const G = makeGraph({
      nodes: [P(0, 0), P(700, 0), P(1000, 0), P(700, -70), P(400, -70)],
      edges: [{ from: 0, to: 1, way: 1 }, { from: 1, to: 2, way: 1 }, { from: 1, to: 3, way: 2 }, { from: 3, to: 4, way: 2 }],
    });
    const r = legOk(routeChain(G, [stop(100, -5), stop(500, -67), stop(950, -5)]));
    expect(r.snaps[1].way).toBe(2);
    expect(r.snaps[1].off).toBeCloseTo(3, 0);
  });

  it('keeps the walk between a stop and the road out of the leg', () => {
    const G = makeGraph({ nodes: [P(-100, 0), P(1100, 0)], edges: [{ from: 0, to: 1 }] });
    const r = legOk(routeChain(G, [stop(0, -30), stop(1000, -30)]));
    expect(r.legs[0].metres).toBeCloseTo(1000, 0);
    expect(r.legs[0].coords[0][1]).toBeCloseTo(LAT, 6);
  });

  it('counts ferry metres apart', () => {
    const G = makeGraph({
      nodes: [P(0, 0), P(500, 0), P(1500, 0), P(2000, 0)],
      attrs: [{ cls: 2 }, { cls: 4, ferry: true }],
      edges: [{ from: 0, to: 1 }, { from: 1, to: 2, attr: 1 }, { from: 2, to: 3 }],
    });
    const r = legOk(routeChain(G, [stop(100, -5), stop(1900, -5)]));
    expect(r.legs[0].metres).toBeCloseTo(1800, -1);
    expect(r.legs[0].ferryMetres).toBeCloseTo(1000, -1);
  });

  it('says which point has no road near it', () => {
    const G = makeGraph({ nodes: [P(0, 0), P(100, 0)], edges: [{ from: 0, to: 1 }] });
    expect(routeChain(G, [stop(50, -5), stop(5000, 5000)])).toEqual({ ok: false, error: 'no-road', point: 1 });
  });

  it('says which leg cannot be routed', () => {
    const G = makeGraph({
      nodes: [P(0, 0), P(100, 0), P(0, 500), P(100, 500)],
      edges: [{ from: 0, to: 1 }, { from: 2, to: 3 }],
    });
    const r = routeChain(G, [stop(10, -5), stop(90, -5), { ...stop(50, 30), via: true }, stop(50, 505)]);
    expect(r).toMatchObject({ ok: false, error: 'no-route', leg: 1 });
  });
});

describe('review fixes', () => {
  it('a saved snap keeps its direction', async () => {
    // a street between two dead ends; the middle stop's saved snap is westbound
    const { fromRef } = await import('../../src/routing/snap.js');
    const G = makeGraph({ nodes: [P(0, 0), P(1000, 0)], edges: [{ from: 0, to: 1, way: 1 }] });
    const fixed = { way: 1, lon: P(500, 0)[0], lat: LAT, along: false, off: 5, road: '' };
    expect(fromRef(G, fixed).d).toBe(1);
    const r = legOk(routeChain(G, [stop(100, -5), { ...stop(500, -5), fixed }, stop(900, -5)]));
    expect(r.snaps[1].along).toBe(false);
    expect(r.snaps[1].refLost).toBeUndefined();
  });

  it('the edge of the loaded tiles is not a dead end', async () => {
    const { decodeTile } = await import('../../src/routing/tile-format.js');
    const { buildGraph } = await import('../../src/routing/graph.js');
    const { encodeTile } = await import('./helpers/encode-tile.js');
    // west tile: A(0) - B(400) with B on the tile border; east tile: B - C(600), C a real dead end
    const west = encodeTile({ nodes: [[...P(0, 0), 0], [...P(400, 0), 1]], attrs: [{ cls: 2 }], edges: [{ from: 0, to: 1, len: 400, way: 1 }] });
    const east = encodeTile({ nodes: [[...P(400, 0), 1], [...P(600, 0), 0]], attrs: [{ cls: 2 }], edges: [{ from: 0, to: 1, len: 200, way: 2 }] });
    const chain = [stop(30, -5), stop(300, -5), stop(200, -5)];
    const only = buildGraph([{ key: 'w', tile: decodeTile(west) }]);
    expect(routeChain(only, chain)).toMatchObject({ ok: false, error: 'no-route' });
    const both = buildGraph([{ key: 'w', tile: decodeTile(west) }, { key: 'e', tile: decodeTile(east) }]);
    const r = legOk(routeChain(both, chain));
    expect(r.legs[0].metres + r.legs[1].metres).toBeCloseTo(970, -1);     // turns at C, a real dead end
  });
});
