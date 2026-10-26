// x on a time, and a trip's or the line's booking (booking spec 2026-10-22; one dialog, user 2026-10-26): Ingen, Stopper
// ved behov or Bestilling, as radio buttons; it opens on what is there. A booking's fields come in the order of what is
// needed — who can book, how (one way at least), the contact those ways need, the deadline, a note — and the form
// checks one step at a time, so it never marks a field before its turn. Apply waits until the booking is right.
// The ERN fields not shown (contact person, details) are kept as they were.
import { t } from '../i18n/strings.js';
import { openFloatBox } from './float-box.js';
import { jogDial } from './jog/jogDial.js';
import { normalizeBooking, bookingProblems, BOOKING_METHODS, BUY_WHEN, BOOKING_ACCESS, BOOK_WHEN } from '../core/booking.js';

/** @param {string} s */
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** An ISO duration (PT90M, P1DT4H, P3D) → minutes; null when not one Nepos reads. @param {string | undefined} iso */
export function minutesOf(iso) {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(iso ?? '');
  if (!m || iso === 'P' || iso === 'PT') return null;
  return Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}
/** Minutes → an ISO duration ('' for none). @param {number} min */
export function isoOf(min) {
  if (!(min > 0)) return '';
  const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60;
  return `P${d ? `${d}D` : ''}${h || m ? `T${h ? `${h}H` : ''}${m ? `${m}M` : ''}` : ''}`;
}
/** Minutes in words: "1 d 20 t 5 m"; '—' for none. @param {number} min */
export function durationText(min) {
  if (!(min > 0)) return '—';
  const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60;
  return [d && `${d} ${t('bkDurD')}`, h && `${h} ${t('bkDurH')}`, m && `${m} ${t('bkDurM')}`].filter(Boolean).join(' ');
}
/** What the user types: "90", "2t", "1d 4t", "1 d 20 t 5 m", "2h" → minutes; null when not readable. @param {string} s */
function typedMinutes(s) {
  const v = s.trim().toLowerCase();
  if (!v) return 0;
  let total = 0, any = false;
  for (const m of v.matchAll(/(\d+)\s*([dthm]?)/g)) {
    any = true;
    total += Number(m[1]) * (m[2] === 'd' ? 1440 : m[2] === 't' || m[2] === 'h' ? 60 : 1);
  }
  return any && /^[\d\sdthm]+$/.test(v) ? total : null;
}
/** "18:00", "1800", "8:00" → "1800"; '' when not a time. @param {string} s */
export function latestOf(s) {
  const m = /^(\d{1,2})[:.]?(\d{2})$/.exec(s.trim());
  return m && Number(m[1]) <= 23 && Number(m[2]) <= 59 ? m[1].padStart(2, '0') + m[2] : '';
}

/**
 * The first step that is not done yet, and its problems: who can book, how, the contact the ways need, the deadline.
 * @param {any} b @returns {{ step: string, codes: string[] }}
 */
function firstStep(b) {
  if (!b?.access) return { step: 'access', codes: ['booking-access'] };
  if (!b.methods?.length) return { step: 'methods', codes: ['booking-methods'] };
  const rules = bookingProblems(b);
  const contact = rules.filter((p) => p.startsWith('booking-method-'));
  if (contact.length) return { step: 'contact', codes: contact };
  const deadline = rules.filter((p) => !p.startsWith('booking-method-'));
  if (deadline.length) return { step: 'deadline', codes: deadline };
  return { step: '', codes: [] };
}

/** The fields a problem is about. @param {string} p @param {string} mode 'time' | 'ahead' */
function fieldsOf(p, mode) {
  if (p === 'booking-method-phone') return ['.bk-phone'];
  if (p === 'booking-method-url') return ['.bk-url'];
  if (p === 'booking-latest' || p === 'booking-neither') return mode === 'ahead' ? ['.bk-dur[data-k="minAhead"]'] : ['.bk-bookWhen', '.bk-latest'];
  return [];
}

/**
 * @param {{ booking: any, req?: boolean, allowReq?: boolean, startFrom?: any, x: number, y: number, title?: string,
 *   onApply: (r: { req: boolean, booking: import('../core/booking.js').Booking | null }) => void }} opts
 *   allowReq: false for a trip or the line (only a time can be a request stop: shown, greyed out); startFrom: what a new
 *   booking starts as (the level above)
 */
