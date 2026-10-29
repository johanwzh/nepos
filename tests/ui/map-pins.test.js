// Quays as pins on the map (stop picking 2, 2.5): the tip is the Quay's coordinate; a platform code sits in a bigger
// round head, a Quay without one gets a smaller hollow pin; the row's own Quay is highlighted.
import { describe, it, expect } from 'vitest';
import { quayPin } from '../../src/ui/map-pins.js';

describe('Quay pins', () => {
  it('a Quay with a platform code: a pin with the code in its head, anchored at its tip', () => {
    const pin = quayPin({ lat: 60, lon: 10, label: 'B', state: '' });
    expect(pin.anchor).toBe('bottom');
    expect(pin.cls.split(' ')).toEqual(['pm-pin', 'pm-pin-code']);
    expect(pin.html).toContain('>B<');
  });

  it('a Quay without a code: a smaller hollow pin with no text', () => {
    const pin = quayPin({ lat: 60, lon: 10, label: '', state: '' });
    expect(pin.cls).toBe('pm-pin');
    expect(pin.html).not.toContain('<text');
    expect(pin.size).toBeLessThan(quayPin({ lat: 60, lon: 10, label: 'A', state: '' }).size);
  });

  it('the row\'s own Quay is highlighted', () => {
    expect(quayPin({ lat: 60, lon: 10, label: 'A', state: 'current' }).cls).toContain('pm-pin-current');
  });
});
