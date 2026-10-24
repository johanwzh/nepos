// Booking in ERN (booking spec 2026-10-22): #BOD/#BOF at (column, row) for a stop on a trip, (column, -1) for a trip,
// (-1, -1) for the line.
import { describe, it, expect } from 'vitest';
import { serializeERN } from '../../../src/core/ern/serialize.js';
import { miniErn, gridOf } from '../../fixtures/mini-line.js';

const OPTS = { delivery: { name: 'T', codespace: 'TST' }, orgs: [] };
const B = { phone: '+47 1', bookWhen: 'untilPreviousDay', methods: ['callOffice', 'online'], latest: '1800', minAhead: 'PT2H', note: 'Ring dagen før' };

describe('booking in ERN', () => {
  it('writes a stop booking as #BOD and #BOF at its cell and reads it back', () => {
    const { rs, grid } = gridOf(miniErn());
    grid.cols[2].cells[1].booking = B;
    const text = serializeERN(rs, 'r', OPTS);
    expect(text).toContain('#BOD;2;1;;+47 1;;;;;untilPreviousDay;6;;1800;PT2H;');
    expect(text).toContain('#BOF;2;1;Ring dagen før;nob');
    expect(gridOf(text).grid.cols[2].cells[1].booking).toEqual(B);
  });

  it('writes a trip booking on row -1', () => {
    const { rs, grid } = gridOf(miniErn());
    grid.cols[0].booking = { url: 'https://b.no', buyWhen: ['beforeBoarding'] };
    const text = serializeERN(rs, 'r', OPTS);
    expect(text).toContain('#BOD;0;-1;;;;https://b.no;;;;;2;;;');
    expect(gridOf(text).grid.cols[0].booking).toEqual({ url: 'https://b.no', buyWhen: ['beforeBoarding'] });
  });

  it('writes the line booking once on the whole table and reads it back', () => {
    const { rs } = gridOf(miniErn());
    rs.booking = { phone: '22', access: 'public' };
    const text = serializeERN(rs, 'r', OPTS);
    expect(text.split('#BOD;-1;-1;').length - 1).toBe(1);
    expect(gridOf(text).rs.booking).toEqual({ phone: '22', access: 'public' });
  });

  it('keeps the contact person it reads, without showing it anywhere', () => {
    const { grid } = gridOf(miniErn({ extra: ['#BOD;1;0;Kari;99;;;;;;;;;;'] }));
    expect(grid.cols[1].cells[0].booking).toEqual({ contact: 'Kari', phone: '99' });
  });
});
