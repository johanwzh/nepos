import { describe, it, expect } from 'vitest';
import { timelineModel, TIMELINE_DAYS } from '../../src/core/timeline.js';

const TODAY = '20261016';

describe('validity timeline', () => {
  it('spans 365 days with the first tenth in the past and NOW after it', () => {
    const m = timelineModel({ periodDays: [], colDays: null, today: TODAY });
    expect(TIMELINE_DAYS).toBe(365);
    expect(m.days).toHaveLength(365);
    expect(m.nowIndex).toBe(36);
    expect(m.days[36].date).toBe(TODAY);
    expect(m.days[0].date).toBe('20260910');
    expect(m.days.every((d) => d.state === 'none')).toBe(true); // nothing valid: a blank line
    expect([m.before, m.after]).toEqual([false, false]);
  });

  it('marks the period\'s valid days, and hints at days outside the window', () => {
    const m = timelineModel({ periodDays: ['20250101', '20261016', '20261017', '20290101'], colDays: null, today: TODAY });
    expect(m.days.filter((d) => d.state === 'valid').map((d) => d.date)).toEqual(['20261016', '20261017']);
    expect([m.before, m.after]).toEqual([true, true]);
  });

  it('with a column selected: what the column keeps, and what its day code takes away', () => {
    const m = timelineModel({ periodDays: ['20261016', '20261017', '20261018'], colDays: ['20261016'], today: TODAY });
    expect(m.days.filter((d) => d.state !== 'none').map((d) => `${d.date}:${d.state}`)).toEqual([
      '20261016:column', '20261017:removed', '20261018:removed']);
  });

  it('gives the months that start inside the window, for the labels', () => {
    const m = timelineModel({ periodDays: [], colDays: null, today: TODAY });
    expect(m.months[0]).toEqual({ index: 21, label: '2026-10' });
    expect(m.months).toHaveLength(12);
  });
});
