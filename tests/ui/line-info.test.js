// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadAppMarkup } from './dom-setup.js';
import { app } from '../../src/ui/state.js';
import { initShell, refreshAll } from '../../src/ui/shell.js';
import { initRouteList } from '../../src/ui/route-list.js';
import { initProjectUi, openFs } from '../../src/ui/project-ui.js';
import { initGrid } from '../../src/ui/grid.js';
import { initFootnoteEditor } from '../../src/ui/footnote-editor.js';
import { initRouteEditor, selectRoute } from '../../src/ui/route-editor.js';
import { lineIssues, lineState, projectIssues, lineLabel, lineRouting, checkSizes } from '../../src/ui/line-info.js';

// How often the export check runs (backlog 96): the open line was checked 2–3 times per keystroke
const checks = vi.hoisted(() => ({ n: 0 }));
vi.mock('../../src/core/export-check.js', async (orig) => {
  const real = /** @type {any} */ (await orig());
  return { ...real, checkForExport: (/** @type {any} */ input) => { checks.n++; return real.checkForExport(input); } };
});
import { quayInfo } from '../../src/ui/quays.js';
import { createMemoryFs } from '../../src/project/fs.js';
import { createProject } from '../../src/project/create.js';
import { writeRoute } from '../../src/project/routes.js';
import { writeCalendars } from '../../src/project/calendars-store.js';

const route = (/** @type {string} */ code, extra = '', kal = '') => [
  '#LEV;Test;TST', `#RUT;-1;${code};A - B;;1;`, extra,
  '#SEK;NOG:Authority:aaaaaaaaaa1;F;1;0;0;0', '#SEK;NOG:Operator:bbbbbbbbbb2;B;0;1;0;0', '#CUR;neposcoin;1', '#TRA;A - B',
  '#PER;;;;;;', kal, '#TAB;0;;;;', '#TUR;0;D;0;0;0;0',
  '#TRL;0;NSR:Quay:1;A;34;0;-1;-1;34;-1', '#TRC;0;0700;0;0;0;0;0',
  '#TRL;1;NSR:Quay:2;B;34;0;-1;-1;34;-1', '#TRC;0;0710;0;0;0;0;0',
].filter(Boolean).join('\r\n') + '\r\n';
const codes = (/** @type {any[]} */ issues) => issues.map((i) => i.code);

let wired = false;
beforeEach(async () => {
  loadAppMarkup();
  initShell();
  initRouteList();
  await initProjectUi({ restoreLast: false });
  if (!wired) { initGrid(); initFootnoteEditor(); wired = true; }
  initRouteEditor();
  window.confirm = vi.fn(() => true);
  const fs = createMemoryFs();
  await createProject(fs, { name: 'Test', codespace: 'TST' });
  await writeCalendars(fs, [{ id: 'cal-1', name: 'Vinter', ranges: [['20260101', '20260630']] }]);
  await writeRoute(fs, '20', route('20'));
  await writeRoute(fs, '21', route('21', '#EKS;0'));
  await writeRoute(fs, '22', route('22', '#MOD;nope;nope'));
  await openFs(fs);
  /** @type {any} */ (document.getElementById('check-dlg')).close();
});

const press = (/** @type {string} */ k) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
const typeKeys = (/** @type {string} */ s) => [...s].forEach(press);
const problems = (/** @type {string} */ code) => lineIssues(code).length;

describe('review fixes', () => {
  it('keeps the public flag when the public code is edited; the flags are not in the header (review C1, user test)', async () => {
    await selectRoute('20');
    const code = /** @type {HTMLInputElement} */ (document.querySelector('input.rh-public'));
    code.value = '99';
    code.dispatchEvent(new Event('change'));
    expect(app.routeState.publicCode).toBe('99');
    expect(app.routeState.isPublic).toBe(true);
    expect(document.getElementById('rh-ispublic')).toBeNull();
    expect(document.getElementById('rh-exported')).toBeNull();
  });

  it('checks grid edits on the open line at once, and the list follows (review I2)', async () => {
    await selectRoute('20');
    typeKeys('0701'); press('Enter');           // harmless: the line is now unsaved
    const before = problems('20');
    const title = () => /** @type {HTMLElement} */ ([...document.querySelectorAll('.route-item')].find((i) => i.classList.contains('active'))).title;
    const titleBefore = title();
    press('ArrowUp');
    typeKeys('0730'); press('Enter');           // after the next stop's 0710: decreasing
    expect(codes(lineIssues('20'))).toContain('col-decreasing');
    expect(problems('20')).toBe(before + 1);
    expect(title()).not.toBe(titleBefore);
  });
});

