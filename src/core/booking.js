// Booking (booking spec 2026-10-22): how a line, a trip or a stop on a trip can or must be booked. The fields follow
// ERN #BOD/#BOF (docs/ern/ern-standard.md), which follow NeTEx's BookingArrangements. The contact person (#BOD field 2)
// is read and kept as `contact`, never shown or edited (user: nobody uses it).

/**
 * @typedef {{ contact?: string, phone?: string, email?: string, url?: string, details?: string,
 *   access?: 'public' | 'authorisedPublic' | 'staff',
 *   bookWhen?: 'timeOfTravelOnly' | 'dayOfTravelOnly' | 'untilPreviousDay' | 'advanceAndDayOfTravel',
 *   methods?: string[], buyWhen?: string[], latest?: string, minAhead?: string, maxAhead?: string, note?: string }} Booking
 */

/** #BOD field 9, bits 0–4 in this order. */
export const BOOKING_METHODS = ['callDriver', 'callOffice', 'online', 'phoneAtStop', 'text'];
/** #BOD field 10, bits 0–4 in this order. */
export const BUY_WHEN = ['onReservation', 'beforeBoarding', 'afterBoarding', 'onCheckOut', 'noTicketRequired'];
export const BOOKING_ACCESS = ['public', 'authorisedPublic', 'staff'];
export const BOOK_WHEN = ['timeOfTravelOnly', 'dayOfTravelOnly', 'untilPreviousDay', 'advanceAndDayOfTravel'];

const TEXT_FIELDS = ['contact', 'phone', 'email', 'url', 'details', 'latest', 'minAhead', 'maxAhead', 'note'];

/**
 * Trimmed, empty fields dropped, unknown choices dropped; null when nothing is left.
 * @param {any} b @returns {Booking | null}
 */
export function normalizeBooking(b) {
  if (!b || typeof b !== 'object') return null;
  /** @type {any} */
  const out = {};
  for (const k of TEXT_FIELDS) { const v = String(b[k] ?? '').trim(); if (v) out[k] = v; }
  if (BOOKING_ACCESS.includes(b.access)) out.access = b.access;
  if (BOOK_WHEN.includes(b.bookWhen)) out.bookWhen = b.bookWhen;
  const methods = BOOKING_METHODS.filter((m) => b.methods?.includes(m));
  if (methods.length) out.methods = methods;
  const buy = BUY_WHEN.filter((m) => b.buyWhen?.includes(m));
  if (buy.length) out.buyWhen = buy;
  return Object.keys(out).length ? out : null;
}

/** Stable text for a booking ('' for none): pattern keys, note-letter grouping, comparing. @param {any} b */
export function bookingKey(b) {
  const n = normalizeBooking(b);
  if (!n) return '';
  return JSON.stringify(Object.keys(n).sort().map((k) => [k, /** @type {any} */ (n)[k]]));
}

/** @param {any} a @param {any} b */
export const sameBooking = (a, b) => bookingKey(a) === bookingKey(b);

/** A list of names → its bitmask over `all`. @param {string[] | undefined} list @param {string[]} all */
export const toBits = (list, all) => all.reduce((m, name, i) => (list?.includes(name) ? m | (1 << i) : m), 0);
/** A bitmask → its names over `all`. @param {number} bits @param {string[]} all */
export const fromBits = (bits, all) => all.filter((_, i) => (bits & (1 << i)) !== 0);
