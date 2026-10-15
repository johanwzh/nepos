// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadAppMarkup } from './dom-setup.js';
import { app } from '../../src/ui/state.js';
import { initShell, refreshAll, setPage } from '../../src/ui/shell.js';
import { initRouteList } from '../../src/ui/route-list.js';
import { lineRows, sortLines } from '../../src/ui/line-rows.js';

const text = (/** @type {string} */ rut, extra = '') => `#LEV;T;TST\r\n${rut}\r\n${extra}#TRA;\r\n`;
const G = 'aaaaaaaa-0000-4000-8000-000000000001', F = 'aaaaaaaa-0000-4000-8000-000000000002';
beforeEach(() => {
  localStorage.clear();
  loadAppMarkup();
  initShell();
  setPage('edit');
  initRouteList();
  Object.assign(app, { meta: { formatVersion: 1, name: 'T', codespace: 'TST' }, activeRoute: null, routeState: null, drafts: new Map(),
    brandings: [{ id: 'TST:Branding:b', name: 'Randsfjordferja', shortName: '', description: '', url: '', imageUrl: '' }],
    calendars: [{ id: 'cal-1', name: 'V', ranges: [['20200101', '20200301'], ['20200601', '20200630']] }],
    routes: [
      { code: G, text: text('#RUT;-1;X20;Oslo - Gol;;13;', '#MOD;bus;expressBus\r\n'), status: 'ok', issues: [] },
      { code: F, text: text('#RUT;-1;;Ferjerute;;7;', '#MOD;water;localCarFerry\r\n#BRA;TST:Branding:b\r\n'), status: 'ok', issues: [] },
    ] });
  refreshAll();
});

const items = () => /** @type {HTMLElement[]} */ ([...document.querySelectorAll('.route-item')]);

describe('lines pane, mini view', () => {
  it('shows the mode icon and the public code or branding; the name only on hover; never the UUID', () => {
    const gol = /** @type {HTMLElement} */ (items().find((i) => i.title.includes('Oslo - Gol')));
    const ferje = /** @type {HTMLElement} */ (items().find((i) => i.title.includes('Ferjerute')));
    expect(gol.querySelector('svg.mode-icon')).not.toBe(null);
    expect(gol.textContent).toContain('X20');
    expect(gol.textContent).not.toContain('Oslo - Gol');
    expect(ferje.textContent).toContain('Randsfjordferja');
    expect(items().map((i) => i.textContent + i.title).join('')).not.toContain('aaaaaaaa-');
  });

  it('shows the number of problems, marked when there are errors', () => {
    const mark = /** @type {HTMLElement} */ (items()[0].querySelector('.rl-warn'));
    expect(mark.textContent).toMatch(/⚠ \d+/);
    expect(mark.classList.contains('has-errors')).toBe(true);
  });

  it('follows the stored sort order', () => {
    expect(items().map((i) => i.title.split(' · ')[0])).toEqual(['Ferjerute', 'Oslo - Gol']); // by code: none first
    localStorage.setItem('nepos.lineSort', JSON.stringify({ col: 'name', dir: -1 }));
    refreshAll();
    expect(items().map((i) => i.title.split(' · ')[0])).toEqual(['Oslo - Gol', 'Ferjerute']);
  });

  it('sits to the right of the timetable, the map to the left', () => {
    const el = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
    const before = (/** @type {string} */ a, /** @type {string} */ b) => !!(el(a).compareDocumentPosition(el(b)) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(before('panel-right', 'edit-main')).toBe(true); // the map
    expect(before('edit-main', 'panel-left')).toBe(true);  // the lines
  });
});

describe('line rows', () => {
  it('gives the valid period from the line calendars and sorts by any column', () => {
    app.routes[0].text = app.routes[0].text.replace('#TRA;\r\n', '#TRA;A\r\n#PER;;;;;;\r\n#KAL;cal-1\r\n');
    const rows = lineRows();
    const gol = /** @type {any} */ (rows.find((r) => r.code === G));
    expect([gol.firstDay, gol.lastDay]).toEqual(['20200101', '20200630']);
    expect(gol.expired).toBe(true);
    expect(sortLines(rows, { col: 'valid', dir: -1 })[0].code).toBe(G);
  });
});
