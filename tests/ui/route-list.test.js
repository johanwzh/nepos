// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { loadAppMarkup } from './dom-setup.js';
import { app } from '../../src/ui/state.js';
import { initShell, refreshAll } from '../../src/ui/shell.js';
import { initRouteList } from '../../src/ui/route-list.js';

const text = (/** @type {string} */ rut, extra = '') => `#LEV;T;TST\r\n${rut}\r\n${extra}#TRA;\r\n`;
beforeEach(() => {
  loadAppMarkup();
  initShell();
  initRouteList();
  Object.assign(app, { meta: { formatVersion: 1, name: 'T', codespace: 'TST' }, activeRoute: null,
    brandings: [{ id: 'TST:Branding:b', name: 'Randsfjordferja', shortName: '', description: '', url: '', imageUrl: '' }],
    routes: [
      { code: 'aaaaaaaa-0000-4000-8000-000000000001', text: text('#RUT;-1;X20;Oslo - Gol;;13;', '#MOD;bus;expressBus\r\n'), status: 'ok', issues: [] },
      { code: 'aaaaaaaa-0000-4000-8000-000000000002', text: text('#RUT;-1;;Ferjerute;;7;', '#MOD;water;localCarFerry\r\n#BRA;TST:Branding:b\r\n'), status: 'ok', issues: [] },
    ] });
  refreshAll();
});

describe('route list', () => {
  it('shows the mode icon, the public code or branding, and the name — not the UUID', () => {
    const items = [...document.querySelectorAll('.route-item')];
    const gol = /** @type {Element} */ (items.find((i) => i.textContent?.includes('Oslo - Gol')));
    const ferje = /** @type {Element} */ (items.find((i) => i.textContent?.includes('Ferjerute')));
    expect(gol.querySelector('svg.mode-icon')).not.toBe(null);
    expect(gol.textContent).toContain('X20');
    expect(gol.textContent).toContain('Oslo - Gol');
    expect(ferje.textContent).toContain('Randsfjordferja');
    expect(items.map((i) => i.textContent).join('')).not.toContain('aaaaaaaa-');
  });
});

describe('route list filter and order', () => {
  it('does not match the UUID, and sorts by public code then name by default', () => {
    /** @type {HTMLInputElement} */ (document.getElementById('route-filter-input')).value = '0000';
    document.getElementById('route-filter-input')?.dispatchEvent(new Event('input'));
    expect(document.querySelectorAll('.route-item')).toHaveLength(0);
    /** @type {HTMLInputElement} */ (document.getElementById('route-filter-input')).value = '';
    app.routes = [...app.routes].reverse();
    refreshAll();
    const names = [...document.querySelectorAll('.rl-name')].map((e) => e.textContent);
    expect(names).toEqual(['Ferjerute', 'Oslo - Gol']); // no public code sorts first, then X20
  });
});
