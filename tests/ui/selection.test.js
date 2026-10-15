import { describe, it, expect } from 'vitest';
import { pick } from '../../src/ui/selection.js';

const shown = ['a', 'b', 'c', 'd'];
describe('selecting rows in the lists', () => {
  it('click selects one; Ctrl-click toggles; Shift-click selects the range from the last click', () => {
    let s = pick({ selected: new Set(), anchor: null }, shown, 'b', {});
    expect([...s.selected]).toEqual(['b']);
    s = pick(s, shown, 'd', { shift: true });
    expect([...s.selected]).toEqual(['b', 'c', 'd']);
    s = pick(s, shown, 'c', { ctrl: true });
    expect([...s.selected].sort()).toEqual(['b', 'd']);
    s = pick(s, shown, 'a', { toggle: true }); // the checkbox
    expect([...s.selected].sort()).toEqual(['a', 'b', 'd']);
  });
});