describe('the open line is checked once per change (backlog 96)', () => {
  it('checks an unchanged open line once however often it is asked, and again after any change', async () => {
    await selectRoute('20');
    checks.n = 0;
    lineIssues('20'); lineIssues('20'); lineIssues('20');
    expect(checks.n).toBeLessThanOrEqual(1);
    const n = checks.n;
    app.routeState.periods[0].calendarIds = ['cal-1'];      // changed in place: still seen
    expect(codes(lineIssues('20'))).not.toContain('no-calendar');
    expect(checks.n).toBe(n + 1);
    lineIssues('20');
    expect(checks.n).toBe(n + 1);
    app.calendars = [...app.calendars];                      // the project's calendars changed
    lineIssues('20');
    expect(checks.n).toBe(n + 2);
  });

  it('a heavy open line keeps its last problems while it is edited, and is checked when the user pauses', async () => {
    await selectRoute('20');
    lineIssues('20');
    const titleOf = () => /** @type {HTMLElement} */ ([...document.querySelectorAll('.route-item')].find((i) => i.classList.contains('active'))).title;
    const before = titleOf();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const later = checkSizes.later;
    try {
      checkSizes.later = 1;                                   // this small line counts as heavy here
      checks.n = 0;
      app.routeState.periods[0].calendarIds = ['cal-1'];
      expect(codes(lineIssues('20'))).toContain('no-calendar'); // the last result, while editing
      expect(checks.n).toBe(0);
      vi.advanceTimersByTime(399);
      expect(checks.n).toBe(0);
      lineIssues('20');                                         // another change restarts the pause
      vi.advanceTimersByTime(399);
      expect(checks.n).toBe(0);
      vi.advanceTimersByTime(1);
      expect(checks.n).toBe(1);
      expect(codes(lineIssues('20'))).not.toContain('no-calendar');
      expect(checks.n).toBe(1);
      expect(titleOf()).not.toBe(before);                       // the lines pane was told
    } finally {
      checkSizes.later = later;
      vi.useRealTimers();
    }
  });

  it('checks a heavy line at once when asked for a fresh answer (next problem, the Export page)', async () => {
    await selectRoute('20');
    lineIssues('20');
    const later = checkSizes.later;
    try {
      checkSizes.later = 1;
      app.routeState.periods[0].calendarIds = ['cal-1'];
      expect(codes(lineIssues('20', { fresh: true }))).not.toContain('no-calendar');
      expect(projectIssues().some((i) => i.route === '20' && i.code === 'no-calendar')).toBe(false);
    } finally {
      checkSizes.later = later;
    }
  });
});

describe('the footer says when a line is heavy (backlog 96)', () => {
  const notice = () => /** @type {HTMLElement} */ (document.getElementById('ef-heavy'));

  it('shows the line\'s trips and passing times from the heavy size on, with advice; not below', async () => {
    await selectRoute('20');
    expect(notice().hidden).toBe(true);
    const heavy = checkSizes.heavy;
    try {
      checkSizes.heavy = 2;                       // line 20: one trip, two passing times
      refreshAll();
      expect(notice().hidden).toBe(false);
      expect(notice().textContent).toMatch(/1 tur.*2 passeringer/);
      expect(notice().title).toMatch(/blokk/i);
      checkSizes.heavy = 3;
      refreshAll();
      expect(notice().hidden).toBe(true);
    } finally {
      checkSizes.heavy = heavy;
    }
  });
});

describe('line info', () => {
  it('checks a saved line', () => {
    expect(codes(lineIssues('20'))).toContain('no-calendar');
    expect(lineState('20').routeName).toBe('A - B');
  });

  it('checks the open line as it is now, before saving', async () => {
    await selectRoute('20');
    app.routeState.periods[0].calendarIds = ['cal-1'];
    expect(codes(lineIssues('20'))).not.toContain('no-calendar');
  });

  it('gives a damaged line one error', () => {
    expect(lineState('22')).toBeNull();
    expect(codes(lineIssues('22'))).toEqual(['route-damaged']);
  });

  it('leaves lines that are not exported out of the project check', () => {
    const issues = projectIssues();
    expect(issues.some((i) => i.route === '20')).toBe(true);
    expect(issues.some((i) => i.route === '21')).toBe(false);
  });
});

describe('line labels', () => {
  it('names a line by its public code and name, never its ID', () => {
    expect(lineLabel('20')).toBe('20 A - B');
    app.routes = app.routes.map((r) => (r.code === '20' ? { ...r, text: r.text.replace('#RUT;-1;20;', '#RUT;-1;;') } : r));
    expect(lineLabel('20')).toBe('A - B');
    expect(lineLabel('nope')).toBe('nope');
  });
});

describe('a line’s routing by pattern (routing editor, 2026-10-31)', () => {
  it('counts the patterns by state, and is cached for a saved line until its stops move (final review M6)', () => {
    quayInfo.set('NSR:Quay:1', /** @type {any} */ ({ lon: 10, lat: 59 }));
    quayInfo.set('NSR:Quay:2', /** @type {any} */ ({ lon: 10.01, lat: 59 }));
    const first = lineRouting('20');
    expect(first).toEqual({ patterns: 1, green: 0, orange: 0, red: 1 });
    expect(lineRouting('20')).toBe(first);
    quayInfo.set('NSR:Quay:2', /** @type {any} */ ({ lon: 10.02, lat: 59 }));
    expect(lineRouting('20')).not.toBe(first);
    expect(lineRouting('22')).toBeNull();
    quayInfo.clear();
  });
});
