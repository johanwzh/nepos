import { describe, it, expect } from 'vitest';
import { decodeTile } from '../../src/routing/tile-format.js';
import { buildGraph, addTiles } from '../../src/routing/graph.js';
import { secondsPerMetre, RADIUS_M, OFFROAD_S_PER_M, VMAX_MS } from '../../src/routing/cost.js';
import { encodeTile } from './helpers/encode-tile.js';

const LAT = 59.91;
// Two tiles meeting at lon 10.75: a road from 10.74 to 10.76 cut at the border node.
const west = () => decodeTile(encodeTile({
  nodes: [[10.74, LAT], [10.75, LAT, 1]],
  attrs: [{ cls: 2 }], names: ['', 'Storgata'],
  edges: [{ from: 0, to: 1, len: 557, name: 1, way: 10 }],
}));
const east = () => decodeTile(encodeTile({
  nodes: [[10.75, LAT, 1], [10.76, LAT], [10.76, LAT + 0.01]],
  attrs: [{ cls: 2 }, { cls: 1, dir: 1 }], names: ['', 'Storgata', 'Rv 4'],
  edges: [{ from: 0, to: 1, len: 557, name: 1, way: 10 }, { from: 1, to: 2, len: 1112, attr: 1, name: 2, way: 11 }],
}));

const outOf = (G, v) => Array.from(G.out.de.subarray(G.out.start[v], G.out.start[v + 1]));

describe('routing graph', () => {
  it('joins two tiles at their shared border node', () => {
    const G = buildGraph([{ key: '43_479', tile: west() }, { key: '44_479', tile: east() }]);
    expect(G.nodes).toBe(4);
    expect(G.edges).toBe(3);
    expect(G.keys).toEqual(new Set(['43_479', '44_479']));
    // the border node is the head of the west edge and the tail of the first east edge
    expect(G.to[0]).toBe(G.from[1]);
    expect(outOf(G, G.to[0]).sort()).toEqual([0 * 2 + 1, 1 * 2 + 0]);
    expect(G.road(2)).toBe('Rv 4');
    expect(G.way[2]).toBe(11);
  });

  it('lets a oneway edge be driven forward only', () => {
    const G = buildGraph([{ key: '44_479', tile: east() }]);
    expect(outOf(G, G.from[1])).toContain(1 * 2 + 0);
    expect(outOf(G, G.to[1])).not.toContain(1 * 2 + 1);
  });

  it('keeps each edge\'s geometry', () => {
    const G = buildGraph([{ key: '43_479', tile: west() }]);
    expect(Array.from(G.geo.subarray(G.geoStart[0] * 2, G.geoStart[1] * 2))).toEqual([107400000, 599100000, 107500000, 599100000]);
  });

  it('can add tiles later', () => {
    const G = addTiles(buildGraph([{ key: '43_479', tile: west() }]), [{ key: '44_479', tile: east() }]);
    expect(G.nodes).toBe(4);
    expect(G.keys.size).toBe(2);
  });

  it('costs time by speed, class and road type', () => {
    expect(secondsPerMetre({ cls: 2, speed: 0, ferry: false })).toBeCloseTo(3.6 / 40);
    expect(secondsPerMetre({ cls: 3, speed: 50, ferry: false })).toBeCloseTo(3.6 / 20);
    expect(secondsPerMetre({ cls: 0, speed: 110, ferry: false })).toBeCloseTo(3.6 / 90);
    expect(secondsPerMetre({ cls: 4, speed: 0, ferry: true })).toBeCloseTo(3.6 / 15);
    expect(secondsPerMetre({ cls: 0, speed: 0, ferry: false })).toBeCloseTo(3.6 / 80);
    expect([RADIUS_M, OFFROAD_S_PER_M, VMAX_MS]).toEqual([75, 4, 25]);
  });

  it('files a restriction under the directed edge that arrives at the via node', () => {
    // a T: 0 -(e0)- 1 -(e1)- 2, and 1 -(e2)- 3; no turn from e0 into e2 at node 1; e1 drawn towards node 1
    const tile = decodeTile(encodeTile({
      nodes: [[10.70, LAT], [10.71, LAT], [10.72, LAT], [10.71, LAT + 0.01]],
      attrs: [{ cls: 2 }],
      edges: [{ from: 0, to: 1, len: 557, way: 1 }, { from: 2, to: 1, len: 557, way: 2 }, { from: 1, to: 3, len: 1112, way: 3 }],
      restrictions: [[0, 1, 2, 0], [1, 1, 0, 1]],
    }));
    const G = buildGraph([{ key: '42_479', tile }]);
    expect(G.restrict.get(0 * 2 + 0)).toEqual({ no: new Set([2]), only: -1 });
    expect(G.restrict.get(1 * 2 + 0)).toEqual({ no: new Set(), only: 0 });
  });
});
