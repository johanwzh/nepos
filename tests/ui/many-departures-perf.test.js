// @vitest-environment jsdom
// Backlog 96: a line with many departures must not make Nepos sluggish. A timing guard at the size of a real trunk line
// (two directions, 44 stops, a block every 5 minutes on weekdays and every 10 at weekends; ~920 trips, ~40 000 passing
// times) on a two-year calendar. One change, checked, then asked for by the lines pane, the problem marker and Tasks:
// about 3.5 s before the fix (one check took ~0.9 s, working out the operating days per trip, and each ask checked again);
// about 0.2 s after. The budget is generous so a slower machine passes, but per-trip days or repeated checks fail it.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { loadAppMarkup } from './dom-setup.js';
import { app } from '../../src/ui/state.js';
import { initShell, refreshAll } from '../../src/ui/shell.js';
import { initRouteList } from '../../src/ui/route-list.js';
import { initProjectUi, openFs } from '../../src/ui/project-ui.js';
import { initGrid } from '../../src/ui/grid.js';
import { initFootnoteEditor } from '../../src/ui/footnote-editor.js';
import { initRouteEditor, selectRoute } from '../../src/ui/route-editor.js';
import { lineIssues } from '../../src/ui/line-info.js';
import { lineSize } from '../../src/core/blocks.js';
import { createMemoryFs } from '../../src/project/fs.js';
import { createProject } from '../../src/project/create.js';
import { writeRoute } from '../../src/project/routes.js';
import { writeCalendars } from '../../src/project/calendars-store.js';

const STOPS = 44;
const hhmm = (/** @type {number} */ m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}${String(m % 60).padStart(2, '0')}`;

/** Two directions, three blocks each: weekdays every 5 min 05:00–00:50, Saturday and Sunday every 10. */
function trunkLine() {
  const cols = [['DX67', 300, 5, 1190], ['6', 360, 10, 1130], ['7', 420, 10, 1070]];
  const out = ['#LEV;Test;TST', '#RUT;-1;B;Stamlinje;;1;', '#TRM;bus;localBus', '#SEK;NOG:Authority:aaaaaaaaaa1;F;1;0;0;0',
    '#SEK;NOG:Operator:bbbbbbbbbb2;B;0;1;0;0', '#DST;1;Ende;'];
  for (const [d, name] of [['outbound', 'Ut'], ['inbound', 'Inn']]) {
    out.push(`#TRA;${name};${d}`, '#PER;;;;;;', '#KAL;cal-long', '#TAB;0;;;;');
    cols.forEach(([day, , every, span], ci) => out.push(`#TUR;${ci};${day};0;0;0;0`, `#INT;${ci};${every};${span}`));
    for (let r = 0; r < STOPS; r++) {
      out.push(`#TRL;${r};NSR:Quay:${(d === 'outbound' ? r : STOPS - r) + 100};Stopp ${r};0;-1;-1;-1;0;-1`);
      cols.forEach(([, start], ci) => out.push(`#TRC;${ci};${hhmm(Number(start) + 2 * r)};0;0;0;0;0`));
    }
    cols.forEach((_, ci) => out.push(`#DSK;${ci};0;;1`));
  }
  return `${out.join('\r\n')}\r\n`;
}

beforeAll(async () => {
  loadAppMarkup();
  initShell();
  initRouteList();
  await initProjectUi({ restoreLast: false });
  initGrid(); initFootnoteEditor();
  initRouteEditor();
  window.confirm = vi.fn(() => true);
  const fs = createMemoryFs();
  await createProject(fs, { name: 'Test', codespace: 'TST' });
  await writeCalendars(fs, [{ id: 'cal-long', name: 'To år', ranges: [['20260101', '20271231']] }]);
  await writeRoute(fs, 'B', trunkLine());
  await openFs(fs);
  /** @type {any} */ (document.getElementById('check-dlg')).close();
  await selectRoute('B');
});

describe('a line with many departures (backlog 96)', () => {
  it('is the size of a real trunk line', () => {
    expect(lineSize(app.routeState)).toEqual({ trips: 2 * (239 + 114 + 108), times: 2 * (239 + 114 + 108) * STOPS });
  });

  it('checks a change once, and answers the three places that ask, within the budget', () => {
    refreshAll();
    const t0 = performance.now();
    app.routeState.routeName = 'Stamlinje 2';     // a change: the line is checked again
    lineIssues('B', { fresh: true });
    for (let i = 0; i < 3; i++) lineIssues('B');  // the lines pane, the problem marker, Tasks
    const ms = performance.now() - t0;
    expect(lineIssues('B').some((i) => i.code === 'route-no-trips')).toBe(false);
    expect(ms).toBeLessThan(1500);
  }, 30000);
});
