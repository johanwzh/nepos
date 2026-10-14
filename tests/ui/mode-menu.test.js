// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { loadAppMarkup } from './dom-setup.js';
import { openModeMenu } from '../../src/ui/mode-menu.js';

/** @type {any[]} */ let picked;
/** @type {HTMLElement} */ let anchor;
beforeEach(() => {
  loadAppMarkup();
  picked = [];
  anchor = document.createElement('button');
  document.body.appendChild(anchor);
  openModeMenu(anchor, { mode: '', submode: '', lang: 'no', onPick: (m, s) => picked.push([m, s]) });
});
const menu = () => document.querySelector('.mode-menu');

describe('mode menu', () => {
  it('lists the modes and shows a mode\'s submodes, "Ikke spesifisert" first', () => {
    expect(menu()?.querySelectorAll('.mode-item')).toHaveLength(15);
    /** @type {HTMLElement} */ (menu()?.querySelector('.mode-item[data-mode="bus"]')).click();
    const subs = [...(menu()?.querySelectorAll('.mode-sub') ?? [])].map((e) => /** @type {HTMLElement} */ (e).dataset.sub);
    expect(subs[0]).toBe('');
    expect(subs).toContain('expressBus');
    expect(menu()?.textContent).toContain('Ekspressbuss');
  });

  it('picks a mode and submode and closes', () => {
    /** @type {HTMLElement} */ (menu()?.querySelector('.mode-item[data-mode="bus"]')).click();
    /** @type {HTMLElement} */ (menu()?.querySelector('.mode-sub[data-sub="expressBus"]')).click();
    expect(picked).toEqual([['bus', 'expressBus']]);
    expect(menu()).toBe(null);
  });

  it('closes on Escape without picking', () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(menu()).toBe(null);
    expect(picked).toEqual([]);
  });
});
