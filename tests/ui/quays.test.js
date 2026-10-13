// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadAppMarkup, flush } from './dom-setup.js';
import { app } from '../../src/ui/state.js';
import { initShell } from '../../src/ui/shell.js';
import { initRouteList } from '../../src/ui/route-list.js';
import { initProjectUi, openFs } from '../../src/ui/project-ui.js';
import { initGrid, grid } from '../../src/ui/grid.js';
import { initFootnoteEditor } from '../../src/ui/footnote-editor.js';
import { initRouteEditor, selectRoute } from '../../src/ui/route-editor.js';
import { setQuayLookup, quayInfo } from '../../src/ui/quays.js';
import { createMemoryFs } from '../../src/project/fs.js';
import { createProject } from '../../src/project/create.js';
import { writeRoute } from '../../src/project/routes.js';

// A bus route whose stops are: a bus Quay, a rail Quay, a Quay NSR does not know, an old 1.x ID
// and a row without an ID.
const ROUTE = [
  '#LEV;Test;TST', '#RUT;-1;50;Jernbanetorget - Ny holdeplass;;1;', '#SEK;-1;;0;0;0;0', '#CUR;neposcoin;1', '#TRA;50',
  '#PER;Vinter;20260101;20260630;;;', '#TAB;0;;;;', '#TUR;0;D;0;0;0;0',
  '#TRL;0;NSR:Quay:7203;Jernbanetorget;34;0;-1;-1;34;-1', '#TRC;0;0700;0;0;0;0;0',
  '#TRL;1;NSR:Quay:563;Oslo S;34;0;-1;-1;34;-1', '#TRC;0;0705;0;0;0;0;0',
  '#TRL;2;NSR:Quay:999999999;Ny holdeplass;34;0;-1;-1;34;-1', '#TRC;0;0710;0;0;0;0;0',
  '#TRL;3;104;Gammel holdeplass;34;0;-1;-1;34;-1', '#TRC;0;0715;0;0;0;0;0',
  '#TRL;4;-1;Uten ID;34;0;-1;-1;34;-1', '#TRC;0;0720;0;0;0;0;0',
].join('\r\n') + '\r\n';

const KNOWN = {
  'NSR:Quay:7203': { quayId: 'NSR:Quay:7203', publicCode: 'A', stopPlaceId: 'NSR:StopPlace:4000', stopPlaceName: 'Jernbanetorget', mode: 'bus', lat: 59.911425, lon: 10.749736 },
  'NSR:Quay:563': { quayId: 'NSR:Quay:563', publicCode: '15', stopPlaceId: 'NSR:StopPlace:337', stopPlaceName: 'Oslo S', mode: 'rail', lat: 59.910123, lon: 10.754734 },
};
const answer = (/** @type {string[]} */ ids) => new Map(ids.map((id) => [id, /** @type {any} */ (KNOWN)[id] ?? null]));
const fakeLookup = async (/** @type {string[]} */ ids) => answer(ids);
/** A lookup that waits until release() is called. */
function deferredLookup() {
  /** @type {{ release: () => void, fn: (ids: string[]) => Promise<any> }} */
  const d = { release: () => {}, fn: async () => new Map() };
  d.fn = (ids) => new Promise((resolve) => { d.release = () => resolve(answer(ids)); });
  return d;
}
const nameCell = (/** @type {number} */ ri) => /** @type {HTMLElement} */ (document.querySelector(`.g-td-name[data-ri="${ri}"]`));
const press = (/** @type {string} */ key) => document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));

let wired = false;

/** @param {(ids: string[]) => Promise<any>} lookup */
async function openProjectWith(lookup) {
  setQuayLookup(lookup);
  const fs = createMemoryFs();
  await createProject(fs, { name: 'Test', codespace: 'TST' });
  await writeRoute(fs, '50', ROUTE);
  await openFs(fs);
  /** @type {any} */ (document.getElementById('check-dlg')).close();
}

beforeEach(async () => {
  loadAppMarkup();
  initShell();
  initRouteList();
  await initProjectUi({ restoreLast: false });
  initGrid(); // wires the context menu of the freshly loaded markup
  if (!wired) { initFootnoteEditor(); wired = true; }
  initRouteEditor();
  window.confirm = vi.fn(() => true);
  window.prompt = vi.fn(() => null);
});

