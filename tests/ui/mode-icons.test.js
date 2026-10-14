import { describe, it, expect } from 'vitest';
import { modeIconSvg } from '../../src/ui/mode-icons.js';
import { TRANSMODEL_MODES } from '../../src/core/modes.js';

describe('mode icons', () => {
  it('has an icon for every mode, coloured by the theme', () => {
    for (const { mode } of TRANSMODEL_MODES) {
      const svg = modeIconSvg(mode);
      expect(svg.startsWith('<svg class="mode-icon"'), mode).toBe(true);
      expect(svg, mode).not.toMatch(/#[0-9a-f]{6}/i);
    }
  });

  it('uses the car ferry and helicopter icons for those submodes, and a neutral one for no mode', () => {
    expect(modeIconSvg('water', 'localCarFerry')).not.toBe(modeIconSvg('water', 'localPassengerFerry'));
    expect(modeIconSvg('air', 'helicopterService')).not.toBe(modeIconSvg('air', 'domesticFlight'));
    expect(modeIconSvg('')).toContain('<circle');
  });
});
