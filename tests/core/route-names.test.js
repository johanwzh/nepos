import { describe, it, expect } from 'vitest';
import { checkRouteFileName } from '../../src/core/route-names.js';

describe('checkRouteFileName', () => {
  it('accepts code.txt with letters, digits, - and _', () => {
    expect(checkRouteFileName('10.txt')).toEqual({ ok: true, code: '10' });
    expect(checkRouteFileName('R100_b-2.txt')).toEqual({ ok: true, code: 'R100_b-2' });
  });

  it('ignores files that are not .txt', () => {
    expect(checkRouteFileName('notes.md')).toBe(null);
    expect(checkRouteFileName('10.txt.repair-tmp')).toBe(null);
  });

  it('suggests a lower-case extension', () => {
    expect(checkRouteFileName('40.TXT')).toEqual({ ok: false, problem: 'extension-case', suggestion: '40.txt' });
    expect(checkRouteFileName('40.Txt')).toEqual({ ok: false, problem: 'extension-case', suggestion: '40.txt' });
  });

  it('suggests a safe code for names with spaces or Norwegian letters', () => {
    expect(checkRouteFileName('Ø-ekspress.txt')).toEqual({ ok: false, problem: 'invalid-code', suggestion: 'O-ekspress.txt' });
    expect(checkRouteFileName('Bryggen sør.TXT')).toEqual({ ok: false, problem: 'invalid-code', suggestion: 'Bryggen-sor.txt' });
    expect(checkRouteFileName('Ærø åsen.txt')).toEqual({ ok: false, problem: 'invalid-code', suggestion: 'AEro-aasen.txt' });
  });

  it('offers no suggestion when nothing usable is left', () => {
    expect(checkRouteFileName('§§.txt')).toEqual({ ok: false, problem: 'invalid-code', suggestion: null });
    expect(checkRouteFileName('.txt')).toEqual({ ok: false, problem: 'invalid-code', suggestion: null });
  });
});
