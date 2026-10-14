// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { loadAppMarkup } from './dom-setup.js';
import { initShell } from '../../src/ui/shell.js';

describe('browser autofill', () => {
  it('is switched off for every text field, also ones created later', async () => {
    loadAppMarkup();
    initShell();
    const late = document.createElement('input');
    late.placeholder = 'Name, e.g. Winter 26/27';
    document.body.appendChild(late);
    await new Promise((r) => setTimeout(r, 0));
    const fields = [...document.querySelectorAll('input:not([type]), input[type=text], input[type=search]')];
    expect(fields.length).toBeGreaterThan(3);
    for (const f of fields) expect(f.getAttribute('autocomplete')).toBe('nepos-no-autofill');
  });
});
