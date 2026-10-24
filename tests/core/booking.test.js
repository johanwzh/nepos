import { describe, it, expect } from 'vitest';
import { normalizeBooking, bookingKey, sameBooking, toBits, fromBits, BOOKING_METHODS } from '../../src/core/booking.js';

describe('booking model', () => {
  it('drops empty fields and gives null when nothing is left', () => {
    expect(normalizeBooking({ phone: ' ', methods: [] })).toBeNull();
    expect(normalizeBooking({ phone: ' 123 ', access: 'nobody', methods: ['online', 'callDriver'] })).toEqual({ phone: '123', methods: ['callDriver', 'online'] });
  });

  it('compares bookings by content, not field order', () => {
    expect(sameBooking({ phone: '1', url: 'u' }, { url: 'u', phone: '1' })).toBe(true);
    expect(sameBooking({ phone: '1' }, { phone: '2' })).toBe(false);
    expect(bookingKey(null)).toBe('');
  });

  it('turns methods into the #BOD bitmask and back', () => {
    expect(toBits(['callOffice', 'online'], BOOKING_METHODS)).toBe(6);
    expect(fromBits(6, BOOKING_METHODS)).toEqual(['callOffice', 'online']);
  });
});
