// The booking form (booking spec 2026-10-22): the fields of ERN #BOD/#BOF minus the contact person, in a floating box.
// Choices with several answers (how to book, when to buy) are chips; single choices are dropdowns. Not modelled on Nplan.
import { t } from '../i18n/strings.js';
import { openFloatBox } from './float-box.js';
import { normalizeBooking, BOOKING_METHODS, BUY_WHEN, BOOKING_ACCESS, BOOK_WHEN } from '../core/booking.js';

/** @param {string} s */
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** An ISO duration Nepos writes (PT30M, PT2H, P3D) → [number, unit]; anything else → ['', 'M']. @param {string | undefined} iso */
export function splitDuration(iso) {
  const m = /^P(?:T(\d+)([MH])|(\d+)D)$/.exec(iso ?? '');
  if (!m) return ['', 'M'];
  return m[3] ? [m[3], 'D'] : [m[1], m[2]];
}
/** [number, unit] → ISO duration, '' when there is no number. @param {string} n @param {string} unit */
export const joinDuration = (n, unit) => (/^\d+$/.test(n.trim()) && Number(n) > 0 ? (unit === 'D' ? `P${Number(n)}D` : `PT${Number(n)}${unit}`) : '');
/** "18:00", "1800", "8:00" → "1800"; '' when not a time. @param {string} s */
export function latestOf(s) {
  const m = /^(\d{1,2})[:.]?(\d{2})$/.exec(s.trim());
  return m && Number(m[1]) <= 23 && Number(m[2]) <= 59 ? m[1].padStart(2, '0') + m[2] : '';
}

/**
 * @param {{ booking: any, x: number, y: number, title?: string, onApply: (b: import('../core/booking.js').Booking | null) => void }} opts
 */
export function openBookingForm({ booking, x, y, title, onApply }) {
  const b = normalizeBooking(booking) ?? {};
  const body = document.createElement('div');
  body.className = 'bk-form';
  const text = (/** @type {string} */ k, /** @type {string} */ label, /** @type {string} */ ph = '') =>
    `<label class="bk-row"><span>${esc(label)}</span><input class="bk-${k}" value="${esc(/** @type {any} */ (b)[k] ?? '')}" placeholder="${esc(ph)}" autocomplete="off"></label>`;
  const select = (/** @type {string} */ k, /** @type {string} */ label, /** @type {string[]} */ values) =>
    `<label class="bk-row"><span>${esc(label)}</span><select class="bk-${k}"><option value=""></option>${values.map((v) => `<option value="${v}"${/** @type {any} */ (b)[k] === v ? ' selected' : ''}>${esc(t(`bk:${v}`))}</option>`).join('')}</select></label>`;
  const chips = (/** @type {string} */ k, /** @type {string} */ label, /** @type {string[]} */ values) =>
    `<div class="bk-row"><span>${esc(label)}</span><div class="bk-chips bk-${k}">${values.map((v) => `<button type="button" class="bk-chip${/** @type {any} */ (b)[k]?.includes(v) ? ' on' : ''}" data-v="${v}">${esc(t(`bk:${v}`))}</button>`).join('')}</div></div>`;
  const duration = (/** @type {string} */ k, /** @type {string} */ label) => {
    const [n, u] = splitDuration(/** @type {any} */ (b)[k]);
    return `<label class="bk-row"><span>${esc(label)}</span><span class="bk-dur"><input class="bk-${k}-n" value="${esc(n)}" inputmode="numeric" autocomplete="off"><select class="bk-${k}-u">${['M', 'H', 'D'].map((x) => `<option value="${x}"${x === u ? ' selected' : ''}>${esc(t(`bkUnit${x}`))}</option>`).join('')}</select></span></label>`;
  };
  body.innerHTML = text('phone', t('bkPhone')) + text('email', t('bkEmail')) + text('url', t('bkUrl'), 'https://')
    + text('details', t('bkDetails'))
    + select('access', t('bkAccess'), BOOKING_ACCESS) + select('bookWhen', t('bkBookWhen'), BOOK_WHEN)
    + chips('methods', t('bkMethods'), BOOKING_METHODS) + chips('buyWhen', t('bkBuyWhen'), BUY_WHEN)
    + `<label class="bk-row"><span>${esc(t('bkLatest'))}</span><input class="bk-latest" value="${esc(b.latest ? `${b.latest.slice(0, 2)}:${b.latest.slice(2)}` : '')}" placeholder="18:00" autocomplete="off"></label>`
    + duration('minAhead', t('bkMinAhead')) + duration('maxAhead', t('bkMaxAhead'))
    + text('note', t('bkNote'));
  for (const chip of body.querySelectorAll('.bk-chip')) chip.addEventListener('click', () => chip.classList.toggle('on'));
  const val = (/** @type {string} */ sel) => /** @type {HTMLInputElement} */ (body.querySelector(sel)).value;
  const on = (/** @type {string} */ k) => [...body.querySelectorAll(`.bk-${k} .bk-chip.on`)].map((c) => /** @type {HTMLElement} */ (c).dataset.v ?? '');
  openFloatBox({
    x, y, title: title ?? t('bkTitle'), body, cls: 'bk-box',
    onApply: () => {
      onApply(normalizeBooking({
        contact: b.contact, phone: val('.bk-phone'), email: val('.bk-email'), url: val('.bk-url'), details: val('.bk-details'),
        access: val('.bk-access'), bookWhen: val('.bk-bookWhen'), methods: on('methods'), buyWhen: on('buyWhen'),
        latest: latestOf(val('.bk-latest')), minAhead: joinDuration(val('.bk-minAhead-n'), val('.bk-minAhead-u')),
        maxAhead: joinDuration(val('.bk-maxAhead-n'), val('.bk-maxAhead-u')), note: val('.bk-note').replace(/[\r\n]+/g, ' '),
      }));
    },
  });
  /** @type {HTMLInputElement | null} */ (body.querySelector('.bk-phone'))?.focus();
}
