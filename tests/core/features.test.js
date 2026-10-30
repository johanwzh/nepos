// Routing is off (the 2.3 engine was removed 2026-10-30): nothing routes, the map draws straight lines and the export
// has no ServiceLinks (Entur's import can make them). One switch, ROUTING, for the new routing to turn on.
import { describe, it, expect } from 'vitest';
import { ROUTING, routedLinks } from '../../src/core/features.js';

describe('routing switch', () => {
  it('is off', () => {
    expect(ROUTING).toBe(false);
  });

  it('hands no links to the export while off', () => {
    expect(routedLinks(new Map([['a|b|bus', /** @type {any} */ ({ status: 'OK' })]]))).toBeUndefined();
  });
});
