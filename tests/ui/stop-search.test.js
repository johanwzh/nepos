// @vitest-environment jsdom
// Stop picking 2 (2.5): typing in a stop cell opens a floating search window at the cell; the hits are a tree of stop
// places with their Quays under them, and only a Quay is ever picked. The map pane is never opened by typing.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadAppMarkup, flush } from './dom-setup.js';
import { initShell, setPage, panelOpen } from '../../src/ui/shell.js';
import { initRouteList } from '../../src/ui/route-list.js';
import { initProjectUi, openFs } from '../../src/ui/project-ui.js';
import { initGrid, grid } from '../../src/ui/grid.js';
import { initFootnoteEditor } from '../../src/ui/footnote-editor.js';
import { initRouteEditor, selectRoute } from '../../src/ui/route-editor.js';
import { setQuayLookup } from '../../src/ui/quays.js';
import { initStopPicker, setPickerServices, setPickerMap } from '../../src/ui/stop-picker.js';
import { createMemoryFs } from '../../src/project/fs.js';
import { createProject } from '../../src/project/create.js';
import { writeRoute } from '../../src/project/routes.js';

// Row 0 Jernbanetorget; row 1 without an ID.
const ROUTE = [
  '#LEV;Test;TST', '#RUT;-1;60;Søk;;1;', '#SEK;-1;;0;0;0;0', '#CUR;neposcoin;1', '#TRA;60',
  '#PER;;;;;;', '#TAB;0;;;;', '#TUR;0;D;0;0;0;0',
  '#TRL;0;NSR:Quay:7203;Jernbanetorget;34;0;-1;-1;34;-1', '#TRC;0;0700;0;0;0;0;0',
  '#TRL;1;-1;Uten ID;34;0;-1;-1;34;-1', '#TRC;0;0730;0;0;0;0;0',
].join('\r\n') + '\r\n';

const JBT = { quayId: 'NSR:Quay:7203', publicCode: 'A', stopPlaceId: 'NSR:StopPlace:4000', stopPlaceName: 'Jernbanetorget', mode: 'bus', lat: 59.91, lon: 10.75 };
const STASJON = { id: 'NSR:StopPlace:1', name: 'Grefsen stasjon', description: 'Oslo', mode: 'bus', quays: [
  { quayId: 'NSR:Quay:A', publicCode: 'A', privateCode: '12', description: 'mot sentrum', lat: 59.94, lon: 10.78 },
  { quayId: 'NSR:Quay:B', publicCode: 'B', description: '', lat: 59.94, lon: 10.79 }] };
const STADION = { id: 'NSR:StopPlace:2', name: 'Grefsen stadion', description: 'Oslo', mode: 'bus', quays: [
  { quayId: 'NSR:Quay:S1', publicCode: '1', description: '', lat: 59.95, lon: 10.77 }] };
const RAIL = { id: 'NSR:StopPlace:3', name: 'Grefsen tog', description: '', mode: 'rail', quays: [{ quayId: 'NSR:Quay:R', publicCode: '1', description: '', lat: 59.94, lon: 10.78 }] };
const hit = (/** @type {any} */ p, modes = [p.mode]) => ({ id: p.id, name: p.name, context: 'Oslo', description: '', modes, lat: 59.9, lon: 10.7 });

/** @type {((v: any) => void)[]} */
let pending = [];
let holdSearch = false;
let quaysFail = false;

