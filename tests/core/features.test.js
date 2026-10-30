// Routing is on (2.6, 2026-10-31): the export writes each line's routed links. One switch, ROUTING, turns it off.
import { describe, it, expect } from 'vitest';
import { ROUTING, routedLinks } from '../../src/core/features.js';

describe('routing switch', () => {
  it('is on', () => {
    expect(ROUTING).toBe(true);
  });

  it('hands the links to the export while on', () => {
    const links = new Map([['L1', /** @type {any} */ ({ links: {} })]]);
    expect(routedLinks(links)).toBe(links);
  });
});
