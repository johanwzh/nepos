// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { initNoAutofill } from '../../src/ui/no-autofill.js';

describe('no browser suggestions in text fields', () => {
  initNoAutofill(document);

  it('turns off the browser\'s own suggestions when a field gets focus, also for fields made later', () => {
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    expect(input.getAttribute('autocomplete')).toBe('off');
  });

  it('leaves a field that sets its own autocomplete alone', () => {
    const input = document.createElement('input');
    input.setAttribute('autocomplete', 'email');
    document.body.append(input);
    input.focus();
    expect(input.getAttribute('autocomplete')).toBe('email');
  });
});
