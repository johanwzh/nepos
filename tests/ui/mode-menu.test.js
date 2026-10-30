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
    expect(menu()?.querySelectorAll('.mode-item')).toHaveLength(11); // the Nordic profile; never "other": it cannot be exported
    expect(menu()?.querySelector('.mode-item[data-mode="other"]')).toBeNull();
    /** @type {HTMLElement} */ (menu()?.querySelector('.mode-item[data-mode="bus"]')).click();
    const subs = [...(menu()?.querySelectorAll('.mode-sub') ?? [])].map((e) => /** @type {HTMLElement} */ (e).dataset.sub);
    expect(subs[0]).toBe('');
    expect(subs).toContain('expressBus');
    expect(menu()?.textContent).toContain('Ekspressbuss');
  });

  it('offers only the Nordic profile (user 2026-10-30): no lift, no miniBus', () => {
    const modes = [...(menu()?.querySelectorAll('.mode-item') ?? [])].map((e) => /** @type {HTMLElement} */ (e).dataset.mode);
    expect(modes).toEqual(['bus', 'coach', 'rail', 'tram', 'metro', 'water', 'air', 'taxi', 'cableway', 'funicular', 'snowAndIce']);
    /** @type {HTMLElement} */ (menu()?.querySelector('.mode-item[data-mode="bus"]')).click();
    const subs = [...(menu()?.querySelectorAll('.mode-sub') ?? [])].map((e) => /** @type {HTMLElement} */ (e).dataset.sub);
    expect(subs).toEqual(['', 'localBus', 'regionalBus', 'expressBus', 'nightBus', 'shuttleBus', 'airportLinkBus', 'railReplacementBus', 'schoolBus', 'sightseeingBus']);
  });

  it('a line set to a mode outside the profile still shows it, as the current one', () => {
    openModeMenu(anchor, { mode: 'lift', submode: '', lang: 'no', onPick: () => {} });
    expect(menu()?.querySelector('.mode-item[data-mode="lift"]')).not.toBeNull();
    expect(menu()?.querySelector('.mode-sub.current')).not.toBeNull();
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