export function openBookingForm({ booking, req = false, allowReq = true, startFrom = null, x, y, title, onApply }) {
  const own = normalizeBooking(booking);
  const b = own ?? normalizeBooking(startFrom) ?? {};
  const kindNow = own ? 'booking' : req && allowReq ? 'req' : 'none';
  /** @type {Record<string, number>} */
  const dur = { maxAhead: minutesOf(b.maxAhead) ?? 0, minAhead: minutesOf(b.minAhead) ?? 0 };
  const body = document.createElement('div');
  body.className = 'bk-form';
  const text = (/** @type {string} */ k, /** @type {string} */ label, /** @type {string} */ ph = '') =>
    `<label class="bk-row"><span>${esc(label)}</span><input class="bk-${k}" value="${esc(/** @type {any} */ (b)[k] ?? '')}" placeholder="${esc(ph)}" autocomplete="off"></label>`;
  /** Chips; `one`: exclusive (clicking the chosen one again clears it). */
  const chips = (/** @type {string} */ k, /** @type {string} */ label, /** @type {string[]} */ values, one = false) => {
    const now = /** @type {any} */ (b)[k];
    const on = (/** @type {string} */ v) => (one ? now === v : now?.includes(v));
    return `<div class="bk-row"><span>${esc(label)}</span><div class="bk-chips bk-${k}${one ? ' bk-one' : ''}">${values.map((v) => `<button type="button" class="bk-chip${on(v) ? ' on' : ''}" data-v="${v}">${esc(t(`bk:${v}`))}</button>`).join('')}</div></div>`;
  };
  const duration = (/** @type {string} */ k, /** @type {string} */ label) =>
    `<div class="bk-row"><span>${esc(label)}</span><span class="bk-dur" data-k="${k}"><span class="bk-dur-read" tabindex="0" title="${esc(t('bkDurHint'))}">${esc(durationText(dur[k]))}</span></span></div>`;
  const kinds = /** @type {[string, string][]} */ ([['none', 'xwNone'], ['req', 'xwReq'], ['booking', 'bkTitle']]);
  body.innerHTML = `<div class="bk-kinds">${kinds.map(([v, key]) => `<label class="bk-kind-row${v === 'req' && !allowReq ? ' off' : ''}"><input type="radio" name="bk-kind" class="bk-kind" value="${v}"${v === kindNow ? ' checked' : ''}${v === 'req' && !allowReq ? ' disabled' : ''}> ${esc(t(key))}</label>`).join('')}</div>
    <div class="bk-fields">
      <div data-step="access">${chips('access', t('bkAccess'), BOOKING_ACCESS, true)}</div>
      <div data-step="methods">${chips('methods', t('bkMethods'), BOOKING_METHODS)}</div>
      <div data-step="contact">${text('phone', t('bkPhone'))}${text('email', t('bkEmail'))}${text('url', t('bkUrl'), 'https://')}</div>
      <div data-step="deadline">
        <div class="bk-row"><span>${esc(t('bkDeadline'))}</span><span class="bk-modes">${(/** @type {[string, string][]} */ ([['time', 'bkModeTime'], ['ahead', 'bkModeAhead']])).map(([v, k]) =>
          `<label><input type="radio" name="bk-mode" class="bk-mode" value="${v}"${(b.minAhead ? 'ahead' : 'time') === v ? ' checked' : ''}> ${esc(t(k))}</label>`).join('')}</span></div>
        <div class="bk-row-latest">${chips('bookWhen', t('bkBookWhen'), BOOK_WHEN, true)}<label class="bk-row"><span>${esc(t('bkLatest'))}</span><input class="bk-latest" value="${esc(b.latest ? `${b.latest.slice(0, 2)}:${b.latest.slice(2)}` : '')}" placeholder="18:00" autocomplete="off"></label></div>
        ${duration('maxAhead', t('bkMaxAhead'))}
        <div class="bk-row-min">${duration('minAhead', t('bkMinAhead'))}</div>
        ${chips('buyWhen', t('bkBuyWhen'), BUY_WHEN)}
      </div>
      <div data-step="note">${text('note', t('bkNote'))}</div>
    </div>
    <div class="bk-errs"></div>`;
  const val = (/** @type {string} */ sel) => /** @type {HTMLInputElement} */ (body.querySelector(sel)).value;
  const on = (/** @type {string} */ k) => [...body.querySelectorAll(`.bk-${k} .bk-chip.on`)].map((c) => /** @type {HTMLElement} */ (c).dataset.v ?? '');
  const kind = () => /** @type {HTMLInputElement | null} */ (body.querySelector('.bk-kind:checked'))?.value ?? 'none';
  const mode = () => /** @type {HTMLInputElement | null} */ (body.querySelector('.bk-mode:checked'))?.value ?? 'time';
  /** The booking as the form has it now (null: nothing filled in). */
  const current = () => normalizeBooking({
    contact: b.contact, details: b.details, phone: val('.bk-phone'), email: val('.bk-email'), url: val('.bk-url'),
    access: on('access')[0] ?? '', methods: on('methods'), buyWhen: on('buyWhen'),
    bookWhen: mode() === 'time' ? on('bookWhen')[0] ?? '' : '', latest: mode() === 'time' ? latestOf(val('.bk-latest')) : '',
    minAhead: mode() === 'ahead' ? isoOf(dur.minAhead) : '', maxAhead: isoOf(dur.maxAhead), note: val('.bk-note').replace(/[\r\n]+/g, ' '),
  });
  const result = () => (kind() === 'booking' ? { req: false, booking: current() } : { req: kind() === 'req', booking: null });
  const fb = openFloatBox({
    x, y, title: title ?? t('xwTitle'), body, cls: 'bk-box',
    onApply: () => { if (kind() === 'booking' && firstStep(current()).codes.length) return false; onApply(result()); },
  });
  const errs = /** @type {HTMLElement} */ (body.querySelector('.bk-errs'));
  const check = () => {
    /** @type {HTMLElement} */ (body.querySelector('.bk-fields')).hidden = kind() !== 'booking';
    /** @type {HTMLElement} */ (body.querySelector('.bk-row-latest')).hidden = mode() !== 'time';
    /** @type {HTMLElement} */ (body.querySelector('.bk-row-min')).hidden = mode() !== 'ahead';
    for (const el of body.querySelectorAll('.bk-bad')) el.classList.remove('bk-bad');
    const { codes } = kind() === 'booking' ? firstStep(current()) : { codes: [] };
    for (const p of codes) for (const sel of fieldsOf(p, mode())) body.querySelector(sel)?.classList.add('bk-bad');
    errs.innerHTML = codes.map((p) => `<div>${esc(t(`chk:${p}`))}</div>`).join('');
    fb.setApplyEnabled(!codes.length);
  };
  // Chips: several, or one (clicking the chosen one again clears it)
  for (const chip of body.querySelectorAll('.bk-chip')) {
    chip.addEventListener('click', () => {
      const group = /** @type {HTMLElement} */ (chip.parentElement);
      if (group.classList.contains('bk-one')) for (const other of group.querySelectorAll('.bk-chip.on')) if (other !== chip) other.classList.remove('on');
      chip.classList.toggle('on');
      check();
    });
  }
  // Durations: a dial (minutes; Shift: hours), or click the words to type them
  for (const box of body.querySelectorAll('.bk-dur')) {
    const k = /** @type {string} */ (/** @type {HTMLElement} */ (box).dataset.k);
    const read = /** @type {HTMLElement} */ (box.querySelector('.bk-dur-read'));
    const show = () => { read.textContent = durationText(dur[k]); check(); };
    const dial = jogDial({ size: 28, detents: true, pxPerNotch: 6, onNudge: (/** @type {1 | -1} */ dir, /** @type {boolean} */ coarse) => { dur[k] = Math.max(0, dur[k] + dir * (coarse ? 60 : 1)); show(); } });
    dial.addEventListener('keydown', (e) => e.stopPropagation());
    box.appendChild(dial);
    read.addEventListener('click', () => {
      const input = document.createElement('input');
      input.className = 'bk-dur-input';
      input.value = dur[k] ? durationText(dur[k]) : '';
      input.placeholder = '1 d 4 t 30 m';
      read.replaceWith(input);
      input.focus();
      const done = (/** @type {boolean} */ keep) => {
        const m = typedMinutes(input.value);
        if (keep && m !== null) dur[k] = m;
        input.replaceWith(read);
        show();
      };
      input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); });
      input.addEventListener('blur', () => { if (input.isConnected) done(true); });
    });
  }
  body.addEventListener('input', check);
  body.addEventListener('change', check);
  check();
}
