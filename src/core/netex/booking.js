// Booking in NeTEx (booking spec 2026-10-22): the elements of BookingArrangementsStructure, in the schema's order
// (netex_serviceRestrictions_version.xsd), as Entur's own export (Uttu) writes them: inside BookingArrangements on a
// StopPointInJourneyPattern, and straight inside FlexibleServiceProperties on a ServiceJourney.
import { normalizeBooking } from '../booking.js';
import { xe } from './xml.js';

/** "1800" → "18:00:00". @param {string} hhmm */
const clock = (hhmm) => (/^\d{4}$/.test(hhmm) ? `${hhmm.slice(0, 2)}:${hhmm.slice(2)}:00` : hhmm);

/**
 * The booking's elements, each on its own line at the given indent ('' when there is no booking).
 * @param {any} booking @param {string} pad
 */
export function bookingElements(booking, pad) {
  const b = normalizeBooking(booking);
  if (!b) return '';
  /** @type {string[]} */
  const out = [];
  const el = (/** @type {string} */ name, /** @type {string | undefined} */ v) => { if (v) out.push(`${pad}<${name}>${xe(v)}</${name}>`); };
  if (b.email || b.phone || b.url || b.details) {
    out.push(`${pad}<BookingContact>`);
    for (const [name, v] of /** @type {[string, string | undefined][]} */ ([['Email', b.email], ['Phone', b.phone], ['Url', b.url], ['FurtherDetails', b.details]])) {
      if (v) out.push(`${pad}  <${name}>${xe(v)}</${name}>`);
    }
    out.push(`${pad}</BookingContact>`);
  }
  el('BookingMethods', b.methods?.join(' '));
  el('BookingAccess', b.access);
  el('BookWhen', b.bookWhen);
  el('BuyWhen', b.buyWhen?.join(' '));
  el('LatestBookingTime', b.latest && clock(b.latest));
  el('MinimumBookingPeriod', b.minAhead);
  el('MaximumBookingPeriod', b.maxAhead);
  el('BookingNote', b.note);
  return out.join('\n');
}
