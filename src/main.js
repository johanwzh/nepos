import './ui/styles.css';
import './ui/nepos2.css';
import 'leaflet/dist/leaflet.css';
import { initShell, refreshAll } from './ui/shell.js';
import { initRouteList } from './ui/route-list.js';
import { initLineTable } from './ui/line-table.js';
import { initOrgsPage } from './ui/orgs-page.js';
import { initAssetsNav } from './ui/assets-nav.js';
import { initBrandingsPage } from './ui/brandings-page.js';
import { initCalendarsPage } from './ui/calendars-page.js';
import { initCalendarReplace } from './ui/calendar-replace-ui.js';
import { initTableSetTabs } from './ui/table-set-tabs.js';
import { initProjectUi, openFs } from './ui/project-ui.js';
import { initGrid } from './ui/grid.js';
import { initFootnoteEditor } from './ui/footnote-editor.js';
import { initRouteEditor } from './ui/route-editor.js';
import { initExportPage } from './ui/export-page.js';
import { initMapPanel } from './ui/map-panel.js';
import { initWorkbench, setWorkbenchMap } from './ui/workbench.js';
import { createWorkbenchMap } from './ui/workbench-map.js';
import { initOrgRegister } from './ui/org-register.js';
import { initMenus } from './ui/menus.js';

initShell();
initOrgRegister({ fetchOnStart: true });
initMenus();
initRouteList();
initLineTable();
initOrgsPage();
initAssetsNav();
initBrandingsPage();
initCalendarsPage();
initCalendarReplace();
initTableSetTabs();
initGrid();
initFootnoteEditor();
initRouteEditor();
initExportPage();
initMapPanel();
initWorkbench();
setWorkbenchMap(createWorkbenchMap);

// Development only: /?sample opens an in-memory sample project, so the screens can be checked
// without the browser's folder picker. Never active in a production build.
const sample = import.meta.env.DEV && new URLSearchParams(location.search).has('sample');
await initProjectUi({ restoreLast: !sample });
refreshAll();
if (sample) {
  const { createSampleFs } = await import('./ui/sample.js');
  await openFs(await createSampleFs(), { sample: true });
}
