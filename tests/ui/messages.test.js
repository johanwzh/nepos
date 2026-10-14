import { describe, it, expect, afterEach } from 'vitest';
import { setLang, STRINGS } from '../../src/i18n/strings.js';
import { issueMessage, summaryMessage, fileNameMessage, openFailureMessage, createFailureMessage } from '../../src/ui/messages.js';

afterEach(() => setLang('no'));

// Every code Plans 2a and 2b-1 can produce. A code missing here is a code the user would see raw.
const ISSUE_CODES = [
  'unreadable-line', 'unsupported-record', 'extra-comment', 'unsupported-field', 'out-of-order',
  'invalid-date', 'invalid-day-code', 'invalid-time', 'missing-route-record', 'lost-on-save',
  'unreadable-file', 'personal-data-in-lev', 'vehicle-field', 'missing-lev', 'no-periods',
];
const OPEN_REASONS = ['not-nepos-project', 'invalid-project-file', 'invalid-codespace', 'newer-format'];
const CREATE_ERRORS = ['codespace-required', 'codespace-format', 'folder-not-empty'];
const NAME_PROBLEMS = ['extension-case', 'invalid-code'];

describe('every code has a message in both languages', () => {
  const required = [
    ...ISSUE_CODES.map((c) => `issue:${c}`),
    ...OPEN_REASONS.map((c) => `open:${c}`),
    ...CREATE_ERRORS.map((c) => `create:${c}`),
    ...NAME_PROBLEMS.map((c) => `name:${c}`),
  ];
  for (const lang of ['no', 'en']) {
    it(lang, () => {
      for (const key of required) expect(STRINGS[lang][key], `${lang} ${key}`).toBeDefined();
    });
  }
});

describe('messages', () => {
  it('puts the line number in front of an issue', () => {
    setLang('en');
    expect(issueMessage({ code: 'unsupported-record', severity: 'damaged', line: 7, detail: '#KOS' }))
      .toBe('Line 7: #KOS is not kept by Nepos and would be lost on save');
    expect(issueMessage({ code: 'missing-route-record', severity: 'damaged' })).toBe('No #RUT record');
  });

  it('summarises the project check', () => {
    setLang('no');
    expect(summaryMessage({ ok: 39, outdated: 2, damaged: 1 })).toBe('39 OK, 2 kan oppdateres, 1 trenger oppfølging');
  });

  it('describes a file-name problem and its fix', () => {
    setLang('en');
    expect(fileNameMessage({ fileName: '40.TXT', problem: 'extension-case', rename: '40.txt' }))
      .toBe('40.TXT: File extension must be lower-case .txt — rename to 40.txt');
    expect(fileNameMessage({ fileName: '10.TXT', problem: 'extension-case', rename: null }))
      .toBe('10.TXT: File extension must be lower-case .txt — rename it by hand');
  });

  it('explains open and create failures', () => {
    setLang('en');
    expect(openFailureMessage({ ok: false, reason: 'newer-format', formatVersion: 3 })).toContain('format 3');
    expect(createFailureMessage({ ok: false, error: 'folder-not-empty', found: ['notes.txt', 'old'] })).toContain('notes.txt, old');
  });
});
