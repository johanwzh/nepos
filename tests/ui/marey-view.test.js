// @vitest-environment jsdom
// Alt+V swaps the timetable for the visual timetable (Marey chart, design 2026-10-27), and back.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadAppMarkup } from './dom-setup.js';
import { app } from '../../src/ui/state.js';
import { initShell } from '../../src/ui/shell.js';
import { initGrid, loadGrid } from '../../src/ui/grid.js';
import { initFootnoteEditor } from '../../src/ui/footnote-editor.js';
import { newRouteState } from '../../src/ui/route-state.js';
import { initMarey, mareyOn } from '../../src/ui/marey-view.js';

const stop = (name, stopId) => ({ name, stopId, bold: false, sep: false, isDwellArr: false, price: null });
const cell = (time) => ({ time, dayOffset: 0, suffix: '', interchange: null });
const col = (times) => ({ dayCode: 'D', note: '', dates: [], uid: crypto.randomUUID(), cells: times.map((t) => (t ? cell(t) : null)) });
const altV = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', altKey: true, bubbles: true, cancelable: true }));

let wired = false;
beforeEach(() => {
  loadAppMarkup();
  initShell();
  initGrid();
  initMarey();
  if (!wired) { initFootnoteEditor(); wired = true; }
  app.calendars = [{ id: 'h1', name: 'År', ranges: [['20270101', '20271231']] }];
  app.routeState = newRouteState('no');
  app.routeState.periods[0].calendarIds = ['h1'];
  loadGrid({ stops: [stop('A', 'q1'), stop('B', 'q2'), stop('C', 'q3')], cols: [
    col(['0700', '0710', '0720']), col(['0730', '0740', '0750']), col(['0800', '|', '0820']), col(['0830', '0845', '0900']),
  ] });
  if (mareyOn()) altV();
});

describe('the visual timetable', () => {
  it('Alt+V shows the chart in place of the timetable, and Alt+V again goes back', () => {
    altV();
    expect(mareyOn()).toBe(true);
    expect(document.body.classList.contains('marey-on')).toBe(true);
    expect(document.querySelectorAll('#marey .mr-trip')).toHaveLength(4);
    altV();
    expect(document.body.classList.contains('marey-on')).toBe(false);
  });

  it('draws the rows, a dashed skip (no marker) for a pass, and a band for the two trips that share a pattern', () => {
    altV();
    expect([...document.querySelectorAll('#marey .mr-row-name')].map((t) => t.textContent)).toEqual(['A', 'B', 'C']);
    expect(document.querySelectorAll('#marey .mr-pass')).toHaveLength(0); // a passed stop has no marker: just the dashed line (user 2026-10-27)
    expect(document.querySelectorAll('#marey .mr-skip')).toHaveLength(1);
    expect(document.querySelectorAll('#marey .mr-tribe')).toHaveLength(1);
  });

  it('a weekday chip highlights the trips that run on that day; a click on a trip picks it out', () => {
    altV();
    /** @type {HTMLElement} */ (document.querySelectorAll('#marey .mr-wd')[4]).click(); // Friday: the chart opens on Fri 1 January 2027
    expect(document.querySelectorAll('#marey .mr-trip.mr-lit')).toHaveLength(4);
    /** @type {HTMLElement} */ (document.querySelectorAll('#marey .mr-wd')[4]).click(); // Friday: the chart opens on Fri 1 January 2027
    /** @type {HTMLElement} */ (document.querySelector('#marey .mr-trip .mr-hit')).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.querySelectorAll('#marey .mr-trip.mr-lit')).toHaveLength(1);
  });
});
