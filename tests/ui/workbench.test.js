// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { loadAppMarkup, flush } from './dom-setup.js';
import { app } from '../../src/ui/state.js';
import { initShell, currentPage } from '../../src/ui/shell.js';
import { initWorkbench, openWorkbench, setWorkbenchServices, setWorkbenchMap } from '../../src/ui/workbench.js';
import { grid, initGrid, loadGrid } from '../../src/ui/grid.js';
import { initFootnoteEditor } from '../../src/ui/footnote-editor.js';
import { newRouteState } from '../../src/ui/route-state.js';
import { quayInfo } from '../../src/ui/quays.js';

const hit = (/** @type {string} */ id, /** @type {string} */ mode, description = '') => ({ id, name: 'Jernbanetorget', context: 'Oslo, Oslo', description, modes: [mode], lat: 59.91, lon: 10.75 });
const HITS = [hit('NSR:StopPlace:3990', 'metro'), hit('NSR:StopPlace:4000', 'bus', 'foran Oslo S'), hit('NSR:StopPlace:3986', 'tram')];
const PLACE = {
  id: 'NSR:StopPlace:4000', name: 'Jernbanetorget', description: 'foran Oslo S', mode: 'bus',
  quays: [
    { quayId: 'NSR:Quay:7203', publicCode: 'A', description: '', lat: 59.911425, lon: 10.749736 },
    { quayId: 'NSR:Quay:7202', publicCode: 'D', description: '', lat: 59.9115, lon: 10.7499 },
  ],
};

/** @type {{ points: any[], onClick: (id: string) => void }} */
let shown = { points: [], onClick: () => {} };
/** @type {string[]} */
let searches = [];

const list = () => document.getElementById('ws-list').textContent;
const rows = () => /** @type {HTMLElement[]} */ ([...document.querySelectorAll('#ws-list .n2-ws-row')]);
const settle = async () => { for (let i = 0; i < 5; i++) await flush(); };
async function type(/** @type {string} */ text) {
  const q = /** @type {HTMLInputElement} */ (document.getElementById('ws-q'));
  q.value = text;
  q.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await settle();
}

let wired = false;
beforeEach(() => {
  loadAppMarkup();
  initShell();
  initWorkbench();
  if (!wired) wired = true;
  searches = [];
  setWorkbenchMap(() => ({ show: (points, onClick) => { shown = { points, onClick }; } }));
  setWorkbenchServices({
    search: async (text) => { searches.push(text); return HITS; },
    getStopPlace: async (id) => (id === PLACE.id ? PLACE : null),
    lookupQuays: async (ids) => new Map(ids.map((id) => [id, null])),
  });
});

