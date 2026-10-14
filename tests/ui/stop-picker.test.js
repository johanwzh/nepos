// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadAppMarkup, flush } from './dom-setup.js';
import { initShell, setPage, panelOpen } from '../../src/ui/shell.js';
import { initRouteList } from '../../src/ui/route-list.js';
import { initProjectUi, openFs } from '../../src/ui/project-ui.js';
import { initGrid, grid } from '../../src/ui/grid.js';
import { initFootnoteEditor } from '../../src/ui/footnote-editor.js';
import { initRouteEditor, selectRoute } from '../../src/ui/route-editor.js';
import { setQuayLookup, quayInfo } from '../../src/ui/quays.js';
import { initStopPicker, setPickerServices, setPickerMap } from '../../src/ui/stop-picker.js';
import { createMemoryFs } from '../../src/project/fs.js';
import { createProject } from '../../src/project/create.js';
import { writeRoute } from '../../src/project/routes.js';

// Row 0 Jernbanetorget; rows 1 and 2 one dwell stop (arrival, departure); row 3 without an ID.
const ROUTE = [
  '#LEV;Test;TST', '#RUT;-1;60;Dwell;;1;', '#SEK;-1;;0;0;0;0', '#CUR;neposcoin;1', '#TRA;60',
  '#PER;;;;;;', '#TAB;0;;;;', '#TUR;0;D;0;0;0;0',
  '#TRL;0;NSR:Quay:7203;Jernbanetorget;34;0;-1;-1;34;-1', '#TRC;0;0700;0;0;0;0;0',
  '#TRL;1;NSR:Quay:11972;Oslo bussterminal;34;0;-1;-1;34;-1', '#TRC;0;0710;0;0;0;0;0',
  '#TRL;2;NSR:Quay:11972;Oslo bussterminal;34;0;-1;-1;34;-1', '#TRC;0;0715;0;0;0;0;0',
  '#TRL;3;-1;Uten ID;34;0;-1;-1;34;-1', '#TRC;0;0730;0;0;0;0;0',
].join('\r\n') + '\r\n';

const JBT = { quayId: 'NSR:Quay:7203', publicCode: 'A', stopPlaceId: 'NSR:StopPlace:4000', stopPlaceName: 'Jernbanetorget', mode: 'bus', lat: 59.91, lon: 10.75 };
const SKOYEN_PLACE = { id: 'NSR:StopPlace:5', name: 'Skøyen', description: '', mode: 'bus', quays: [{ quayId: 'NSR:Quay:55', publicCode: 'B', description: '', lat: 59.92, lon: 10.68 }] };
const BIG_PLACE = { id: 'NSR:StopPlace:6', name: 'Storsenter', description: '', mode: 'bus', quays: [
  { quayId: 'NSR:Quay:61', publicCode: 'A', description: '', lat: 59.93, lon: 10.7 }, { quayId: 'NSR:Quay:62', publicCode: 'B', description: '', lat: 59.93, lon: 10.71 }] };
const hit = (/** @type {any} */ p) => ({ id: p.id, name: p.name, context: 'Oslo', description: '', modes: ['bus'], lat: 59.9, lon: 10.7 });

/** @type {((v: any) => void)[]} */
let pending = [];
let holdSearch = false;
let lastModel = /** @type {any} */ (null);

const settle = async () => { for (let i = 0; i < 6; i++) await flush(); };
const nameCell = (/** @type {number} */ ri) => /** @type {HTMLElement} */ (document.querySelector(`.g-td-name[data-ri="${ri}"]`));
const pickRow = (/** @type {number} */ ri) => nameCell(ri).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
const press = (/** @type {string} */ key, target = /** @type {EventTarget} */ (document)) => target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
const q = () => /** @type {HTMLInputElement} */ (document.getElementById('sp-q'));
const rows = () => /** @type {HTMLElement[]} */ ([...document.querySelectorAll('#sp-list .sp-row')]);
async function search(/** @type {string} */ text) {
  q().value = text;
  press('Enter', q());
  await settle();
}

