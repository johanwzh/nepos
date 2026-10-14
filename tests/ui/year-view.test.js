// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { loadAppMarkup } from './dom-setup.js';
import { renderYearView } from '../../src/ui/year-view.js';

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
    expect(box.querySelector('.yv-title')?.textContent).toBe('Januar 2027');
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
    fire(day('20270131'), 'mouseover');
    fire(day('20270201'), 'mouseover');
    fire(document.body, 'mouseup');
    expect(changes).toEqual([[['20270130', '20270131', '20270201'], true]]);
  });

  it('has 29 February in a leap year', () => {
    renderYearView(box, { year: 2028, active: new Set(), lang: 'no', onChange: () => {} });
    expect(day('20280229')).not.toBe(null);
  });
});
