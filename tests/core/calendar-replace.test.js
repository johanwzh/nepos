import { describe, it, expect } from 'vitest';
import { replaceCalendarInErn, replaceCalendarInState } from '../../src/core/calendar-replace.js';
import { parseERN } from '../../src/core/ern/parse.js';

const text = ['#TRA;A', '#UID;aaaaaaaa-0000-4000-8000-000000000001', '#PER;;;;;;', '#KAL;old', '#TAB;0;;;;', '#PER;;;;;;', '#KAL;new', '#KAL;old', '#TAB;0;;;;', '#PER;;;;;;', '#KAL;other', '#TAB;0;;;;'].join('\r\n') + '\r\n';

describe('replacing a calendar', () => {
  it('replaces it in the file, once per period, leaving other calendars alone', () => {
    const r = replaceCalendarInErn(text, 'old', 'new');
    expect(r.changed).toBe(2);
    expect(r.text).toBe(text.replace('#KAL;old\r\n#TAB', '#KAL;new\r\n#TAB').replace('#KAL;new\r\n#KAL;old\r\n', '#KAL;new\r\n'));
    expect(replaceCalendarInErn(text, 'none', 'new').changed).toBe(0);
  });

  it('replaces it in a route state', () => {
    const rs = parseERN(text);
    expect(replaceCalendarInState(rs, 'old', 'new')).toBe(2);
    expect(rs.periods.map((/** @type {any} */ p) => p.calendarIds)).toEqual([['new'], ['new'], ['other']]);
  });
});
