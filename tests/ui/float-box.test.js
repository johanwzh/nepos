// @vitest-environment jsdom
// Floating boxes stay inside the window, also when their content is drawn after they open (user 2026-10-19:
// the date picker for a cell near the bottom went off the screen).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadAppMarkup } from './dom-setup.js';
import { openDatePicker } from '../../src/ui/date-picker.js';
import { closeFloatBox } from '../../src/ui/float-box.js';

const proto = /** @type {any} */ (HTMLElement.prototype);
const realHeight = Object.getOwnPropertyDescriptor(proto, 'offsetHeight');

beforeEach(() => {
  loadAppMarkup();
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 600 });
  // The box is small until the calendars are in it (as in a browser, where they are drawn after it opens)
  Object.defineProperty(proto, 'offsetHeight', { configurable: true, get() {
    return this.classList?.contains('float-box') ? (this.querySelector('.yv-title') ? 500 : 100) : 0;
  } });
});
afterEach(() => {
  closeFloatBox();
  if (realHeight) Object.defineProperty(proto, 'offsetHeight', realHeight);
});

describe('the date picker near the bottom of the window', () => {
  it('is placed by its full size, so all of it is on screen', () => {
    openDatePicker({ x: 100, y: 480, title: 'Datoer', base: [], dates: [], onApply: () => {} });
    const box = /** @type {HTMLElement} */ (document.querySelector('.float-box'));
    expect(parseFloat(box.style.top) + 500).toBeLessThanOrEqual(600 - 8);
  });
});
