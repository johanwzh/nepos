// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadAppMarkup } from './dom-setup.js';
import { app } from '../../src/ui/state.js';
import { initShell, setPage } from '../../src/ui/shell.js';
import { initRouteList } from '../../src/ui/route-list.js';
import { initProjectUi, openFs } from '../../src/ui/project-ui.js';
import { initGrid, grid } from '../../src/ui/grid.js';
import { initFootnoteEditor } from '../../src/ui/footnote-editor.js';
import { initRouteEditor, selectRoute } from '../../src/ui/route-editor.js';
import { periodsOf } from '../../src/ui/route-state.js';
import { createMemoryFs } from '../../src/project/fs.js';
import { createProject } from '../../src/project/create.js';
import { writeRoute } from '../../src/project/routes.js';

const ROUTE = [
  '#LEV;Test;TST', '#RUT;-1;7;A - B;;1;', '#SEK;-1;;0;0;0;0', '#CUR;neposcoin;1', '#TRA;A - B',
  '#PER;;;;;;', '#TAB;0;;;;', '#TUR;0;D;0;0;0;0',
  '#TRL;0;NSR:Quay:1;A;34;0;-1;-1;34;-1', '#TRC;0;0700;0;0;0;0;0',
  '#TRL;1;NSR:Quay:2;B;34;0;-1;-1;34;-1', '#TRC;0;0710;0;0;0;0;0',
].join('\r\n') + '\r\n';

let wired = false;
beforeEach(async () => {
  loadAppMarkup();
  initShell();
  setPage('edit');
  initRouteList();
  await initProjectUi({ restoreLast: false });
  if (!wired) { initGrid(); initFootnoteEditor(); wired = true; }
  initRouteEditor();
  window.confirm = vi.fn(() => true);
  const fs = createMemoryFs();
  await createProject(fs, { name: 'Test', codespace: 'TST' });
  await writeRoute(fs, '7', ROUTE);
  await openFs(fs);
  /** @type {any} */ (document.getElementById('check-dlg')).close();
  await selectRoute('7');
});

const dlg = () => /** @type {HTMLDialogElement} */ (document.getElementById('per-dlg'));

describe('new period', () => {
  it('asks in its own window, not the browser\'s, and explains what a period is', () => {
    document.getElementById('btn-add-per')?.click();
    expect(window.confirm).not.toHaveBeenCalled();
    expect(dlg().open).toBe(true);
    expect(dlg().textContent).toContain('kalender');
    expect(document.getElementById('btn-add-per')?.textContent).toContain('Periode');
  });

  it('copies the trips when asked, and starts empty otherwise', () => {
    document.getElementById('btn-add-per')?.click();
    /** @type {HTMLInputElement} */ (document.getElementById('per-copy')).checked = true;
    document.getElementById('per-ok')?.click();
    expect(periodsOf(app.routeState, app.routeState.activeSet)).toHaveLength(2);
    expect(grid.cols).toHaveLength(1);
    document.getElementById('btn-add-per')?.click();
    /** @type {HTMLInputElement} */ (document.getElementById('per-empty')).checked = true;
    document.getElementById('per-ok')?.click();
    expect(periodsOf(app.routeState, app.routeState.activeSet)).toHaveLength(3);
    expect(grid.cols).toHaveLength(0);
  });

  it('does nothing on Cancel', () => {
    document.getElementById('btn-add-per')?.click();
    document.getElementById('per-cancel')?.click();
    expect(periodsOf(app.routeState, app.routeState.activeSet)).toHaveLength(1);
    expect(dlg().open).toBe(false);
  });
});
