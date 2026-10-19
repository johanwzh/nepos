// @vitest-environment jsdom
// A new project asks for the language and light/dark from the start (user 2026-10-19): a new project's
// settings would otherwise be the defaults, whatever the user had chosen before.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadAppMarkup, flush } from './dom-setup.js';
import { app } from '../../src/ui/state.js';
import { initShell } from '../../src/ui/shell.js';
import { initRouteList } from '../../src/ui/route-list.js';
import { initProjectUi, openNewDialog } from '../../src/ui/project-ui.js';

beforeEach(async () => {
  loadAppMarkup();
  initShell();
  initRouteList();
  await initProjectUi({ restoreLast: false });
  window.confirm = vi.fn(() => true);
  app.settings.lang = 'no';
  app.settings.theme = 'light';
});

const radio = (/** @type {string} */ id) => /** @type {HTMLInputElement} */ (document.getElementById(id));

describe('the new project dialog', () => {
  it('offers the language and light/dark, starting from what is chosen now', async () => {
    await openNewDialog();
    expect(radio('new-lang-no').checked).toBe(true);
    expect(radio('new-theme-light').checked).toBe(true);
    expect(radio('new-theme-dark').checked).toBe(false);
  });

  it('switches the language and the theme at once, so the user sees the choice', async () => {
    await openNewDialog();
    radio('new-lang-en').click();
    await flush();
    expect(app.settings.lang).toBe('en');
    expect(document.querySelector('#new-dlg h2')?.textContent).toBe('New project');
    radio('new-theme-dark').click();
    expect(app.settings.theme).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('goes back to the language and theme it had when the dialog is cancelled', async () => {
    await openNewDialog();
    radio('new-lang-en').click();
    radio('new-theme-dark').click();
    /** @type {HTMLElement} */ (document.getElementById('new-cancel')).click();
    await flush();
    expect(app.settings.lang).toBe('no');
    expect(app.settings.theme).toBe('light');
  });
});
