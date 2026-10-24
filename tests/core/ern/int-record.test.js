// #INT (power tools spec 2026-10-24): a block on its parent column — #INT;X;interval minutes;last departure in minutes
// after the parent's first departure. Only the parent is a trip in the file.
import { describe, it, expect } from 'vitest';
import { serializeERN } from '../../../src/core/ern/serialize.js';
import { checkRouteFile } from '../../../src/core/integrity/check.js';
import { miniErn, gridOf } from '../../fixtures/mini-line.js';

const OPTS = { delivery: { name: 'T', codespace: 'TST' }, orgs: [] };

describe('#INT', () => {
  it('reads #INT onto its column', () => {
    const { grid } = gridOf(miniErn({ extra: ['#INT;1;30;990'] }));
    expect(grid.cols[1].block).toEqual({ every: 30, span: 990 });
    expect(grid.cols[0].block).toBeUndefined();
  });

  it('writes it right after the column\'s #TUR and #UID, and the same text twice', () => {
    const { rs, grid } = gridOf(miniErn());
    grid.cols[1].block = { every: 30, span: 990 };
    const text = serializeERN(rs, 'r', OPTS);
    expect(text).toMatch(/#TUR;1;D;0;0;0;0\r\n#UID;[^\r]+\r\n#INT;1;30;990\r\n/);
    expect(serializeERN(gridOf(text).rs, 'r', OPTS)).toBe(text);
    expect(checkRouteFile(text).status).toBe('ok');
  });

  it('drops a block Nepos cannot hold, and the check says a save would lose it', () => {
    const text = miniErn({ extra: ['#INT;1;40;990'] });
    expect(gridOf(text).grid.cols[1].block).toBeUndefined();
    expect(checkRouteFile(text).status).not.toBe('ok');
  });

  it('a file with bookings is not damaged', () => {
    const { rs, grid } = gridOf(miniErn());
    grid.cols[0].cells[1].booking = { phone: '1', note: 'x' };
    grid.cols[1].booking = { url: 'u' };
    rs.booking = { email: 'e' };
    expect(checkRouteFile(serializeERN(rs, 'r', OPTS))).toEqual({ status: 'ok', issues: [] });
    expect(checkRouteFile(miniErn({ extra: ['#BOD;0;1;;1;;;;;;;0;0;;;', '#BOF;0;1;Ring;'] })).status).toBe('ok');
  });
});
