// x on a time (booking spec 2026-10-22): a request stop or a booking, set only from here (never typed). Since 2026-10-26 it
// is one dialog with the booking form (booking-form.js): Ingen / Stopper ved behov / Bestilling.
import { openBookingForm } from './booking-form.js';

/**
 * @param {{ req: boolean, booking: any, startFrom: any, x: number, y: number,
 *   onApply: (r: { req: boolean, booking: import('../core/booking.js').Booking | null }) => void }} opts
 */
export function openXWindow({ req, booking, startFrom, x, y, onApply }) {
  openBookingForm({ req, booking, startFrom, allowReq: true, x, y, onApply });
}
