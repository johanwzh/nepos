// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { validityBar } from '../../src/ui/validity-bar.js';

describe('the validity bar in the lists', () => {
  it('draws the valid days of the 365-day window and the NOW line, in the timeline\'s colours', () => {
    const box = document.createElement('div');
    box.innerHTML = validityBar(['20261016', '20261017', '20290101'], '20261016');
    expect(box.querySelectorAll('rect.tl-day.valid')).toHaveLength(2);
    expect(box.querySelector('.vb-now')).not.toBeNull();
    expect(box.querySelector('.vb-after')).not.toBeNull(); // 2029 is past the window
  });

  it('is an empty bar for no days', () => {
    const box = document.createElement('div');
    box.innerHTML = validityBar([], '20261016');
    expect(box.querySelectorAll('rect')).toHaveLength(0);
    expect(box.querySelector('.vb')).not.toBeNull();
  });
});
