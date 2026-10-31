import { describe, it, expect } from 'vitest';
import { profileFor, isRoutedLine } from '../../src/routing/profiles.js';

describe('profiles', () => {
  it('maps the line\'s mode to a profile', () => {
    expect(profileFor('bus', 'localBus')).toBe('bus');
    expect(profileFor('coach', 'nationalCoach')).toBe('bus');
    expect(profileFor('taxi', 'waterTaxi')).toBe('ferry');
    expect(profileFor('taxi', 'communalTaxi')).toBe('bus');
    expect(profileFor('water', 'localCarFerry')).toBe('ferry');
    expect(profileFor('metro', 'metro')).toBe('metro');
    expect(profileFor('air', 'domesticFlight')).toBe(null);
    expect(profileFor('', '')).toBe(null);
  });

  it('cableway, funicular and lift route on the cable network (routing for all modes, 2026-11-01)', () => {
    expect(profileFor('cableway', 'telecabin')).toBe('cable');
    expect(profileFor('funicular', '')).toBe('cable');
    expect(profileFor('lift', '')).toBe('cable');
    expect(profileFor('snowAndIce', 'snowCoach')).toBe(null);
  });

  it('every mode but air (and snow and ice, other) is a routed line', () => {
    for (const mode of ['bus', 'coach', 'trolleyBus', 'taxi', 'rail', 'tram', 'metro', 'water', 'ferry', 'cableway', 'funicular', 'lift']) expect(isRoutedLine({ mode })).toBe(true);
    for (const mode of ['air', 'snowAndIce', 'other', '']) expect(isRoutedLine({ mode })).toBe(false);
    expect(isRoutedLine(null)).toBe(false);
  });
});