let wired = false;
beforeEach(async () => {
  loadAppMarkup();
  initShell();
  setPage('edit');
  initRouteList();
  await initProjectUi({ restoreLast: false });
  if (!wired) { initGrid(); initFootnoteEditor(); wired = true; }
  initRouteEditor();
  initStopPicker();
  pending = [];
  holdSearch = false;
  setPickerMap({ show: (m) => { lastModel = m; }, onPick: () => {}, view: () => null, onViewChange: () => {}, zoomTo: () => {} });
  setPickerServices({
    search: async (text) => (holdSearch ? new Promise((r) => pending.push(r)) : text.startsWith('Sk') ? [hit(SKOYEN_PLACE)] : [hit(BIG_PLACE)]),
    getStopPlace: async (id) => (id === SKOYEN_PLACE.id ? SKOYEN_PLACE : id === BIG_PLACE.id ? BIG_PLACE : null),
    lookupQuays: async (ids) => new Map(ids.map((id) => [id, id === JBT.quayId ? JBT : null])),
  });
  setQuayLookup(async (ids) => new Map(ids.map((id) => [id, id === JBT.quayId ? JBT : null])));
  const fs = createMemoryFs();
  await createProject(fs, { name: 'Test', codespace: 'TST' });
  await writeRoute(fs, '60', ROUTE);
  await openFs(fs);
  /** @type {any} */ (document.getElementById('check-dlg')).close();
  await selectRoute('60');
  await settle();
});

describe('stop picking in the map pane', () => {
  it('follows the selected stop cell', () => {
    pickRow(0);
    expect(document.getElementById('sp').hidden).toBe(false);
    expect(document.getElementById('sp-head').textContent).toContain('1');
    expect(document.getElementById('sp-head').textContent).toContain('Jernbanetorget · A');
    pickRow(3);
    expect(document.getElementById('sp-head').textContent).toContain('4');
  });

  it('opens the pane when typing in a stop cell and searches for the text, leaving the row alone', async () => {
    expect(panelOpen('right')).toBe(false);
    pickRow(3);
    press('S');
    expect(panelOpen('right')).toBe(true);
    expect(q().value).toBe('S');
    expect(grid.stops[3].name).toBe('Uten ID');
  });

  it('makes a one-Quay stop place the candidate and puts it in the row only on Bruk', async () => {
    pickRow(3);
    await search('Skøyen');
    rows()[0].click();
    await settle();
    expect(grid.stops[3].stopId).toBe(null);
    expect(document.getElementById('sp-card').textContent).toContain('Skøyen');
    document.getElementById('sp-use').click();
    expect(grid.stops[3].stopId).toBe('NSR:Quay:55');
    expect(grid.stops[3].name).toBe('Skøyen');
    expect(quayInfo.get('NSR:Quay:55')?.stopPlaceName).toBe('Skøyen');
  });

  it('lists the Quays of a stop place with several, and Enter applies the candidate', async () => {
    pickRow(3);
    await search('Stor');
    rows()[0].click();
    await settle();
    expect(rows().map((r) => r.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('B')]));
    rows()[rows().length - 1].click();
    press('Enter', q());
    expect(grid.stops[3].stopId).toBe('NSR:Quay:62');
  });

  it('gives both rows of a dwell stop the Quay, also when picked on the arrival row', async () => {
    pickRow(1);
    await search('Skøyen');
    rows()[0].click();
    await settle();
    document.getElementById('sp-use').click();
    expect(grid.stops[1].stopId).toBe('NSR:Quay:55');
    expect(grid.stops[2].stopId).toBe('NSR:Quay:55');
  });

  it('ignores an answer that arrives after the user moved to another row', async () => {
    holdSearch = true;
    pickRow(0);
    q().value = 'Skøyen';
    press('Enter', q());
    pickRow(3);
    pending.forEach((r) => r([hit(SKOYEN_PLACE)]));
    await settle();
    expect(rows()).toHaveLength(0);
    expect(grid.stops[0].stopId).toBe('NSR:Quay:7203');
  });

  it('offers to use a pasted Quay ID NSR does not know', async () => {
    pickRow(3);
    await search('NSR:Quay:999');
    expect(rows()[0].textContent).toContain('NSR:Quay:999');
    rows()[0].click();
    expect(grid.stops[3].stopId).toBe('NSR:Quay:999');
    expect(quayInfo.get('NSR:Quay:999')).toBe(null);
  });

  it('removes the stop but keeps the name as a label', () => {
    pickRow(0);
    document.getElementById('sp-clear').click();
    expect(grid.stops[0].stopId).toBe(null);
    expect(grid.stops[0].name).toBe('Jernbanetorget');
  });

  it('has no stop items in the right-click menu any more', () => {
    expect(document.getElementById('gc-stopid')).toBeNull();
    expect(document.getElementById('gc-findstop')).toBeNull();
    expect(document.getElementById('ws-dlg')).toBeNull();
  });

  it('gives the map the current row and candidate', async () => {
    pickRow(3);
    await search('Skøyen');
    rows()[0].click();
    await settle();
    expect(lastModel.row).toBe(3);
    expect(lastModel.candidate?.quayId).toBe('NSR:Quay:55');
  });
});

