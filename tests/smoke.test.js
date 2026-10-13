import { describe, it, expect } from 'vitest';
import { VERSION } from '../src/version.js';

describe('app shell', () => {
  it('reports version 2.0.0', () => {
    expect(VERSION).toBe('2.0.0');
  });
});
