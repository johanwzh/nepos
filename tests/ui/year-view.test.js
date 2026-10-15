// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { loadAppMarkup } from './dom-setup.js';
import { renderYearView, renderMonthsView } from '../../src/ui/year-view.js';

/** @type {any[]} */ let changes;
/** @type {HTMLElement} */ let box;
const day = (/** @type {string} */ d) => /** @type {HTMLElement} */ (box.querySelector(`.yv-day[data-date="${d}"]`));
const fire = (/** @type {Element} */ el, /** @type {string} */ type) => el.dispatchEvent(new MouseEvent(type, { bubbles: true }));

beforeEach(() => {
  loadAppMarkup();
  changes = [];
  box = document.createElement('div');
  document.body.appendChild(box);
  renderYearView(box, { year: 2027, active: new Set(['20270104']), lang: 'no', onChange: (days, on) => changes.push([days, on]) });
});

describe('year view', () => {
  it('shows twelve months with ISO weeks, Sundays and holidays', () => {
    expect(box.querySelectorAll('.yv-month')).toHaveLength(12);
    expect(box.querySelector('.yv-title')?.textContent).toContain('Januar 2027');
    expect(box.querySelectorAll('.yv-day')).toHaveLength(365);
    expect(day('20270103').classList.contains('sun')).toBe(true);
    expect(day('20270517').classList.contains('hol')).toBe(true);
    expect(day('20270517').title).toContain('Grunnlovsdag');
    expect(day('20270104').classList.contains('on')).toBe(true);
    expect(box.textContent).toContain('17.5: 2. pinsedag, Grunnlovsdag');
    const firstRowWeek = box.querySelector('.yv-month tbody tr .yv-week')?.textContent;
    expect(firstRowWeek).toBe('53');
  });

  it('toggles a day with a click', () => {
    fire(day('20270105'), 'mousedown');
    fire(document.body, 'mouseup');
    expect(changes).toEqual([[['20270105'], true]]);
    fire(day('20270104'), 'mousedown');
    fire(document.body, 'mouseup');
    expect(changes[1]).toEqual([['20270104'], false]);
  });

  it('drags across a month boundary, ending the drag even when released outside', () => {
    fire(day('20270130'), 'mousedown');
    day('20270131').dispatchEvent(new MouseEvent('mouseover', { bubbles: true, buttons: 1 }));
    day('20270201').dispatchEvent(new MouseEvent('mouseover', { bubbles: true, buttons: 1 }));
    fire(document.body, 'mouseup');
    expect(changes).toEqual([[['20270130', '20270131', '20270201'], true]]);
  });

  it('has 29 February in a leap year', () => {
    renderYearView(box, { year: 2028, active: new Set(), lang: 'no', onChange: () => {} });
    expect(day('20280229')).not.toBe(null);
  });
});

describe('year view drag safety', () => {
  it('fills the whole stretch between the first and the current day, even when the mouse skips cells', () => {
    fire(day('20270130'), 'mousedown');
    day('20270203').dispatchEvent(new MouseEvent('mouseover', { bubbles: true, buttons: 1 }));
    fire(document.body, 'mouseup');
    expect(changes).toEqual([[['20270130', '20270131', '20270201', '20270202', '20270203'], true]]);
  });

  it('starts no drag with the right button, and ends a drag when the button is no longer held', () => {
    day('20270105').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 2 }));
    fire(document.body, 'mouseup');
    expect(changes).toEqual([]);
    fire(day('20270106'), 'mousedown');
    day('20270108').dispatchEvent(new MouseEvent('mouseover', { bubbles: true, buttons: 0 })); // released outside the window
    fire(document.body, 'mouseup');
    expect(changes).toEqual([]);
  });
});

describe('a run of months (calendars page spec §4)', () => {
  it('starts at any month and crosses New Year, each year in its colour, each month with its emoji', () => {
    renderMonthsView(box, { start: '202608', count: 12, active: new Set(), today: '20261016', lang: 'no', onChange: () => {} });
    const titles = [...box.querySelectorAll('.yv-title')].map((e) => e.textContent);
    expect(titles[0]).toBe('🌻 August 2026');
    expect(titles[5]).toBe('🧊 Januar 2027');
    expect(titles[9]).toBe('🐝 Mai 2027');
    expect(titles[11]).toBe('😎 Juli 2027');
    const yearClass = (/** @type {number} */ i) => [...box.querySelectorAll('.yv-month')][i].className.match(/yv-y\d/)?.[0];
    expect(yearClass(0)).not.toBe(yearClass(5));
    expect(yearClass(0)).toBe(yearClass(4));
  });

  it('greys out the days before today, which can still be clicked', () => {
    renderMonthsView(box, { start: '202610', count: 2, active: new Set(), today: '20261016', lang: 'no', onChange: (days, on) => changes.push([days, on]) });
    expect(day('20261015').classList.contains('past')).toBe(true);
    expect(day('20261016').classList.contains('past')).toBe(false);
    expect(day('20261016').classList.contains('today')).toBe(true); // a ring shows where the past ends
    expect(day('20261017').classList.contains('today')).toBe(false);
    fire(day('20261015'), 'mousedown');
    fire(document.body, 'mouseup');
    expect(changes).toEqual([[['20261015'], true]]);
  });

  it('marks the holidays of every year it shows', () => {
    renderMonthsView(box, { start: '202612', count: 6, active: new Set(), today: '20261016', lang: 'no', onChange: () => {} });
    expect(day('20261225').classList.contains('hol')).toBe(true);
    expect(day('20270517').classList.contains('hol')).toBe(true);
  });
});
