// The booking form (booking spec 2026-10-22): the fields of ERN #BOD/#BOF minus the contact person, in a floating box.
// Choices with several answers (how to book, when to buy) are chips; single choices are dropdowns. Not modelled on Nplan.
import { t } from '../i18n/strings.js';
import { openFloatBox } from './float-box.js';
import { normalizeBooking, bookingProblems, BOOKING_METHODS, BUY_WHEN, BOOKING_ACCESS, BOOK_WHEN } from '../core/booking.js';

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

/** What is wrong with a booking in the form: Antu's rules, plus a booking nobody can be reached for. @param {any} b */
function problemsOf(b) {
  if (!b) return [];
  return [...(!b.phone && !b.email && !b.url ? ['booking-no-contact'] : []), ...bookingProblems(b)];
}

/** The fields a problem is about. @param {string} p @param {string} mode 'time' | 'ahead' */
function fieldsOf(p, mode) {
  if (p === 'booking-no-contact') return ['.bk-phone', '.bk-email', '.bk-url'];
  if (p === 'booking-method-phone') return ['.bk-phone'];
  if (p === 'booking-method-url') return ['.bk-url'];
  if (p === 'booking-latest' || p === 'booking-neither') return mode === 'ahead' ? ['.bk-minAhead-n'] : ['.bk-bookWhen', '.bk-latest'];
  return [];
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
    + select('access', t('bkAccess'), BOOKING_ACCESS)
    + chips('methods', t('bkMethods'), BOOKING_METHODS) + chips('buyWhen', t('bkBuyWhen'), BUY_WHEN)
    // The deadline (Antu, Uttu): by a time (when to book + the latest time) or at least some time before departure
    + `<div class="bk-row"><span>${esc(t('bkDeadline'))}</span><span class="bk-modes">${(/** @type {[string, string][]} */ ([['time', 'bkModeTime'], ['ahead', 'bkModeAhead']])).map(([v, k]) =>
      `<label><input type="radio" name="bk-mode" class="bk-mode" value="${v}"${(b.minAhead ? 'ahead' : 'time') === v ? ' checked' : ''}> ${esc(t(k))}</label>`).join('')}</span></div>`
    + `<div class="bk-row-latest">${select('bookWhen', t('bkBookWhen'), BOOK_WHEN)}<label class="bk-row"><span>${esc(t('bkLatest'))}</span><input class="bk-latest" value="${esc(b.latest ? `${b.latest.slice(0, 2)}:${b.latest.slice(2)}` : '')}" placeholder="18:00" autocomplete="off"></label></div>`
    + `<div class="bk-row-min">${duration('minAhead', t('bkMinAhead'))}</div>` + duration('maxAhead', t('bkMaxAhead'))
    + text('note', t('bkNote'));
  for (const chip of body.querySelectorAll('.bk-chip')) chip.addEventListener('click', () => chip.classList.toggle('on'));
  const mode = () => /** @type {HTMLInputElement | null} */ (body.querySelector('.bk-mode:checked'))?.value ?? 'time';
  const showMode = () => {
    /** @type {HTMLElement} */ (body.querySelector('.bk-row-latest')).hidden = mode() !== 'time';
    /** @type {HTMLElement} */ (body.querySelector('.bk-row-min')).hidden = mode() !== 'ahead';
  };
  for (const r of body.querySelectorAll('.bk-mode')) r.addEventListener('change', showMode);
  showMode();
  const val = (/** @type {string} */ sel) => /** @type {HTMLInputElement} */ (body.querySelector(sel)).value;
  const on = (/** @type {string} */ k) => [...body.querySelectorAll(`.bk-${k} .bk-chip.on`)].map((c) => /** @type {HTMLElement} */ (c).dataset.v ?? '');
  /** The booking as the form has it now (null: nothing filled in). */
  const current = () => normalizeBooking({
    contact: b.contact, phone: val('.bk-phone'), email: val('.bk-email'), url: val('.bk-url'), details: val('.bk-details'),
    access: val('.bk-access'), bookWhen: mode() === 'time' ? val('.bk-bookWhen') : '', methods: on('methods'), buyWhen: on('buyWhen'),
    latest: mode() === 'time' ? latestOf(val('.bk-latest')) : '', minAhead: mode() === 'ahead' ? joinDuration(val('.bk-minAhead-n'), val('.bk-minAhead-u')) : '',
    maxAhead: joinDuration(val('.bk-maxAhead-n'), val('.bk-maxAhead-u')), note: val('.bk-note').replace(/[\r\n]+/g, ' '),
  });
  const errs = document.createElement('div');
  errs.className = 'bk-errs';
  body.appendChild(errs);
  const fb = openFloatBox({
    x, y, title: title ?? t('bkTitle'), body, cls: 'bk-box',
    onApply: () => { if (problemsOf(current()).length) return false; onApply(current()); },
  });
  // The form checks itself while it is filled in (user 2026-10-25): what Entur's validator would refuse is marked at its
  // field and said under the form, and Apply waits until it is right. An empty form is fine: no booking.
  const check = () => {
    const mine = problemsOf(current());
    for (const el of body.querySelectorAll('.bk-bad')) el.classList.remove('bk-bad');
    for (const p of mine) for (const sel of fieldsOf(p, mode())) body.querySelector(sel)?.classList.add('bk-bad');
    errs.innerHTML = mine.map((p) => `<div>${esc(t(`chk:${p}`))}</div>`).join('');
    fb.setApplyEnabled(!mine.length);
  };
  body.addEventListener('input', check);
  body.addEventListener('change', check);
  body.addEventListener('click', check); // the chips (their own toggle runs first)
  check();
  /** @type {HTMLInputElement | null} */ (body.querySelector('.bk-phone'))?.focus();
}
