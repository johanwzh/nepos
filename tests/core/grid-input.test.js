import { describe, it, expect } from 'vitest';
import { parseCellInput } from '../../src/core/grid-input.js';

describe('parseCellInput (the 1.5.7 grid rules)', () => {
  it('pads three digits and keeps four', () => {
    expect(parseCellInput('745')).toEqual({ time: '0745', dayOffset: 0, suffix: '' });
    expect(parseCellInput('1215')).toEqual({ time: '1215', dayOffset: 0, suffix: '' });
  });

  it('accepts HH:MM from spreadsheets', () => {
    expect(parseCellInput('7:05')).toEqual({ time: '0705', dayOffset: 0, suffix: '' });
    expect(parseCellInput('07:05:00')).toEqual({ time: '0705', dayOffset: 0, suffix: '' });
  });

  it('reads the a / p suffix; an x is never typed and is ignored (booking spec 2026-10-22)', () => {
    expect(parseCellInput('0745x')).toEqual({ time: '0745', dayOffset: 0, suffix: '' });
    expect(parseCellInput('745A')).toEqual({ time: '0745', dayOffset: 0, suffix: 'a' });
    expect(parseCellInput('0605px')).toEqual({ time: '0605', dayOffset: 0, suffix: 'p' });
  });

  it('refuses a and p together (that is a passing stop, |)', () => {
    expect(parseCellInput('0605ap')).toBeNull();
    expect(parseCellInput('0605pa')).toBeNull();
  });

  it('accepts the pass-through pipe', () => {
    expect(parseCellInput('|')).toEqual({ time: '|', dayOffset: 0, suffix: '' });
  });

  it('rejects invalid times so the old value is kept', () => {
    for (const bad of ['', '7', '12345', '3000', '0760', 'abcd', '25:99']) expect(parseCellInput(bad)).toBe(null);
  });
});
