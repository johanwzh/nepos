import { describe, it, expect } from 'vitest';
import { patternThumb } from '../../src/core/pattern-thumb.js';

/** The points of an SVG path "M x y L x y …". @param {string} d */
const pts = (d) => [...d.matchAll(/[ML] ?(-?[\d.]+) (-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);

describe('a pattern as a thumbnail (routing editor, 2026-10-31)', () => {
  it('fits the legs in the box with a margin, north up', () => {
    const d = patternThumb([[[10, 59], [10.1, 59]], [[10.1, 59], [10.1, 59.05]]], 90, 60);
    const p = pts(d);
    for (const [x, y] of p) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(90); expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(60); }
    // the last point is north of (above) the first
    expect(p[p.length - 1][1]).toBeLessThan(p[0][1]);
    expect(d.match(/M/g)).toHaveLength(2);
  });

  it('keeps the shape: a degree of longitude is narrower than one of latitude up north', () => {
    const p = pts(patternThumb([[[10, 60], [11, 60], [11, 61]]], 100, 100));
    const w = Math.abs(p[1][0] - p[0][0]), h = Math.abs(p[2][1] - p[1][1]);
    expect(w / h).toBeCloseTo(0.5, 1);
  });

  it('nothing to draw: an empty path; a single point does not divide by zero', () => {
    expect(patternThumb([], 90, 60)).toBe('');
    expect(patternThumb([[[10, 59], [10, 59]]], 90, 60)).not.toContain('NaN');
  });
});
