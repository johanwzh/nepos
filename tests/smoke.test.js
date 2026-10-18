import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { VERSION } from '../src/version.js';

describe('app shell', () => {
  it('reports the version in package.json (both are bumped on every push)', () => {
    expect(VERSION).toBe(JSON.parse(readFileSync('package.json', 'utf8')).version);
  });
});
