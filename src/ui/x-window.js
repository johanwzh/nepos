// The x window (booking spec 2026-10-22): x on a time is a request stop or a booking, set only from here (never typed).
// The first choice: none, request stop, booking. Booking opens the full form, starting as a copy of the level above
// (the trip's booking, else the line's) when the time has none of its own.
import { t } from '../i18n/strings.js';
import { openFloatBox } from './float-box.js';
import { openBookingForm } from './booking-form.js';

/**
 * @param {{ req: boolean, booking: any, startFrom: any, x: number, y: number,
 *   onApply: (r: { req: boolean, booking: import('../core/booking.js').Booking | null }) => void }} opts
 */
export function openXWindow({ req, booking, startFrom, x, y, onApply }) {
  const body = document.createElement('div');
  body.className = 'xw';
  const now = booking ? 'booking' : req ? 'req' : 'none';
  body.innerHTML = /** @type {[string, string][]} */ ([['none', 'xwNone'], ['req', 'xwReq'], ['booking', 'xwBooking']])
    .map(([v, key]) => `<button type="button" class="xw-choice${v === now ? ' on' : ''}" data-v="${v}">${t(key)}</button>`).join('');
  const box = openFloatBox({ x, y, title: t('xwTitle'), body, cls: 'xw-box', onApply: () => false });
  box.setApplyEnabled(false);
  for (const btn of body.querySelectorAll('.xw-choice')) {
    btn.addEventListener('click', () => {
      const v = /** @type {HTMLElement} */ (btn).dataset.v;
      box.close();
      if (v === 'none') onApply({ req: false, booking: null });
      else if (v === 'req') onApply({ req: true, booking: null });
      else openBookingForm({ booking: booking ?? startFrom, x, y, onApply: (b) => onApply({ req: false, booking: b }) });
    });
  }
}