const settle = async () => { for (let i = 0; i < 8; i++) await flush(); };
const nameCell = (/** @type {number} */ ri) => /** @type {HTMLElement} */ (document.querySelector(`.g-td-name[data-ri="${ri}"]`));
const selectStopCell = (/** @type {number} */ ri) => nameCell(ri).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
const box = () => /** @type {HTMLElement} */ (document.querySelector('.ss-box'));
const input = () => /** @type {HTMLInputElement} */ (box().querySelector('.ss-q'));
const press = (/** @type {string} */ key, target = /** @type {EventTarget} */ (document)) => target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
const key = (/** @type {string} */ k) => press(k, input());
/** Type in a stop cell (the first letter opens the window), then the rest, and search at once with Enter. */
async function typeSearch(/** @type {number} */ ri, /** @type {string} */ text) {
  selectStopCell(ri);
  press(text[0]);
  input().value = text;
  input().dispatchEvent(new Event('input', { bubbles: true }));
  key('Enter');
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
  pending = []; holdSearch = false; quaysFail = false;
  setPickerMap({ show: () => {}, onPick: () => {}, view: () => null, onViewChange: () => {}, zoomTo: () => {} });
  setPickerServices({
    search: async (text) => (holdSearch ? new Promise((r) => pending.push(r)) : text.startsWith('Gref') ? [hit(STASJON), hit(STADION), hit(RAIL, ['rail'])] : []),
    getStopPlaces: async (ids) => { if (quaysFail) throw new Error('NSR down'); return [STASJON, STADION, RAIL].filter((p) => ids.includes(p.id)); },
    getStopPlace: async (id) => [STASJON, STADION, RAIL].find((p) => p.id === id) ?? null,
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

describe('the stop search window (stop picking 2)', () => {
  it('typing in a stop cell opens the window at the cell; the map pane stays as it was', async () => {
    const before = panelOpen('right');
    selectStopCell(1);
    press('G');
    expect(box()).not.toBeNull();
    expect(input().value).toBe('G');
    expect(panelOpen('right')).toBe(before);
    expect(box().textContent).toContain('2'); // "… row 2"
  });

  it('shows the hits as a tree: stop places as headings, their Quays with platform and private code', async () => {
    await typeSearch(1, 'Grefsen');
    expect([...box().querySelectorAll('.ss-place, .ss-quay')].map((e) => e.className.split(' ')[0])).toEqual(['ss-place', 'ss-quay', 'ss-quay', 'ss-place', 'ss-quay']);
    expect(box().querySelector('.ss-quay .g-plat')?.textContent).toBe('A');
    expect(box().querySelector('.ss-quay .g-priv')?.textContent).toBe('12');
    expect(box().textContent).not.toContain('Grefsen tog'); // another mode is never offered
  });

  it('arrows move over Quays only; Enter puts the Quay on the row, closes the window and flashes the cell', async () => {
    await typeSearch(1, 'Grefsen');
    key('ArrowDown'); key('ArrowDown'); key('Enter');
    expect(grid.stops[1].stopId).toBe('NSR:Quay:B');
    expect(grid.stops[1].name).toBe('Grefsen stasjon');
    expect(box()).toBeNull();
    expect(nameCell(1).classList.contains('g-flash-pick')).toBe(true);
  });

  it('a click on a Quay picks it too', async () => {
    await typeSearch(1, 'Grefsen');
    /** @type {HTMLElement} */ (box().querySelectorAll('.ss-quay')[2]).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    expect(grid.stops[1].stopId).toBe('NSR:Quay:S1');
  });

  it('Esc closes without picking', async () => {
    await typeSearch(1, 'Grefsen');
    key('ArrowDown');
    key('Escape');
    expect(box()).toBeNull();
    expect(grid.stops[1].stopId).toBeNull();
  });

  it('a click on the map closes the window', async () => {
    await typeSearch(1, 'Grefsen');
    /** @type {HTMLElement} */ (document.getElementById('map-gl')).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    expect(box()).toBeNull();
  });

  it('an answer after the window closed is ignored', async () => {
    holdSearch = true;
    await typeSearch(1, 'Grefsen');
    key('Escape');
    pending.forEach((r) => r([hit(STASJON)]));
    await settle();
    expect(box()).toBeNull();
    expect(document.querySelector('.ss-place')).toBeNull();
  });

  it('if the Quays lookup fails, the stop places show with no platforms and nothing breaks', async () => {
    quaysFail = true;
    await typeSearch(1, 'Grefsen');
    expect(box().querySelectorAll('.ss-place')).toHaveLength(2);
    expect(box().querySelectorAll('.ss-quay')).toHaveLength(0);
    expect(box().querySelector('.ss-none')).not.toBeNull();
    key('ArrowDown'); key('Enter');
    expect(grid.stops[1].stopId).toBeNull();
  });

  it('a pasted Quay ID and a stop place ID still work', async () => {
    await typeSearch(1, 'NSR:Quay:7203');
    key('ArrowDown'); key('Enter');
    expect(grid.stops[1].stopId).toBe('NSR:Quay:7203');
    await typeSearch(1, 'NSR:StopPlace:2');
    expect([...box().querySelectorAll('.ss-quay')].map((e) => /** @type {HTMLElement} */ (e).dataset.quay)).toEqual(['NSR:Quay:S1']);
  });
});
