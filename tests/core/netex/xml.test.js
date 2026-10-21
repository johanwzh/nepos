import { describe, it, expect } from 'vitest';
import { xe, hhmm2t, yyyymmdd2d, dayCodeToDoW, ernModeNeTEx, pubDelivery } from '../../../src/core/netex/xml.js';

describe('NeTEx XML helpers', () => {
  it('escapes XML special characters', () => {
    expect(xe('A & B <"C">')).toBe('A &amp; B &lt;&quot;C&quot;&gt;');
  });

  it('formats HHMM as HH:MM:00', () => {
    expect(hhmm2t('0745')).toBe('07:45:00');
  });

  it('only accepts 8-character YYYYMMDD dates (regression: dashed dates gave empty calendars)', () => {
    expect(yyyymmdd2d('20260601')).toBe('2026-06-01');
    expect(yyyymmdd2d('2026-06-01')).toBe('');
  });

  it('maps ERN day codes to NeTEx DaysOfWeek', () => {
    expect(dayCodeToDoW('D')).toBe('Everyday');
    expect(dayCodeToDoW('DX67')).toBe('Weekdays');
    expect(dayCodeToDoW('67')).toBe('Weekend');
    expect(dayCodeToDoW('135')).toBe('Monday Wednesday Friday');
  });

  it('maps ERN transport modes', () => {
    expect(ernModeNeTEx(1)).toEqual({ mode: 'bus', sub: 'localBus' });
    expect(ernModeNeTEx(99)).toEqual({ mode: 'other', sub: '' });
  });

  it('uses the given publication timestamp', () => {
    expect(pubDelivery('TST', 'x', '', '2026-01-01T00:00:00'))
      .toContain('<PublicationTimestamp>2026-01-01T00:00:00</PublicationTimestamp>');
  });
});

describe('the source of the files (user 2026-10-21)', () => {
  it('says in PublicationDelivery\'s Description that Nepos made it, with the version', async () => {
    const { VERSION } = await import('../../../src/version.js');
    const xml = pubDelivery('ATU', 'ATU Line 35', '<CompositeFrame/>', '2026-10-21T00:00:00');
    expect(xml).toContain(`<Description>ATU Line 35 · made with Nepos ${VERSION} (https://github.com/johanwzh/nepos)</Description>`);
  });
});
