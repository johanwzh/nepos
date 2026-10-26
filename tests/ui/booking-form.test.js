// @vitest-environment jsdom
// One dialog for x (user 2026-10-26): Ingen / Stopper ved behov / Bestilling, opening on what is there; the booking's
// fields in the order of what is needed (who, how, contact, deadline, note), checked one step at a time.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadAppMarkup } from './dom-setup.js';
import { openBookingForm, minutesOf, isoOf, durationText } from '../../src/ui/booking-form.js';

const q = (/** @type {string} */ s) => /** @type {HTMLElement} */ (document.querySelector(s));
const setVal = (/** @type {string} */ s, /** @type {string} */ v) => { const el = /** @type {HTMLInputElement} */ (q(s)); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
const kind = (/** @type {string} */ v) => { const r = /** @type {HTMLInputElement} */ (q(`.bk-kind[value="${v}"]`)); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); };
const chip = (/** @type {string} */ k, /** @type {string} */ v) => q(`.bk-${k} .bk-chip[data-v="${v}"]`).click();
const typeDur = (/** @type {string} */ k, /** @type {string} */ v) => {
  q(`.bk-dur[data-k="${k}"] .bk-dur-read`).click();
  const input = /** @type {HTMLInputElement} */ (q(`.bk-dur[data-k="${k}"] .bk-dur-input`));
  input.value = v;
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
};
const apply = () => /** @type {HTMLButtonElement} */ (q('.fb-apply'));
const errs = () => q('.bk-errs').textContent ?? '';

beforeEach(() => { loadAppMarkup(); });

describe('durations', () => {
  it('reads and writes the ISO durations, and says them in words', () => {
    expect(minutesOf('PT90M')).toBe(90);
    expect(minutesOf('P1DT4H')).toBe(1680);
    expect(minutesOf('P3D')).toBe(4320);
    expect(isoOf(90)).toBe('PT1H30M');
    expect(isoOf(1680)).toBe('P1DT4H');
    expect(isoOf(0)).toBe('');
    expect(durationText(2645)).toBe('1 d 20 t 5 m');
  });
});

describe('the dialog', () => {
  it('opens on what is there: a booking with its fields, a request stop, or nothing', () => {
    openBookingForm({ booking: { access: 'public', phone: '1', methods: ['callOffice'], minAhead: 'PT1H' }, x: 0, y: 0, onApply: () => {} });
    expect(/** @type {HTMLInputElement} */ (q('.bk-kind[value="booking"]')).checked).toBe(true);
    expect(q('.bk-fields').hidden).toBe(false);
    openBookingForm({ req: true, booking: null, x: 0, y: 0, onApply: () => {} });
    expect(/** @type {HTMLInputElement} */ (q('.bk-kind[value="req"]')).checked).toBe(true);
    expect(q('.bk-fields').hidden).toBe(true);
  });

  it('Ingen and Bruk removes; Stopper ved behov gives a request stop without a booking', () => {
    /** @type {any} */ let got;
    openBookingForm({ booking: { phone: '1' }, x: 0, y: 0, onApply: (r) => { got = r; } });
    kind('none');
    apply().click();
    expect(got).toEqual({ req: false, booking: null });
    openBookingForm({ booking: null, x: 0, y: 0, onApply: (r) => { got = r; } });
    kind('req');
    apply().click();
    expect(got).toEqual({ req: true, booking: null });
  });

  it('for a trip or the line, Stopper ved behov is there but greyed out', () => {
    openBookingForm({ booking: null, allowReq: false, x: 0, y: 0, onApply: () => {} });
    expect(/** @type {HTMLInputElement} */ (q('.bk-kind[value="req"]')).disabled).toBe(true);
  });

  it('a new booking starts as a copy of the level above', () => {
    openBookingForm({ booking: null, startFrom: { access: 'public', phone: '33', methods: ['callOffice'], minAhead: 'PT1H' }, x: 0, y: 0, onApply: () => {} });
    kind('booking');
    expect(/** @type {HTMLInputElement} */ (q('.bk-phone')).value).toBe('33');
  });

  it('the fields come in the order of what is needed; no Detaljer; Som mest før above Som minst før', () => {
    openBookingForm({ booking: null, x: 0, y: 0, onApply: () => {} });
    kind('booking');
    const order = [...document.querySelectorAll('.bk-fields [data-step]')].map((el) => /** @type {HTMLElement} */ (el).dataset.step);
    expect(order).toEqual(['access', 'methods', 'contact', 'deadline', 'note']);
    expect(document.querySelector('.bk-details')).toBeNull();
    const html = q('.bk-fields').innerHTML;
    expect(html.indexOf('data-k="maxAhead"')).toBeLessThan(html.indexOf('data-k="minAhead"'));
  });
});

describe('checked one step at a time (user 2026-10-26)', () => {
  it('who, then how, then only the contact the ways need, then the deadline', () => {
    /** @type {any} */ let got;
    openBookingForm({ booking: null, x: 0, y: 0, onApply: (r) => { got = r; } });
    kind('booking');
    expect(apply().disabled).toBe(true);
    expect(errs()).toMatch(/hvem/i);
    expect(document.querySelectorAll('.bk-bad').length).toBe(0);
    chip('access', 'public');
    expect(errs()).toMatch(/minst én måte/i);
    chip('methods', 'online');
    expect(q('.bk-url').classList.contains('bk-bad')).toBe(true);
    expect(q('.bk-phone').classList.contains('bk-bad')).toBe(false); // online needs a web address, not a phone
    setVal('.bk-url', 'https://b.no');
    expect(errs()).toMatch(/frist/i);
    chip('bookWhen', 'untilPreviousDay');
    setVal('.bk-latest', '18:00');
    expect(errs()).toBe('');
    apply().click();
    expect(got).toEqual({ req: false, booking: { access: 'public', methods: ['online'], url: 'https://b.no', bookWhen: 'untilPreviousDay', latest: '1800' } });
  });

  it('a phone at the stop needs no contact', () => {
    openBookingForm({ booking: null, x: 0, y: 0, onApply: () => {} });
    kind('booking');
    chip('access', 'public');
    chip('methods', 'phoneAtStop');
    expect(errs()).toMatch(/frist/i);
  });

  it('who can book: one choice; clicking it again clears it', () => {
    openBookingForm({ booking: null, x: 0, y: 0, onApply: () => {} });
    kind('booking');
    chip('access', 'public');
    chip('access', 'staff');
    expect([...document.querySelectorAll('.bk-access .bk-chip.on')].map((c) => /** @type {HTMLElement} */ (c).dataset.v)).toEqual(['staff']);
    chip('access', 'staff');
    expect(document.querySelectorAll('.bk-access .bk-chip.on').length).toBe(0);
  });

  it('a duration is typed or turned: plain = minutes, Shift = hours', () => {
    /** @type {any} */ let got;
    openBookingForm({ booking: { access: 'public', phone: '1', methods: ['callOffice'] }, x: 0, y: 0, onApply: (r) => { got = r; } });
    const ahead = /** @type {HTMLInputElement} */ (q('.bk-mode[value="ahead"]'));
    ahead.checked = true; ahead.dispatchEvent(new Event('change', { bubbles: true }));
    typeDur('minAhead', '1d 4t');
    expect(q('.bk-dur[data-k="minAhead"] .bk-dur-read').textContent).toBe('1 d 4 t');
    const jog = q('.bk-dur[data-k="minAhead"] .jd');
    jog.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    jog.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', shiftKey: true, bubbles: true }));
    apply().click();
    expect(got.booking.minAhead).toBe('P1DT5H1M');
  });
});
