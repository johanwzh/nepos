import { describe, it, expect } from 'vitest';
import { haversineM, bearing, turnAngle, encodePolyline, decodePolyline, pointSegmentM, projectOnSegment, lengthM } from '../../src/routing/geometry.js';

/** @typedef {[number, number]} LonLat */

describe('geometry', () => {
  it('codes a polyline both ways at six decimals', () => {
    const line = /** @type {LonLat[]} */ ([[10.7498, 59.9109], [10.751234, 59.911987], [10.7563, 59.9121]]);
    const back = decodePolyline(encodePolyline(line, 6), 6);
    back.forEach((p, i) => { expect(p[0]).toBeCloseTo(line[i][0], 6); expect(p[1]).toBeCloseTo(line[i][1], 6); });
  });

  it('codes Google\'s own example at five decimals (lat first)', () => {
    const line = /** @type {LonLat[]} */ ([[-120.2, 38.5], [-120.95, 40.7], [-126.453, 43.252]]);
    expect(encodePolyline(line, 5)).toBe('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
  });

  it('measures Oslo S to Nationaltheatret at about 1.2 km', () => {
    expect(Math.abs(haversineM([10.7522, 59.9111], [10.7317, 59.9149]) - 1220)).toBeLessThan(80);
  });

  it('adds up a line\'s length segment by segment', () => {
    const a = /** @type {LonLat} */ ([10.75, 59.91]), b = /** @type {LonLat} */ ([10.76, 59.91]), c = /** @type {LonLat} */ ([10.76, 59.92]);
    expect(lengthM([a, b, c])).toBeCloseTo(haversineM(a, b) + haversineM(b, c), 6);
    expect(lengthM([a])).toBe(0);
  });

  it('gives bearings clockwise from north, and the turn between two of them', () => {
    expect(bearing([10, 60], [10, 60.1])).toBeCloseTo(0, 3);
    expect(bearing([10, 60], [10.1, 60])).toBeCloseTo(90, 0);
    expect(bearing([10, 60], [10, 59.9])).toBeCloseTo(180, 3);
    expect(turnAngle(0, 0)).toBe(0);
    expect(turnAngle(350, 80)).toBe(90);
    expect(turnAngle(90, 270)).toBe(180);
  });

  it('finds the nearest point on a segment, and how far it is', () => {
    const a = /** @type {LonLat} */ ([10.75, 59.91]), b = /** @type {LonLat} */ ([10.77, 59.91]);
    const p = /** @type {LonLat} */ ([10.76, 59.9109]); // ~100 m north of the middle
    const { t, point } = projectOnSegment(p, a, b);
    expect(t).toBeCloseTo(0.5, 6);
    expect(point[1]).toBeCloseTo(59.91, 9);
    expect(Math.abs(pointSegmentM(p, a, b) - 100)).toBeLessThan(1);
    // Beyond an end: the end itself
    expect(projectOnSegment([10.8, 59.91], a, b).t).toBe(1);
    expect(Math.abs(pointSegmentM([10.8, 59.91], a, b) - haversineM([10.8, 59.91], b))).toBeLessThan(1);
  });
});
