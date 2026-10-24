// @vitest-environment jsdom
// Copy at intervals points to Virtual intervals (power tools spec 2026-10-24): one quiet line when the interval divides
// an hour and it makes three or more copies.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadAppMarkup } from './dom-setup.js';
import { openCopyInterval } from '../../src/ui/copy-interval.js';

const col = { dayCode: 'D', cells: [{ time: '0600', dayOffset: 0, suffix: '', interchange: null }] };
const fill = (/** @type {string} */ every, /** @type {string} */ last) => {
  openCopyInterval({ col, x: 0, y: 0, onApply: () => {} });
  const i = /** @type {HTMLInputElement} */ (document.querySelector('.cpi-interval'));
  const l = /** @type {HTMLInputElement} */ (document.querySelector('.cpi-last'));
  i.value = every; l.value = last;
  i.dispatchEvent(new Event('input')); l.dispatchEvent(new Event('input'));
  return /** @type {HTMLElement} */ (document.querySelector('.cpi-tip'));
};

beforeEach(() => { loadAppMarkup(); });

describe('the tip in Copy at intervals', () => {
  it('shows for an interval that divides an hour, with three or more copies', () => {
    expect(fill('30', '08:00').hidden).toBe(false);
    expect(fill('30', '08:00').textContent).toMatch(/Virtuelle intervall/);
  });

  it('stays hidden for 40 minutes or for two copies', () => {
    expect(fill('40', '10:00').hidden).toBe(true);
    expect(fill('30', '07:00').hidden).toBe(true);
  });
});
