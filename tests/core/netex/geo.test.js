import { describe, it, expect } from 'vitest';
import { haversineM, straightLine } from '../../../src/core/netex/geo.js';

describe('geometry', () => {
  it('measures roughly 111 km per degree of latitude', () => {
    expect(haversineM([10, 60], [10, 61])).toBeCloseTo(111195, -2);
  });

  it('draws a straight line between two stops', () => {
    expect(straightLine({ coords: [5, 60] }, { coords: [6, 61] }))
      .toEqual({ routed: false, coords: [[5, 60], [6, 61]] });
  });
});
