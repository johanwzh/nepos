import { describe, it, expect } from 'vitest';
import { gzipSync } from 'node:zlib';
import { decodeTile, edgePoints, gunzip } from '../../src/routing/tile-format.js';
import { encodeTile } from './helpers/encode-tile.js';

const sample = () => encodeTile({
  nodes: [[10.75, 59.91, 0], [10.76, 59.92, 1], [10.74, 59.90, 0]],
  attrs: [{ cls: 2, dir: 0, speed: 50 }, { cls: 4, ferry: true, maxheight: 3.2, maxweight: 3.5 }],
  names: ['', 'Ring 3 / Ærfuglveien ø'],
  edges: [
    { from: 0, to: 1, len: 1234.5, attr: 0, name: 1, way: 4000000000, pts: [[10.755, 59.915], [10.751, 59.913]] },
    { from: 1, to: 2, len: 2000, attr: 1, name: 0, way: 7 },
  ],
  restrictions: [[0, 1, 1, 1]],
});

describe('NPT2 tiles', () => {
  it('decodes what the encoder wrote', () => {
    const t = decodeTile(sample());
    expect(Array.from(t.lon)).toEqual([107500000, 107600000, 107400000]);
    expect(Array.from(t.lat)).toEqual([599100000, 599200000, 599000000]);
    expect(Array.from(t.border)).toEqual([0, 1, 0]);
    expect(t.attrs[0]).toEqual({ cls: 2, dir: 0, speed: 50, ferry: false, maxheight: 0, maxwidth: 0, maxlength: 0, maxweight: 0 });
    expect(t.attrs[1]).toMatchObject({ cls: 4, ferry: true, maxheight: 3.2, maxweight: 3.5 });
    expect(t.names).toEqual(['', 'Ring 3 / Ærfuglveien ø']);
    expect(Array.from(t.from)).toEqual([0, 1]);
    expect(Array.from(t.to)).toEqual([1, 2]);
    expect(t.len[0]).toBeCloseTo(1234.5, 3);
    expect(Array.from(t.attr)).toEqual([0, 1]);
    expect(Array.from(t.name)).toEqual([1, 0]);
    expect(Array.from(t.way)).toEqual([4000000000, 7]);
    expect(Array.from(t.ptCount)).toEqual([2, 0]);
    expect(Array.from(t.restrictions)).toEqual([0, 1, 1, 1]);
  });

  it('gives an edge its absolute points, ends included', () => {
    const t = decodeTile(sample());
    expect(Array.from(edgePoints(t, 0))).toEqual([107500000, 599100000, 107550000, 599150000, 107510000, 599130000, 107600000, 599200000]);
    expect(Array.from(edgePoints(t, 1))).toEqual([107600000, 599200000, 107400000, 599000000]);
  });

  it('refuses a file that is not a tile', () => {
    expect(() => decodeTile(new TextEncoder().encode('NPT1xxxxxxxxxxxxxxxxxxxxxxxx').buffer)).toThrow('not an NPT2 tile');
  });

  it('unzips gzip bytes', async () => {
    const raw = new Uint8Array(sample());
    const gz = gzipSync(raw);
    const out = await gunzip(gz.buffer.slice(gz.byteOffset, gz.byteOffset + gz.byteLength));
    expect(new Uint8Array(out)).toEqual(raw);
  });
});
