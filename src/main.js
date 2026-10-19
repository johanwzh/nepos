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
import { initFootnoteEditor } from './ui/footnote-editor.js';
import { initRouteEditor } from './ui/route-editor.js';
import { initExportPage } from './ui/export-page.js';
import { initMapPanel } from './ui/map-panel.js';
import { initLinkRouter } from './ui/link-router.js';
import { createShapeEngine } from './shapes/index.js';
import { styleUrlFor, styleSourceFrom } from './core/map-style.js';
import { app } from './ui/state.js';
import { initStopPicker } from './ui/stop-picker.js';
import { initStopCard } from './ui/stop-card.js';
import { initSpeedStrip } from './ui/speed-strip.js';
import { initOrgRegister } from './ui/org-register.js';
import { initMenus } from './ui/menus.js';
import { initHelp } from './ui/help.js';
import { initNoAutofill } from './ui/no-autofill.js';

initNoAutofill(document);
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
initFootnoteEditor();
initRouteEditor();
initExportPage();
initMapPanel();
// Routed links (2.3): the engine runs in a worker on the map style's own vector tiles; made on first need
initLinkRouter({
  makeEngine: async () => {
    const style = styleUrlFor(app.settings, 'light');
    if (typeof style !== 'string') return null; // a raster map: no vector tiles, links stay straight
    const json = async (/** @type {string} */ url) => (await fetch(url)).json();
    const source = await styleSourceFrom(await json(style), json);
    return source ? createShapeEngine({ styleSource: source }) : null;
  },
});
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
if (sample) {
  const { createSampleFs } = await import('./ui/sample.js');
  await openFs(await createSampleFs(), { sample: true });
}
