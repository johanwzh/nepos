import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

const DOC = 'docs/ern/ern-format.md';

describe('ERN documentation', () => {
  it('exists', () => {
    expect(existsSync(DOC)).toBe(true);
  });

  it('contains no email addresses or author credits', () => {
    const text = readFileSync(DOC, 'utf8');
    expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.-]+/);
    expect(text).not.toMatch(/authored by/i);
  });

  it('documents the Nepos conventions and the glossary', () => {
    const text = readFileSync(DOC, 'utf8');
    for (const heading of [
      '## Nepos Conventions and Deviations',
      '## Norwegian Record Names',
      '### #LEV',
      '### #CUR',
    ]) {
      expect(text).toContain(heading);
    }
  });
});