describe('search window', () => {
  it('searches for the stop name it opens with, and shows only the line\'s mode', async () => {
    const pick = openWorkbench({ query: 'Jernbanetorget', ernMode: 1 });
    await settle();
    expect(searches).toEqual(['Jernbanetorget']);
    expect(rows()).toHaveLength(1);
    expect(list()).toContain('foran Oslo S');
    expect(document.getElementById('ws-status').textContent).toContain('2');
    expect(shown.points).toHaveLength(1);
    document.getElementById('ws-close').click();
    expect(await pick).toBe(null);
  });

  it('shows all modes when asked', async () => {
    const pick = openWorkbench({ query: 'Jernbanetorget', ernMode: 1 });
    await settle();
    const all = /** @type {HTMLInputElement} */ (document.getElementById('ws-only-mode'));
    all.checked = false;
    all.dispatchEvent(new Event('change'));
    expect(rows()).toHaveLength(3);
    document.getElementById('ws-close').click();
    await pick;
  });

  it('opens a stop place and picks a Quay from the list', async () => {
    const pick = openWorkbench({ query: 'Jernbanetorget', ernMode: 1 });
    await settle();
    rows()[0].click();
    await settle();
    expect(rows().map((r) => r.textContent)).toEqual([expect.stringContaining('A'), expect.stringContaining('D')]);
    expect(shown.points.map((p) => p.id)).toEqual(['NSR:Quay:7203', 'NSR:Quay:7202']);
    rows()[1].click();
    expect(await pick).toEqual({
      quayId: 'NSR:Quay:7202', name: 'Jernbanetorget',
      info: { quayId: 'NSR:Quay:7202', publicCode: 'D', stopPlaceId: 'NSR:StopPlace:4000', stopPlaceName: 'Jernbanetorget', mode: 'bus', lat: 59.9115, lon: 10.7499 },
    });
    expect(/** @type {HTMLDialogElement} */ (document.getElementById('ws-dlg')).open).toBe(false);
  });

  it('picks a Quay on the map', async () => {
    const pick = openWorkbench({ query: 'Jernbanetorget', ernMode: 1 });
    await settle();
    shown.onClick('NSR:StopPlace:4000'); // a stop place marker opens it
    await settle();
    shown.onClick('NSR:Quay:7203');      // a Quay marker picks it
    expect((await pick)?.quayId).toBe('NSR:Quay:7203');
  });

  it('goes back from a stop place to the results', async () => {
    const pick = openWorkbench({ query: 'Jernbanetorget', ernMode: 1 });
    await settle();
    rows()[0].click();
    await settle();
    document.querySelector('#ws-list .n2-ws-back')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(list()).toContain('foran Oslo S');
    document.getElementById('ws-close').click();
    await pick;
  });

  it('accepts a typed Quay ID that NSR does not know', async () => {
    const pick = openWorkbench({ ernMode: 1 });
    await type('NSR:Quay:999999999');
    expect(searches).toEqual([]);
    expect(list()).toContain('NSR:Quay:999999999');
    rows()[0].click();
    expect(await pick).toEqual({ quayId: 'NSR:Quay:999999999', name: '', info: null });
  });

  it('opens a typed StopPlace ID directly', async () => {
    const pick = openWorkbench({ ernMode: 1 });
    await type('NSR:StopPlace:4000');
    expect(rows()).toHaveLength(2);
    document.getElementById('ws-close').click();
    await pick;
  });

  it('never lets a slow old search replace a newer one', async () => {
    /** @type {((v: any) => void)[]} */
    const pending = [];
    setWorkbenchServices({ search: (text) => new Promise((resolve) => { searches.push(text); pending.push(resolve); }) });
    const pick = openWorkbench({ ernMode: 1 });
    await type('old');
    await type('new');
    pending[1]([hit('NSR:StopPlace:2', 'bus', 'ny')]);
    await settle();
    pending[0]([hit('NSR:StopPlace:1', 'bus', 'gammel')]);
    await settle();
    expect(list()).toContain('ny');
    expect(list()).not.toContain('gammel');
    document.getElementById('ws-close').click();
    await pick;
  });

  it('says so when the search fails, and closing with Escape picks nothing', async () => {
    setWorkbenchServices({ search: async () => { throw new Error('offline'); } });
    const pick = openWorkbench({ query: 'x', ernMode: 1 });
    await settle();
    expect(document.getElementById('ws-status').textContent).toContain('offline');
    // Escape in a browser: 'cancel', the dialog closes, then 'close' fires.
    const dlg = /** @type {HTMLDialogElement} */ (document.getElementById('ws-dlg'));
    dlg.dispatchEvent(new Event('cancel'));
    dlg.close();
    dlg.dispatchEvent(new Event('close'));
    expect(await pick).toBe(null);
  });
});

