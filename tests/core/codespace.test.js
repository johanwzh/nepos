import { describe, it, expect } from 'vitest';
import { normalizeCodespace } from '../../src/core/codespace.js';

describe('normalizeCodespace', () => {
  it('upper-cases and trims a three-letter codespace', () => {
    expect(normalizeCodespace(' abc ')).toEqual({ ok: true, value: 'ABC' });
  });

  it('requires a value', () => {
    expect(normalizeCodespace('')).toEqual({ ok: false, error: 'required' });
    expect(normalizeCodespace('   ')).toEqual({ ok: false, error: 'required' });
  });

  it('refuses anything but exactly three letters A–Z', () => {
    for (const bad of ['1869', 'AB', 'ABCD', 'A1C', 'ÆØÅ', 'A C']) {
      expect(normalizeCodespace(bad)).toEqual({ ok: false, error: 'format' });
    }
  });
});
