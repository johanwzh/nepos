// Small routing graphs for tests: one tile, edge lengths measured from the geometry.
import { encodeTile } from './encode-tile.js';
import { decodeTile } from '../../../src/routing/tile-format.js';
import { buildGraph } from '../../../src/routing/graph.js';
import { haversineM } from '../../../src/routing/geometry.js';

/** Metres -> degrees near lat 59.91 (for placing test points). */
export const M_LAT = 1 / 111195, M_LON = 1 / (111195 * Math.cos(59.91 * Math.PI / 180));

/**
 * crossings: indices of nodes where tracks cross without a link (node byte bit 1).
 * @param {{ nodes: [number, number][], edges: { from: number, to: number, attr?: number, name?: number, way?: number, pts?: [number, number][] }[],
 *   attrs?: import('./encode-tile.js').AttrIn[], names?: string[], restrictions?: [number, number, number, number][], crossings?: number[] }} g
 */
export function tileOf({ nodes, edges, attrs = [{ cls: 2 }], names = [''], restrictions = [], crossings = [] }) {
  return encodeTile({
    nodes: nodes.map(([lon, lat], i) => [lon, lat, crossings.includes(i) ? 2 : 0]), attrs, names, restrictions,
    edges: edges.map((e, i) => {
      const line = [nodes[e.from], ...(e.pts ?? []), nodes[e.to]];
      let len = 0;
      for (let j = 1; j < line.length; j++) len += haversineM(line[j - 1], line[j]);
      return { ...e, len, way: e.way ?? i + 1 };
    }),
  });
}

/** @param {Parameters<typeof tileOf>[0]} g @param {import('../../../src/routing/profiles.js').Profile} [profile] */
export const makeGraph = (g, profile) => buildGraph([{ key: 'test', tile: decodeTile(tileOf(g)) }], profile);
