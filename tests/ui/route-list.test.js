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
    expect(items[0].querySelector('svg.mode-icon')).not.toBe(null);
    expect(items[0].textContent).toContain('X20');
    expect(items[0].textContent).toContain('Oslo - Gol');
    expect(items[1].textContent).toContain('Randsfjordferja');
    expect(items.map((i) => i.textContent).join('')).not.toContain('aaaaaaaa-');
  });
});
