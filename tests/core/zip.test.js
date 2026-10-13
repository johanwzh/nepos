import { describe, it, expect } from 'vitest';
import { crc32, buildZip } from '../../src/core/zip.js';

describe('zip', () => {
  it('computes the standard CRC-32 check value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('builds a store-only zip with local headers and an end record', () => {
    const data = new TextEncoder().encode('<x/>');
    const zip = buildZip([{ name: 'a.xml', data }]);
    expect([...zip.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    const eocd = zip.slice(zip.length - 22);
    expect([...eocd.slice(0, 4)]).toEqual([0x50, 0x4b, 0x05, 0x06]);
    expect(eocd[8]).toBe(1); // one entry
  });
});
