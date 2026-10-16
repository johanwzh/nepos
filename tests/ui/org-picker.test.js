// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { loadAppMarkup } from './dom-setup.js';
import { createOrgPicker } from '../../src/ui/org-picker.js';
import { registerCompanies, projectCopy } from '../fixtures/orgs.js';

/** @type {any[]} */ let picked;
/** @param {Partial<Parameters<typeof createOrgPicker>[0]>} [opts] */
const make = (opts = {}) => {
  const el = createOrgPicker({ role: 'operator', currentId: '', currentName: '', projectCompanies: projectCopy(),
    registerCompanies: registerCompanies(), invalid: '', disabled: false, onPick: (c) => picked.push(c), ...opts });
  document.body.appendChild(el);
  return el;
};
const open = (/** @type {HTMLElement} */ el) => /** @type {HTMLElement} */ (el.querySelector('.org-pick-btn')).click();
const rows = (/** @type {HTMLElement} */ _el) => [...document.querySelectorAll('.org-pick-pop .org-pick-row')].map((r) => r.querySelector('b')?.textContent);

beforeEach(() => { loadAppMarkup(); picked = []; });

describe('organisation picker', () => {
  it('shows the placeholder or the current organisation', () => {
    expect(make().textContent).toContain('Velg operatør');
    expect(make({ currentId: 'NOG:Operator:bbbbbbbbbb2', currentName: 'Eksempel Buss AS' }).textContent).toContain('Eksempel Buss AS');
  });

  it('lists only companies with the role, project ones first', () => {
    const el = make();
    open(el);
    expect(rows(el)).toEqual(['Eksempel Buss AS', 'Fjord AS']);
    expect(document.querySelector('.org-pick-pop .org-pick-section')?.textContent).toBe('I prosjektet');
  });

  it('filters as the user types and picks with Enter', () => {
    const el = make();
    open(el);
    const input = /** @type {HTMLInputElement} */ (document.querySelector('.org-pick-pop .org-pick-search'));
    input.value = 'fjord';
    input.dispatchEvent(new Event('input'));
    expect(rows(el)).toEqual(['Fjord AS']);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(picked.map((c) => c.name)).toEqual(['Fjord AS']);
    expect(document.querySelector('.org-pick-pop')).toBe(null);
  });

  it('closes on Escape without picking', () => {
    const el = make();
    open(el);
    document.querySelector('.org-pick-pop .org-pick-search')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.querySelector('.org-pick-pop')).toBe(null);
    expect(picked).toEqual([]);
  });

  it('opens on top of the page, not inside its own box, and goes when the picker goes', () => {
    const el = make();
    open(el);
    const pop = /** @type {HTMLElement} */ (document.querySelector('.org-pick-pop'));
    expect(pop.parentElement).toBe(document.body);
    expect(el.contains(pop)).toBe(false);
    expect(pop.style.position).toBe('fixed');
    el.remove();
    window.dispatchEvent(new Event('resize'));
    expect(document.querySelector('.org-pick-pop')).toBe(null);
  });

  it('a click in the list does not count as outside', () => {
    const el = make();
    open(el);
    document.querySelector('.org-pick-pop .org-pick-search')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(document.querySelector('.org-pick-pop')).not.toBe(null);
  });

  it('marks an organisation that does not validate', () => {
    const el = make({ currentId: 'TST:Operator:1', currentName: 'Old', invalid: 'Finnes ikke' });
    expect(el.classList.contains('invalid')).toBe(true);
    expect(el.title).toBe('Finnes ikke');
  });

  it('does nothing when disabled', () => {
    const el = make({ disabled: true });
    open(el);
    expect(document.querySelector('.org-pick-pop')).toBe(null);
  });
});
