// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadAppMarkup } from './dom-setup.js';
import { app } from '../../src/ui/state.js';
import { initShell } from '../../src/ui/shell.js';
import { initRouteList } from '../../src/ui/route-list.js';
import { initProjectUi, openFs } from '../../src/ui/project-ui.js';
import { initGrid } from '../../src/ui/grid.js';
import { initFootnoteEditor } from '../../src/ui/footnote-editor.js';
import { initRouteEditor, selectRoute } from '../../src/ui/route-editor.js';
import { lineIssues, lineState, projectIssues } from '../../src/ui/line-info.js';
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
