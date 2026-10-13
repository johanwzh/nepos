import { describe, it, expect } from 'vitest';
import { encodeWin1252, decodeWin1252 } from '../../../src/core/ern/win1252.js';

describe('Windows-1252', () => {
  it('encodes Norwegian letters as single bytes', () => {
    expect([...encodeWin1252('æøåÆØÅ')]).toEqual([0xe6, 0xf8, 0xe5, 0xc6, 0xd8, 0xc5]);
  });

  it('encodes the 0x80–0x9F extras instead of writing ?', () => {
    // 1.5.7 wrote '?' for these, losing data on every save.
    expect([...encodeWin1252('–“”€‰')]).toEqual([0x96, 0x93, 0x94, 0x80, 0x89]);
  });

  it('round-trips every character Windows-1252 can hold', () => {
    const text = 'Florø – «Kystruta» “ekspress” €12 ‰ Ærøskøbing';
    expect(decodeWin1252(encodeWin1252(text))).toBe(text);
  });

  it('writes ? for characters outside Windows-1252', () => {
    expect(decodeWin1252(encodeWin1252('a→b'))).toBe('a?b');
  });
});
