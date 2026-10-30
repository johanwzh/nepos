import { describe, it, expect } from 'vitest';
import { profileFor } from '../../src/routing/profiles.js';

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
});
