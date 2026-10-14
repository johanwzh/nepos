import { describe, it, expect } from 'vitest';
import { createMemoryFs, readText } from '../../src/project/fs.js';
import { readCalendars, writeCalendars, newCalendar } from '../../src/project/calendars-store.js';

describe('calendars file', () => {
  it('round-trips, normalising ranges; missing file = empty; damaged file reported', async () => {
    const fs = createMemoryFs();
    expect(await readCalendars(fs)).toEqual({ calendars: [], error: null });
    const cal = { ...newCalendar('Vinter 26/27'), ranges: /** @type {[string, string][]} */ ([['20270104', '20270619'], ['20260817', '20261220']]) };
    await writeCalendars(fs, [cal]);
    const back = await readCalendars(fs);
    expect(back.calendars[0].ranges).toEqual([['20260817', '20261220'], ['20270104', '20270619']]);
    expect(JSON.parse(await readText(fs, 'data/calendars.json'))[0].name).toBe('Vinter 26/27');
    expect((await readCalendars(createMemoryFs({ 'data/calendars.json': '[{"id":1}]' }))).error).toBe('unreadable');
  });
});
