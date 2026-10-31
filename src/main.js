import './ui/styles.css';
import './ui/nepos2.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import { initShell, refreshAll } from './ui/shell.js';
import { initRouteList } from './ui/route-list.js';
import { initLineTable } from './ui/line-table.js';
import { initResourcesPage } from './ui/resources-page.js';
import { initEnturSettings } from './ui/entur-settings.js';
import { initCalendarsPage } from './ui/calendars-page.js';
import { initCalendarReplace } from './ui/calendar-replace-ui.js';
import { initTableSetTabs } from './ui/table-set-tabs.js';
import { initProjectUi, openFs } from './ui/project-ui.js';
import { initGrid } from './ui/grid.js';
import { initPowerTools } from './ui/power-tools.js';
import { initMarey } from './ui/marey-view.js';
import { initFootnoteEditor } from './ui/footnote-editor.js';
import { initRouteEditor } from './ui/route-editor.js';
import { initExportPage } from './ui/export-page.js';
import { initMapPanel } from './ui/map-panel.js';
import { initRouteView } from './ui/route-view.js';
import { initHubView } from './ui/hub-view.js';
import { initAnalysisPage } from './ui/analysis-page.js';
import { initStopPicker } from './ui/stop-picker.js';
import { initStopCard } from './ui/stop-card.js';
import { initSpeedStrip } from './ui/speed-strip.js';
import { initOrgRegister } from './ui/org-register.js';
import { initMenus } from './ui/menus.js';
import { initHelp, showWhatsNew } from './ui/help.js';
import { initDashboardPage } from './ui/dashboard-page.js';
import { initNoAutofill } from './ui/no-autofill.js';

initNoAutofill(document);
// Used Nepos before? (read before the shell stores the theme): then show what is new after an update
const returningUser = (() => { try { return localStorage.getItem('nepos.lastTheme') != null; } catch { return false; } })();
initShell();
initOrgRegister({ fetchOnStart: true });
initMenus();
initHelp();
initRouteList();
initLineTable();
initResourcesPage();
initEnturSettings();
initCalendarsPage();
initCalendarReplace();
initTableSetTabs();
initGrid();
initPowerTools();
initMarey();
initFootnoteEditor();
initRouteEditor();
initExportPage();
initDashboardPage();
initMapPanel();
initRouteView();
initHubView();
initAnalysisPage();
initStopPicker();
initStopCard();
initSpeedStrip();

// Development only: /?sample opens an in-memory sample project, so the screens can be checked
// without the browser's folder picker. Never active in a production build.
const sample = import.meta.env.DEV && new URLSearchParams(location.search).has('sample');
await initProjectUi({ restoreLast: !sample });
refreshAll();
// The splash stays for at least a second from page start, so everything settles behind it.
const splash = document.getElementById('splash');
if (splash) setTimeout(() => { splash.classList.add('done'); setTimeout(() => splash.remove(), 400); }, Math.max(0, 1000 - performance.now()));
// After an update: what is new, once (user 2026-10-21); after the splash, not over it
setTimeout(() => { showWhatsNew({ returning: returningUser }); }, Math.max(0, 1100 - performance.now()));
if (sample) {
  const { createSampleFs } = await import('./ui/sample.js');
  await openFs(await createSampleFs(), { sample: true, landing: true });
}
