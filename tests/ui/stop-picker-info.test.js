// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { quayInfoOf } from '../../src/ui/stop-picker.js';

describe('a stop picked in the stop picker (user 2026-10-19)', () => {
  it('keeps the Quay\'s private code, so the grid can show it without asking NSR again', () => {
    const place = { id: 'NSR:StopPlace:1', name: 'X', description: '', mode: 'bus', quays: [] };
    const quay = { quayId: 'NSR:Quay:1', publicCode: 'A', privateCode: '06', description: '', lat: 1, lon: 2 };
    expect(quayInfoOf(place, quay)).toMatchObject({ quayId: 'NSR:Quay:1', publicCode: 'A', privateCode: '06', stopPlaceName: 'X' });
  });
});
