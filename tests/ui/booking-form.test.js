// @vitest-environment jsdom
// The booking form and the x window (booking spec 2026-10-22).
import { describe, it, expect, beforeEach } from 'vitest';
import { loadAppMarkup } from './dom-setup.js';
import { openBookingForm } from '../../src/ui/booking-form.js';
import { openXWindow } from '../../src/ui/x-window.js';

const q = (/** @type {string} */ s) => /** @type {HTMLElement} */ (document.querySelector(s));
const setVal = (/** @type {string} */ s, /** @type {string} */ v) => { const el = /** @type {HTMLInputElement} */ (q(s)); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };

beforeEach(() => { loadAppMarkup(); });

describe('the booking form', () => {
  it('starts from the given booking and gives back what was edited', () => {
    /** @type {any} */ let got;
    openBookingForm({ booking: { phone: '22', methods: ['online'] }, x: 10, y: 10, onApply: (b) => { got = b; } });
    expect(/** @type {HTMLInputElement} */ (q('.bk-phone')).value).toBe('22');
    expect(q('.bk-chip[data-v="online"]').classList.contains('on')).toBe(true);
    setVal('.bk-email', 'a@b.no');
    q('.bk-chip[data-v="callOffice"]').click();
    setVal('.bk-bookWhen', 'untilPreviousDay');
    setVal('.bk-latest', '18:00');
    q('.fb-apply').click();
    expect(got).toEqual({ phone: '22', email: 'a@b.no', methods: ['callOffice', 'online'], bookWhen: 'untilPreviousDay', latest: '1800' });
  });

  it('the deadline is either "by a time" (when to book + latest time) or "at least … before departure", never both (Antu, Uttu)', () => {
    /** @type {any} */ let got;
    openBookingForm({ booking: { phone: '1', bookWhen: 'untilPreviousDay', latest: '1800' }, x: 0, y: 0, onApply: (b) => { got = b; } });
    expect(/** @type {HTMLInputElement} */ (q('.bk-mode[value="time"]')).checked).toBe(true);
    expect(/** @type {HTMLElement} */ (q('.bk-row-min')).hidden).toBe(true);
    const ahead = /** @type {HTMLInputElement} */ (q('.bk-mode[value="ahead"]'));
    ahead.checked = true; ahead.dispatchEvent(new Event('change', { bubbles: true }));
    expect(/** @type {HTMLElement} */ (q('.bk-row-latest')).hidden).toBe(true);
    setVal('.bk-minAhead-n', '2'); setVal('.bk-minAhead-u', 'H');
    q('.fb-apply').click();
    expect(got).toEqual({ phone: '1', minAhead: 'PT2H' });
  });

  it('offers only the Nordic values: no "at the time of travel", no "no ticket needed"', () => {
    openBookingForm({ booking: null, x: 0, y: 0, onApply: () => {} });
    expect([...document.querySelectorAll('.bk-bookWhen option')].map((o) => /** @type {HTMLOptionElement} */ (o).value)).toEqual(['', 'dayOfTravelOnly', 'untilPreviousDay', 'advanceAndDayOfTravel']);
    expect(document.querySelector('.bk-chip[data-v="noTicketRequired"]')).toBeNull();
  });

  it('has no contact-person field and keeps a contact it was given', () => {
    /** @type {any} */ let got;
    openBookingForm({ booking: { contact: 'Kari', phone: '1' }, x: 0, y: 0, onApply: (b) => { got = b; } });
    expect(document.querySelector('.bk-contact')).toBeNull();
    q('.fb-apply').click();
    expect(got).toEqual({ contact: 'Kari', phone: '1' });
  });

  it('gives null when everything is cleared', () => {
    /** @type {any} */ let got = 'unset';
    openBookingForm({ booking: { phone: '1' }, x: 0, y: 0, onApply: (b) => { got = b; } });
    setVal('.bk-phone', '');
    q('.fb-apply').click();
    expect(got).toBeNull();
  });
});

describe('the x window', () => {
  it('offers none, request stop and booking; request stop gives req without booking', () => {
    /** @type {any} */ let got;
    openXWindow({ req: false, booking: null, startFrom: null, x: 0, y: 0, onApply: (r) => { got = r; } });
    expect([...document.querySelectorAll('.xw-choice')].map((b) => /** @type {HTMLElement} */ (b).dataset.v)).toEqual(['none', 'req', 'booking']);
    q('.xw-choice[data-v="req"]').click();
    expect(got).toEqual({ req: false, booking: null, ...{ req: true } });
  });

  it('booking opens the form as a copy of the level above', () => {
    /** @type {any} */ let got;
    openXWindow({ req: true, booking: null, startFrom: { phone: '33' }, x: 0, y: 0, onApply: (r) => { got = r; } });
    q('.xw-choice[data-v="booking"]').click();
    expect(/** @type {HTMLInputElement} */ (q('.bk-phone')).value).toBe('33');
    q('.fb-apply').click();
    expect(got).toEqual({ req: false, booking: { phone: '33' } });
  });

  it('none clears both', () => {
    /** @type {any} */ let got;
    openXWindow({ req: true, booking: { phone: '1' }, startFrom: null, x: 0, y: 0, onApply: (r) => { got = r; } });
    q('.xw-choice[data-v="none"]').click();
    expect(got).toEqual({ req: false, booking: null });
  });
});