describe('stop marks', () => {
  it('marks each stop by what NSR says', async () => {
    await openProjectWith(fakeLookup);
    await flush();
    await selectRoute('50');
    expect(nameCell(0).title).toContain('Jernbanetorget');
    expect(nameCell(0).className).not.toMatch(/stop-unlinked|stop-broken|n2-quay-notseen/);
    expect(nameCell(1).classList.contains('stop-broken')).toBe(true); // Oslo S is a rail station; the line is a bus
    expect(nameCell(2).classList.contains('n2-quay-notseen')).toBe(true);
    expect(nameCell(3).classList.contains('stop-unlinked')).toBe(true); // old 1.x ID
    expect(nameCell(4).classList.contains('stop-unlinked')).toBe(true); // no ID
  });

  it('never makes a stop look confirmed when NSR cannot be reached', async () => {
    await openProjectWith(async () => { throw new Error('offline'); });
    await flush();
    await selectRoute('50');
    expect(app.routeState).not.toBe(null); // the route opens anyway
    expect(nameCell(0).title).toContain('ikke sjekket');
    expect(nameCell(1).classList.contains('stop-broken')).toBe(false);
    expect(nameCell(2).classList.contains('n2-quay-notseen')).toBe(false);
  });

  it('updates the marks in place when the lookup finishes late', async () => {
    const d = deferredLookup();
    await openProjectWith(d.fn);
    await selectRoute('50');
    const cell = nameCell(1);
    expect(cell.classList.contains('stop-broken')).toBe(false);
    d.release();
    await flush();
    expect(nameCell(1)).toBe(cell);
    expect(cell.classList.contains('stop-broken')).toBe(true);
  });

  it('keeps a stop name being typed when the lookup finishes', async () => {
    const d = deferredLookup();
    await openProjectWith(d.fn);
    await selectRoute('50');
    press('ArrowLeft'); // from the first time into the stop-name column
    press('X');         // starts editing the name
    const input = document.querySelector('.g-stop-input');
    expect(input).not.toBe(null);
    expect(document.activeElement).toBe(input);
    d.release();
    await flush();
    expect(document.querySelector('.g-stop-input')).toBe(input);
    expect(document.activeElement).toBe(input);
  });

  it('ignores a lookup from a project that was closed', async () => {
    const d = deferredLookup();
    await openProjectWith(d.fn); // project 1: lookup still running
    await openProjectWith(async (ids) => new Map(ids.map((id) => [id, null]))); // project 2: NSR knows nothing
    await flush();
    d.release(); // project 1's answer arrives late
    await flush();
    expect(quayInfo.get('NSR:Quay:7203')).toBe(null);
  });
});

describe('typing a stop ID', () => {
  /** @param {number} ri @param {string | null} answer */
  async function setStopId(ri, answer) {
    nameCell(ri).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    window.prompt = vi.fn(() => answer);
    document.getElementById('gc-stopid').click();
    await flush();
  }

  it('sets an NSR Quay ID from the stop menu', async () => {
    await openProjectWith(fakeLookup);
    await flush();
    await selectRoute('50');
    await setStopId(4, 'NSR:Quay:7203');
    expect(grid.stops[4].stopId).toBe('NSR:Quay:7203');
    expect(app.dirty).toBe(true);
    expect(nameCell(4).classList.contains('stop-unlinked')).toBe(false);
  });

  it('refuses something that is not an NSR Quay ID', async () => {
    await openProjectWith(fakeLookup);
    await flush();
    await selectRoute('50');
    await setStopId(4, 'Quay 7203');
    expect(grid.stops[4].stopId).toBe(null);
    expect(app.dirty).toBe(false);
    expect(document.getElementById('msg-text').textContent).toContain('NSR:Quay:12345');
  });

  it('removes the stop ID when the answer is empty', async () => {
    await openProjectWith(fakeLookup);
    await flush();
    await selectRoute('50');
    await setStopId(0, '');
    expect(grid.stops[0].stopId).toBe(null);
  });

  it('fills an empty stop name from NSR', async () => {
    await openProjectWith(fakeLookup);
    await flush();
    await selectRoute('50');
    grid.stops[4].name = '';
    await setStopId(4, 'NSR:Quay:563');
    expect(grid.stops[4].name).toBe('Oslo S');
  });
});
