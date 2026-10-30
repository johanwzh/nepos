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
/**
 * #BOD field 10, bits 0–3 in this order. Bit 4 (noTicketRequired) is not offered: the Nordic profile does not accept it
 * yet (backlog 75). */
export const BUY_WHEN = ['onReservation', 'beforeBoarding', 'afterBoarding', 'onCheckOut'];
export const BOOKING_ACCESS = ['public', 'authorisedPublic', 'staff'];
/** The values the Nordic profile allows (BOOKING_3); timeOfTravelOnly is not one of them. */
export const BOOK_WHEN = ['dayOfTravelOnly', 'untilPreviousDay', 'advanceAndDayOfTravel'];

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

/** An ISO duration (PT90M, P1DT4H, P3D) → minutes; null when not one Nepos reads. @param {string | undefined} iso */
export function minutesOf(iso) {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(iso ?? '');
  if (!m || iso === 'P' || iso === 'PT') return null;
  return Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}
/** Which ways to book need which contact (user 2026-10-24): a phone for calls and text, a web address for online. */
const METHOD_NEEDS = /** @type {Record<string, 'phone' | 'url'>} */ ({ callOffice: 'phone', callDriver: 'phone', text: 'phone', online: 'url' });

/**
 * What Antu (and Uttu) would refuse in a booking: "when to book" without a latest time or the other way round
 * ('booking-latest'), both "when to book" and "at least before" ('booking-both'), neither ('booking-neither'), "at most before"
 * not longer than "at least before" ('booking-ahead-order', user 2026-10-30), and a
 * way to book without its contact ('booking-method-phone', 'booking-method-url').
 * @param {any} booking @returns {string[]}
 */
export function bookingProblems(booking) {
  const b = normalizeBooking(booking);
  if (!b) return [];
  const out = [];
  if (!!b.bookWhen !== !!b.latest) out.push('booking-latest');
  if (b.bookWhen && b.minAhead) out.push('booking-both');
  if (!b.bookWhen && !b.minAhead) out.push('booking-neither');
  const most = minutesOf(b.maxAhead), least = minutesOf(b.minAhead);
  if (most != null && least != null && most <= least) out.push('booking-ahead-order');
  for (const need of /** @type {const} */ (['phone', 'url'])) {
    if (!b[need] && (b.methods ?? []).some((m) => METHOD_NEEDS[m] === need)) out.push(`booking-method-${need}`);
  }
  return out;
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
