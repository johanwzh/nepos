import { describe, it, expect, afterEach } from 'vitest';
import { STRINGS, t, setLang, getLang } from '../../src/i18n/strings.js';

afterEach(() => setLang('no'));

describe('strings', () => {
  it('has the same keys, with the same kind of value, in both languages', () => {
    const no = Object.keys(STRINGS.no).sort();
    const en = Object.keys(STRINGS.en).sort();
    expect(no).toEqual(en);
    for (const key of no) expect(typeof STRINGS.no[key], key).toBe(typeof STRINGS.en[key]);
  });

  it('defaults to Norwegian and switches to English', () => {
    expect(getLang()).toBe('no');
    expect(t('tabEdit')).toBe('Rediger rutetabell');
    setLang('en');
    expect(t('tabEdit')).toBe('Edit timetable');
  });

  it('calls function values with arguments', () => {
    setLang('en');
    expect(t('integritySummary', 3, 1, 2)).toBe('3 OK, 1 can be updated, 2 need attention');
  });

  it('falls back to the key for unknown texts', () => {
    expect(t('no-such-key')).toBe('no-such-key');
  });

  it('treats any language other than en as Norwegian', () => {
    setLang('de');
    expect(getLang()).toBe('no');
  });
});
