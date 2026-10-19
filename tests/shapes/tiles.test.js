import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { decodeTile, corridorTiles } from '../../src/shapes/tiles.js';
import { haversineM, encodePolyline, decodePolyline, lonLatToTile, tileToLonLat } from '../../src/shapes/geometry.js';

const tile = (/** @type {string} */ name) => new Uint8Array(readFileSync(`tests/fixtures/shapes/${name}.pbf`));

describe('decoding a vector tile (Lasse\'s spec: tile acquisition)', () => {
  const lines = decodeTile(tile('14-8681-4765'), 14, 8681, 4765);

  it('gives the transportation lines with their class', () => {
    const classes = new Set(lines.map((l) => l.cls));
    for (const c of ['primary', 'rail', 'transit', 'minor']) expect(classes.has(c)).toBe(true);
    expect(lines.every((l) => l.extent === 4096)).toBe(true);
  });

  it('drops the buffer: every point lies inside the tile\'s own square, in global integer coordinates', () => {
    const [x0, y0, x1, y1] = [8681 * 4096, 4765 * 4096, 8682 * 4096, 4766 * 4096];
    for (const l of lines) for (const [gx, gy] of l.points) {
      expect(gx >= x0 && gx <= x1 && gy >= y0 && gy <= y1).toBe(true);
      expect(Number.isInteger(gx) && Number.isInteger(gy)).toBe(true);
    }
  });

  it('meets the neighbouring tile at identical points on the shared edge', () => {
    const right = decodeTile(tile('14-8682-4765'), 14, 8682, 4765);
    const edge = 8682 * 4096;
    const onEdge = (/** @type {any[]} */ ls) => new Set(ls.flatMap((l) => l.points.filter(([gx]) => gx === edge).map(([, gy]) => `${l.cls}:${gy}`)));
    const a = onEdge(lines), b = onEdge(right);
    const shared = [...a].filter((k) => b.has(k));
    expect(shared.length).toBeGreaterThan(0);
  });
});

describe('the corridor of tiles for a link', () => {
  it('holds both stops\' tiles and nothing far from the straight line', () => {
    const a = /** @type {[number, number]} */ ([10.7498, 59.9109]), b = /** @type {[number, number]} */ ([10.7598, 59.9132]);
    const tiles = corridorTiles(a, b, 14, 1000);
    const ta = lonLatToTile(a[0], a[1], 14), tb = lonLatToTile(b[0], b[1], 14);
    const has = (/** @type {{x:number,y:number}} */ t) => tiles.some((c) => c.x === Math.floor(t.x) && c.y === Math.floor(t.y));
    expect(has(ta) && has(tb)).toBe(true);
    expect(tiles.length).toBeLessThanOrEqual(25);
    for (const c of tiles) {
      const centre = tileToLonLat((c.x + 0.5) * 4096, (c.y + 0.5) * 4096, 14, 4096);
      expect(Math.min(haversineM(centre, a), haversineM(centre, b))).toBeLessThan(4000);
    }
  });
});

describe('geometry', () => {
  it('codes a polyline both ways at six decimals', () => {
    const line = /** @type {[number, number][]} */ ([[10.7498, 59.9109], [10.751234, 59.911987], [10.7563, 59.9121]]);
    const back = decodePolyline(encodePolyline(line, 6), 6);
    back.forEach((p, i) => { expect(p[0]).toBeCloseTo(line[i][0], 6); expect(p[1]).toBeCloseTo(line[i][1], 6); });
  });

  it('measures Oslo S to Nationaltheatret at about 1.2 km', () => {
    expect(Math.abs(haversineM([10.7522, 59.9111], [10.7317, 59.9149]) - 1220)).toBeLessThan(80);
  });
});
