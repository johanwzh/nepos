// @vitest-environment jsdom
// 2.6 (user 2026-11-01): Knutepunkt stays out of the production release until Antu handles interchanges (VisitNumber,
// other codespaces). A dev build keeps it, so it can still be tested.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { loadAppMarkup } from './dom-setup.js';

const press = (key, opts = {}) => document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts }));

/** The UI modules as a production build has them. */
async function prod() {
  vi.stubEnv('DEV', false);
  vi.resetModules();
  loadAppMarkup();
  const shell = await import('../../src/ui/shell.js');
  const tools = await import('../../src/ui/power-tools.js');
  const help = await import('../../src/ui/help.js');
  shell.initShell();
  tools.initPowerTools();
  return { tools, help };
}

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe('Knutepunkt in a production build (2.6)', () => {
  it('its button is disabled, and Alt+K does nothing', async () => {
    const { tools } = await prod();
    const btn = /** @type {HTMLButtonElement} */ (document.querySelector('#power-tools .pt-tool[data-tool="hub"]'));
    expect(btn.disabled).toBe(true);
    press('k', { altKey: true });
    expect(tools.activeTool()).toBe('');
    tools.setTool('hub');
    expect(tools.activeTool()).toBe('');
  });

  it('the keyboard shortcuts leave Alt+K out', async () => {
    const { help } = await prod();
    help.showShortcuts();
    const keys = [...document.querySelectorAll('#help-body kbd')].map((k) => k.textContent);
    expect(keys).toContain('Alt+L');
    expect(keys).not.toContain('Alt+K');
  });
});