describe('picking a stop from the grid', () => {
  const stop = (/** @type {string} */ name, /** @type {string | null} */ stopId, extra = {}) => ({ name, stopId, bold: false, sep: false, isDwellArr: false, price: null, ...extra });
  const cell = (/** @type {string} */ time) => ({ time, dayOffset: 0, suffix: '', interchange: null, footnoteId: null });
  let footnotes = false;

  beforeEach(() => {
    initGrid();
    if (!footnotes) { initFootnoteEditor(); footnotes = true; }
    app.routeState = { ...newRouteState('no'), mode: 'bus', submode: 'localBus', transportMode: 1 }; // a bus line (new routes have no mode)
    quayInfo.clear();
    loadGrid({
      stops: [stop('Sentrum', null), stop('Torget', 'NSR:Quay:1', { isDwellArr: true }), stop('Torget', 'NSR:Quay:1')],
      cols: [{ dayCode: 'D', footnote: '', footnoteId: null, cells: [cell('0700'), cell('0710'), cell('0715')] }],
    });
  });

  /** @param {number} ri */
  async function findStop(ri) {
    document.querySelector(`.g-td-name[data-ri="${ri}"]`)?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    document.getElementById('gc-findstop').click();
    await settle();
  }

  it('searches for the row\'s name and writes the picked Quay into the row', async () => {
    await findStop(0);
    expect(searches).toEqual(['Sentrum']);
    rows()[0].click();
    await settle();
    rows()[1].click();
    await settle();
    expect(grid.stops[0]).toMatchObject({ stopId: 'NSR:Quay:7202', name: 'Jernbanetorget' });
    expect(quayInfo.get('NSR:Quay:7202')?.publicCode).toBe('D');
    expect(document.querySelector('.g-td-name[data-ri="0"]')?.classList.contains('stop-unlinked')).toBe(false);
  });

  it('sets both rows of a dwell stop', async () => {
    await findStop(2);
    rows()[0].click();
    await settle();
    rows()[0].click();
    await settle();
    expect(grid.stops[1]).toMatchObject({ stopId: 'NSR:Quay:7203', name: 'Jernbanetorget', isDwellArr: true });
    expect(grid.stops[2]).toMatchObject({ stopId: 'NSR:Quay:7203', name: 'Jernbanetorget' });
  });

  it('changes nothing when the window is closed', async () => {
    await findStop(0);
    document.getElementById('ws-close').click();
    await settle();
    expect(grid.stops[0]).toMatchObject({ stopId: null, name: 'Sentrum' });
  });

  it('keeps the row\'s name for a typed Quay ID NSR does not know, and marks it', async () => {
    await findStop(0);
    await type('NSR:Quay:999999999');
    rows()[0].click();
    await settle();
    expect(grid.stops[0]).toMatchObject({ stopId: 'NSR:Quay:999999999', name: 'Sentrum' });
    expect(document.querySelector('.g-td-name[data-ri="0"]')?.classList.contains('n2-quay-notseen')).toBe(true);
  });

  it('starts the search from the departure row when the arrival row of a dwell stop is chosen', async () => {
    await findStop(1);
    expect(/** @type {HTMLDialogElement} */ (document.getElementById('ws-dlg')).open).toBe(true);
    rows()[0].click();
    await settle();
    rows()[0].click();
    await settle();
    expect(grid.stops[1].stopId).toBe('NSR:Quay:7203');
    expect(grid.stops[2].stopId).toBe('NSR:Quay:7203');
  });

  it('never marks a pasted Quay "not in NSR yet" when NSR has not answered', async () => {
    setWorkbenchServices({ lookupQuays: () => new Promise(() => {}) }); // NSR never answers
    await findStop(0);
    await type('NSR:Quay:7203');
    rows()[0].click();
    await settle();
    expect(grid.stops[0].stopId).toBe('NSR:Quay:7203');
    const cell = document.querySelector('.g-td-name[data-ri="0"]');
    expect(cell?.classList.contains('n2-quay-notseen')).toBe(false);
    expect(cell?.classList.contains('n2-quay-unknown')).toBe(true);
  });

  it('never marks a pasted Quay "not in NSR yet" when NSR could not be reached', async () => {
    setWorkbenchServices({ lookupQuays: async () => { throw new Error('offline'); } });
    await findStop(0);
    await type('NSR:Quay:7203');
    rows()[0].click();
    await settle();
    expect(document.querySelector('.g-td-name[data-ri="0"]')?.classList.contains('n2-quay-notseen')).toBe(false);
  });

  it('picks a pasted Quay ID with a second Enter', async () => {
    await findStop(0);
    await type('NSR:Quay:999999999');
    await type('NSR:Quay:999999999');
    expect(grid.stops[0].stopId).toBe('NSR:Quay:999999999');
  });

  it('keeps F-keys from switching page behind the window', async () => {
    await findStop(0);
    document.getElementById('ws-list')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'F4', bubbles: true }));
    expect(currentPage()).toBe('edit');
    document.getElementById('ws-close').click();
  });
});
