import { describe, it, expect } from 'vitest';
import { tilesForChain } from '../../src/routing/tile-select.js';

// Every tile of a 10 x 10 block is in the manifest except 44_481.
const tiles = {};
for (let ix = 38; ix < 48; ix++) for (let iy = 476; iy < 486; iy++) tiles[`${ix}_${iy}`] = {};
delete tiles['44_481'];
const manifest = { tileLon: 0.25, tileLat: 0.125, tiles };

describe('tilesForChain', () => {
  it('takes the tiles under the line between the points', () => {
    // (10.6, 59.9) is 42_479; (11.1, 60.2) is 44_481 (absent); the line passes 43_480
    const keys = tilesForChain(manifest, [{ lon: 10.6, lat: 59.9 }, { lon: 11.1, lat: 60.2 }], 0);
    expect(keys).toContain('42_479');
    expect(keys).toContain('43_480');
    expect(keys).not.toContain('44_481');
    expect(keys).not.toContain('42_481');
  });

  it('adds a ring of tiles around, sorted and only those in the manifest', () => {
    const keys = tilesForChain(manifest, [{ lon: 10.6, lat: 59.9 }, { lon: 10.62, lat: 59.91 }], 1);
    expect(keys).toEqual(['41_478', '41_479', '41_480', '42_478', '42_479', '42_480', '43_478', '43_479', '43_480']);
    expect(tilesForChain(manifest, [{ lon: 9.6, lat: 59.9 }], 1)).toEqual(['38_478', '38_479', '38_480', '39_478', '39_479', '39_480']);
  });
});
