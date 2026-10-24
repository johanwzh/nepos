// Request stop (x) is its own flag beside a/p (booking spec 2026-10-22): #TRC mask bit 8, with bits 0/1.
import { describe, it, expect } from 'vitest';
import { serializeERN } from '../../../src/core/ern/serialize.js';
import { normalizeCell } from '../../../src/core/grid-input.js';
import { miniErn, gridOf, buildLine } from '../../fixtures/mini-line.js';

const OPTS = { delivery: { name: 'T', codespace: 'TST' }, orgs: [] };

describe('request stop as its own flag', () => {
  it('reads mask 256|1 as a with x, and the 1.x bit 3 as x', () => {
    const { grid } = gridOf(miniErn({ masks: [[0, 257, 0], [0, 8, 0]] }));
    expect(grid.cols[0].cells[1]).toMatchObject({ suffix: 'a', req: true });
    expect(grid.cols[1].cells[1]).toMatchObject({ suffix: '', req: true });
    expect(grid.cols[2].cells[1].req).toBeUndefined();
  });

  it('writes p with x as mask 258', () => {
    const { rs, grid } = gridOf(miniErn());
    Object.assign(grid.cols[0].cells[1], { suffix: 'p', req: true });
    expect(serializeERN(rs, 'r', OPTS)).toContain('#TRC;0;0710;0;0;0;0;258');
  });

  it('turns a 2.3 cell with suffix x into a request stop', () => {
    expect(normalizeCell({ time: '0605', dayOffset: 0, suffix: 'x' })).toEqual({ time: '0605', dayOffset: 0, suffix: '', req: true });
  });

  it('writes RequestStop and ForBoarding false on the same stop point', () => {
    const { rs } = gridOf(miniErn({ masks: [[0, 257, 0]] }));
    const { line } = buildLine(rs);
    const sp = line.split('<StopPointInJourneyPattern ').slice(1).find((p) => p.includes('<RequestStop>true</RequestStop>'));
    expect(sp).toBeDefined();
    expect(sp).toContain('<ForBoarding>false</ForBoarding>');
  });
});
