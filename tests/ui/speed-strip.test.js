// @vitest-environment jsdom
// The speed profile under the timetable (user test 2026-10-16): the selected trip's legs as arcs
// whose height is the straight-line speed, placed by running time across the full width; capped
// arcs; the selected row ringed; a click selects a row.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadAppMarkup, flush } from './dom-setup.js';
import { initShell, setPage, refreshAll } from '../../src/ui/shell.js';
import { initRouteList } from '../../src/ui/route-list.js';
import { initProjectUi, openFs } from '../../src/ui/project-ui.js';
import { initGrid, selectedRowIndex } from '../../src/ui/grid.js';
import { initFootnoteEditor } from '../../src/ui/footnote-editor.js';
import { initRouteEditor, selectRoute } from '../../src/ui/route-editor.js';
import { setQuayLookup, quayInfo } from '../../src/ui/quays.js';
import { initSpeedStrip } from '../../src/ui/speed-strip.js';
import { createMemoryFs } from '../../src/project/fs.js';
import { createProject } from '../../src/project/create.js';
import { writeRoute } from '../../src/project/routes.js';

// A (0700) → B (0702, 1.1 km) → C (0712, 1.1 km) → D (0713, 54 km: far too fast)
const ROUTE = [
  '#LEV;Test;TST', '#RUT;-1;61;Fart;;1;', '#SEK;-1;;0;0;0;0', '#CUR;neposcoin;1', '#TRA;61',
  '#PER;;;;;;', '#TAB;0;;;;', '#TUR;0;D;0;0;0;0',
  '#TRL;0;NSR:Quay:1;A;34;0;-1;-1;34;-1', '#TRC;0;0700;0;0;0;0;0',
  '#TRL;1;NSR:Quay:2;B;34;0;-1;-1;34;-1', '#TRC;0;0702;0;0;0;0;0',
  '#TRL;2;NSR:Quay:3;C;34;0;-1;-1;34;-1', '#TRC;0;0712;0;0;0;0;0',
  '#TRL;3;NSR:Quay:4;D;34;0;-1;-1;34;-1', '#TRC;0;0713;0;0;0;0;0',
].join('\r\n') + '\r\n';
const POS = /** @type {Record<string, [number, number]>} */ ({ 'NSR:Quay:1': [60, 10], 'NSR:Quay:2': [60.01, 10], 'NSR:Quay:3': [60.02, 10], 'NSR:Quay:4': [60.5, 10] });

const settle = async () => { for (let i = 0; i < 6; i++) await flush(); };
const strip = () => /** @type {HTMLElement} */ (document.getElementById('speed-strip'));
const timeCell = (/** @type {number} */ r) => /** @type {HTMLElement} */ (document.querySelector(`[data-r="${r}"][data-c="0"]`));

let wired = false;
beforeEach(async () => {
  loadAppMarkup();
  initShell();
  setPage('edit');
  initRouteList();
  await initProjectUi({ restoreLast: false });
  if (!wired) { initGrid(); initFootnoteEditor(); wired = true; }
  initRouteEditor();
  initSpeedStrip();
  setQuayLookup(async (ids) => new Map(ids.map((id) => [id, POS[id] ? { quayId: id, publicCode: '', stopPlaceId: `SP${id}`, stopPlaceName: id, mode: 'bus', lat: POS[id][0], lon: POS[id][1] } : null])));
  const fs = createMemoryFs();
  await createProject(fs, { name: 'Test', codespace: 'TST' });
  await writeRoute(fs, '61', ROUTE);
  await openFs(fs);
  /** @type {any} */ (document.getElementById('check-dlg')).close();
  await selectRoute('61');
  await settle();
  timeCell(0).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
});

describe('the speed profile under the timetable', () => {
  it('says so when the trip has too few stops with a known position', async () => {
    for (const id of Object.keys(POS)) quayInfo.set(id, null); // NSR knows none of them
    refreshAll();
    expect(strip().textContent).toContain('posisjon');
  });

  it('draws the trip\'s stops as dots and each leg as an arc, placed by running time', () => {
    const dots = [...strip().querySelectorAll('.sp-dot')];
    expect(dots.map((d) => /** @type {any} */ (d).dataset.ri)).toEqual(['0', '1', '2', '3']);
    const xs = dots.map((d) => Number(d.getAttribute('cx')));
    // 2 of 13 minutes, then 12 of 13: B sits at about 15 % of the width, C at about 92 %
    const span = xs[3] - xs[0];
    expect(Math.round(((xs[1] - xs[0]) / span) * 100)).toBe(15);
    expect(Math.round(((xs[2] - xs[0]) / span) * 100)).toBe(92);
    const legs = [...strip().querySelectorAll('.sp-leg')];
    expect(legs.map((l) => l.getAttribute('class'))).toEqual(['sp-leg ok', 'sp-leg ok', 'sp-leg over']);
    expect(legs[0].querySelector('title')?.textContent).toContain('km/t');
  });

  it('caps an extreme arc instead of drawing it over the screen', () => {
    const over = /** @type {Element} */ (strip().querySelectorAll('.sp-leg')[2]);
    expect(over.getAttribute('data-capped')).toBe('1');
    expect(strip().querySelector('.sp-cap')).not.toBeNull();
  });

  it('rings the selected row\'s stop, and a click on a leg selects the row it arrives at', () => {
    timeCell(2).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    expect(strip().querySelector('.sp-here')?.getAttribute('data-ri')).toBe('2');
    strip().querySelectorAll('.sp-leg')[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(selectedRowIndex()).toBe(1);
  });
});
