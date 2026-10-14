// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { deriveTheme, saveColourTheme, applyColourTheme } from '../../src/ui/theme.js';

describe('colour themes', () => {
  beforeEach(() => { localStorage.clear(); document.documentElement.removeAttribute('style'); document.documentElement.setAttribute('data-theme', 'light'); });

  it('derives the interface shades from one colour', () => {
    const t = deriveTheme('#c8102e', null, 'light');
    expect(t['--accent']).toBe('#c8102e');
    expect(t['--accent-text']).toBe('#ffffff');
    expect(t['--accent-hov']).not.toBe('#c8102e');
    expect(t['--accent-bg']).toMatch(/^#[0-9a-f]{6}$/);
    expect(t['--accent-2']).toBeUndefined();
    expect(deriveTheme('#ffe600', null, 'light')['--accent-text']).toBe('#000000');
  });

  it('uses the second colour when given', () => {
    expect(deriveTheme('#181c56', '#ff5959', 'dark')['--accent-2']).toBe('#ff5959');
  });

  it('applies and resets the stored theme on the page', () => {
    saveColourTheme({ main: '#181c56', second: null });
    applyColourTheme();
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#181c56');
    saveColourTheme(null);
    applyColourTheme();
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('');
  });
});

describe('custom theme dialog', () => {
  it('saves the picked colours and applies them', async () => {
    localStorage.clear();
    document.body.innerHTML = `<dialog id="theme-dlg"><input type="color" id="theme-main"><input type="checkbox" id="theme-second-on">
      <input type="color" id="theme-second"><button id="theme-reset"></button><button id="theme-cancel"></button><button id="theme-ok"></button></dialog>`;
    const dlg = /** @type {any} */ (document.getElementById('theme-dlg'));
    dlg.showModal = () => dlg.setAttribute('open', '');
    dlg.close = () => dlg.removeAttribute('open');
    const { openThemeDialog, loadColourTheme } = await import('../../src/ui/theme.js');
    openThemeDialog();
    /** @type {HTMLInputElement} */ (document.getElementById('theme-main')).value = '#c8102e';
    document.getElementById('theme-ok')?.click();
    expect(loadColourTheme()).toEqual({ main: '#c8102e', second: null });
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#c8102e');
    openThemeDialog();
    document.getElementById('theme-reset')?.click();
    expect(loadColourTheme()).toBeNull();
  });
});