describe('browsing the map', () => {
  it('asks for the stop places in view once per settled view, from street level, and caches them', async () => {
    vi.useFakeTimers();
    try {
      /** @type {any} */
      let view = { lat: 59.91, lon: 10.75, radiusKm: 0.5, zoom: 16 };
      /** @type {() => void} */
      let changed = () => {};
      /** @type {any[]} */
      const asked = [];
      setPickerServices({ nearby: async (at) => { asked.push(at); return [hit(SKOYEN_PLACE)]; }, getStopPlaces: async () => [] });
      setPickerMap({ show: (m) => { lastModel = m; }, onPick: () => {}, view: () => view, onViewChange: (fn) => { changed = fn; }, zoomTo: () => {} });
      pickRow(3);
      changed(); changed(); changed();            // a fast pan: many move events
      await vi.advanceTimersByTimeAsync(600);
      expect(asked).toHaveLength(1);
      expect(lastModel.browse.map((/** @type {any} */ b) => b.id)).toEqual([SKOYEN_PLACE.id]);
      changed();                                  // the same view again: cached
      await vi.advanceTimersByTimeAsync(600);
      expect(asked).toHaveLength(1);
      view = { ...view, zoom: 13 };               // zoomed out: no browsing
      changed();
      await vi.advanceTimersByTimeAsync(600);
      expect(asked).toHaveLength(1);
      expect(lastModel.browse).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('fetches the Quays of the stop places in view when zoomed in far', async () => {
    vi.useFakeTimers();
    try {
      /** @type {() => void} */
      let changed = () => {};
      /** @type {string[][]} */
      const asked = [];
      setPickerServices({ nearby: async () => [hit(BIG_PLACE)], getStopPlaces: async (ids) => { asked.push(ids); return [BIG_PLACE]; } });
      setPickerMap({ show: (m) => { lastModel = m; }, onPick: () => {}, view: () => ({ lat: 59.93, lon: 10.7, radiusKm: 0.1, zoom: 17 }), onViewChange: (fn) => { changed = fn; }, zoomTo: () => {} });
      pickRow(3);
      changed();
      await vi.advanceTimersByTimeAsync(600);
      expect(asked).toEqual([[BIG_PLACE.id]]);
      expect(lastModel.browseQuays.map((/** @type {any} */ p) => p.id)).toEqual([BIG_PLACE.id]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('stop picking review fixes', () => {
  it('applies the candidate on Enter after a click, wherever the keyboard is (review I1)', async () => {
    pickRow(3);
    await search('Skøyen');
    rows()[0].click();
    await settle();
    q().blur();
    press('Enter');
    expect(grid.stops[3].stopId).toBe('NSR:Quay:55');
  });

  it('gives the keyboard back to the grid when the grid is clicked (review I1)', async () => {
    pickRow(3);
    q().focus();
    expect(document.activeElement).toBe(q());
    pickRow(0);
    expect(document.activeElement).not.toBe(q());
  });

  it('never applies an old candidate after new text is typed (review I2)', async () => {
    pickRow(3);
    await search('Skøyen');
    rows()[0].click();
    await settle();
    q().value = 'Lysaker';
    q().dispatchEvent(new Event('input'));
    press('Enter', q());
    expect(grid.stops[3].stopId).toBe(null);
  });

  it('points unlinked stops at the map pane, not the removed menu item', () => {
    expect(nameCell(3).title).not.toContain('Finn stopp');
    expect(nameCell(3).title).toContain('F6');
  });
});
