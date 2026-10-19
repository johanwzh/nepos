// @vitest-environment jsdom
// "There are problems" on the editor page (user 2026-10-19): a marker with the counts; clicking goes to the first
// problem, then the next, and marks the place.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadAppMarkup, flush } from './dom-setup.js';
import { app } from '../../src/ui/state.js';
import { initShell } from '../../src/ui/shell.js';
import { initRouteList } from '../../src/ui/route-list.js';
import { initProjectUi, openFs } from '../../src/ui/project-ui.js';
import { initGrid, grid } from '../../src/ui/grid.js';
import { initFootnoteEditor } from '../../src/ui/footnote-editor.js';
import { initRouteEditor, selectRoute } from '../../src/ui/route-editor.js';
import { initTableSetTabs } from '../../src/ui/table-set-tabs.js';
import { lineIssues } from '../../src/ui/line-info.js';
import { goToProblem } from '../../src/ui/problem-nav.js';
import { createMemoryFs } from '../../src/project/fs.js';
import { createProject } from '../../src/project/create.js';
import { writeRoute } from '../../src/project/routes.js';

// No line name; table set 2 has no name and its trip no day code
const ROUTE = [
  '#LEV;T;TST', '#RUT;-1;50;;;1;', '#SEK;-1;;0;0;0;0',
  '#TRA;Fram', '#PER;;;;;;', '#TAB;0;;;;', '#TUR;0;D;0;0;0;0',
  '#TRL;0;NSR:Quay:1;A;0;-1;-1;-1;0;-1', '#TRC;0;0700;0;0;0;0;0', '#TRL;1;NSR:Quay:2;B;0;-1;-1;-1;0;-1', '#TRC;0;0710;0;0;0;0;0',
  '#TRA;', '#PER;;;;;;', '#TAB;0;;;;', '#TUR;0;;0;0;0;0',
  '#TRL;0;NSR:Quay:2;B;0;-1;-1;-1;0;-1', '#TRC;0;0800;0;0;0;0;0', '#TRL;1;NSR:Quay:1;A;0;-1;-1;-1;0;-1', '#TRC;0;0810;0;0;0;0;0',
].join('\r\n') + '\r\n';

let wired = false;
beforeEach(async () => {
  loadAppMarkup();
  initShell();
  initRouteList();
  await initProjectUi({ restoreLast: false });
  if (!wired) { initGrid(); initFootnoteEditor(); wired = true; }
  initRouteEditor();
  initTableSetTabs();
  window.confirm = vi.fn(() => true);
  const fs = createMemoryFs();
  await createProject(fs, { name: 'Test', codespace: 'TST' });
  await writeRoute(fs, '50', ROUTE);
  await openFs(fs);
  /** @type {any} */ (document.getElementById('check-dlg')).close();
  await selectRoute('50');
  await flush();
});

const marker = () => /** @type {HTMLElement} */ (document.getElementById('ef-problems'));

describe('the problems marker', () => {
  it('shows how many errors and warnings the open line has, without listing them', () => {
    const issues = lineIssues('50');
    const errors = issues.filter((i) => i.level === 'error').length;
    expect(errors).toBeGreaterThan(2);
    expect(marker().textContent).toContain(`${errors} feil`);
  });

  it('goes to the first problem on a click, then the next', () => {
    marker().click();
    const first = lineIssues('50')[0];
    expect(marker().textContent).toContain(`1/${lineIssues('50').length}`);
    marker().click();
    expect(marker().textContent).toContain(`2/${lineIssues('50').length}`);
    expect(first.level).toBe('error');
  });

  it('a missing line name: the name field, focused and marked', () => {
    goToProblem({ level: 'error', code: 'no-name', route: '50' });
    const name = document.getElementById('rh-name');
    expect(document.activeElement).toBe(name);
    expect(name?.classList.contains('go-here')).toBe(true);
  });

  it('a trip without a day code in another table set: switches there and selects the day code', () => {
    const issue = lineIssues('50').find((i) => i.code === 'col-no-daycode');
    expect(issue).toBeTruthy();
    goToProblem(/** @type {any} */ (issue));
    const rs = app.routeState;
    expect(rs.activeSet).toBe(rs.tableSets[1].id);
    expect(document.querySelector('.g-dc-cell[data-ci="0"]')?.classList.contains('dc-sel')).toBe(true);
    expect(grid.cols[0].dayCode).toBe('');
  });

  it('a leg that is too fast: selects and marks the time it arrives at (user 2026-10-19)', () => {
    goToProblem({ level: 'error', code: 'speed-over', route: '50', where: { tableSet: 'Fram', period: '', column: 1, row: 1, setId: app.routeState.tableSets[0].id } });
    const cell = document.querySelector('#tbl td[data-r="1"][data-c="0"]');
    expect(cell?.classList.contains('go-here')).toBe(true);
    expect(cell?.classList.contains('is-anchor')).toBe(true);
  });

  it('a table set without a name: opens its edit dialog', () => {
    const issue = lineIssues('50').find((i) => i.code === 'table-set-name');
    goToProblem(/** @type {any} */ (issue));
    expect(/** @type {any} */ (document.getElementById('tse-dlg')).open).toBe(true);
  });
});

describe('review fixes 2.2', () => {
  it('updates the counts after an edit outside the grid (the line name)', async () => {
    const before = lineIssues('50').filter((i) => i.level === 'error').length;
    const name = /** @type {HTMLInputElement} */ (document.getElementById('rh-name'));
    name.value = 'Ny linje';
    name.dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 400));
    expect(marker().textContent).toContain(`${before - 1} feil`);
  });
});
