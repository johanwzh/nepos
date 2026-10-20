// Routing is off for now (user 2026-10-20): the tile engine stays in the code, but nothing routes, the map draws
// straight lines and the export has no ServiceLinks (Entur's import can make them). One switch: ROUTING.
import { describe, it, expect } from 'vitest';
import { ROUTING, routedLinks } from '../../src/core/features.js';

describe('routing switch', () => {
  it('is off', () => {
    expect(ROUTING).toBe(false);
  });

  it('hands no links to the export or its check while off', () => {
    expect(routedLinks(new Map([['a|b|bus', /** @type {any} */ ({ status: 'OK' })]]))).toBeUndefined();
  });
});
