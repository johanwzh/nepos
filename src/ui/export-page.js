// The Export page (F4): check the whole project, then write the NeTEx delivery into
// exports/<time>/ in the project folder. Errors block the export; warnings never do.
import { app } from './state.js';
import { $, onRefresh, refreshAll, runAction, beforeLeave, persistSettings, showMessage, currentPage } from './shell.js';
import { projectIssues, lineLabel } from './line-info.js';
import { t } from '../i18n/strings.js';
import { parseERN } from '../core/ern/parse.js';
import { orgExportMode, writeOrgExportMode } from '../project/meta.js';
import { checkForExport } from '../core/export-check.js';
import { buildNeTExFiles } from '../core/netex/export.js';
import { writeExport } from '../project/export.js';
import { listRoutes, readRoute } from '../project/routes.js';
import { checkRouteFile } from '../core/integrity/check.js';
import { quayInfo, loadProjectQuays } from './quays.js';

/** @param {string} s */
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The last check, for the project it was made for. */
let result = /** @type {{ fs: any, issues: import('../core/export-check.js').CheckIssue[] } | null} */ (null);
let status = /** @type {{ fs: any, text: string, bad: boolean } | null} */ (null);

let busy = false;

/**
 * Run one check or export at a time; a failure is shown instead of disappearing.
 * @param {() => Promise<void>} work
 */
async function exclusive(work) {
  if (busy) return;
  busy = true;
  renderExportPage();
  try {
    await work();
  } catch (e) {
    result = null;
    renderResults();
    showMessage(t('actionFailed', /** @type {Error} */ (e).message));
  } finally {
    busy = false;
    renderExportPage();
  }
}

/**
 * Save first, read the route files again from disk and check their integrity (spec §9), look the
 * Quays up again (spec §7.2), then check everything for the export.
 * @returns {Promise<{ routes: { code: string, rs: any }[], issues: import('../core/export-check.js').CheckIssue[] } | null>}
 *   null when the user cancelled, or another project was opened meanwhile
 */
async function runCheck() {
  const fs = app.fs, meta = app.meta;
  if (!meta || !fs) return null;
  if (!(await beforeLeave('export'))) return null;
  if (app.fs !== fs) return null;
  $('val-results').textContent = t('checking');

  // The files as they are now: another program (or a colleague) may have changed them.
  /** @type {{ code: string, text: string, status: string, issues: any[] }[]} */
  const fresh = [];
  for (const code of await listRoutes(fs)) {
    const text = await readRoute(fs, code);
    if (text === null) continue;
    fresh.push({ code, text, ...checkRouteFile(text) });
  }
  if (app.fs !== fs) return null;
  const changedOnDisk = fresh.filter((r) => app.routes.some((old) => old.code === r.code && old.text !== r.text)).map((r) => r.code);
  app.routes = /** @type {any} */ (fresh);

  await loadProjectQuays();
  if (app.fs !== fs) return null;

  const routes = fresh.map((r) => ({
    code: r.code,
    status: r.status,
    problem: r.status === 'damaged' ? (({ code, line, detail }) => `${t(`issue:${code}`, detail ?? '')}${line ? ` (${t('lineNo', line)})` : ''}`)(/** @type {any} */ (r.issues.find((i) => i.severity === 'damaged') ?? {})) : '',
    rs: r.status === 'damaged' ? null : parseERN(r.text, { lang: /** @type {'no' | 'en'} */ (app.settings.lang) }),
    // "Eksporteres: nei" (#EKS;0), read from the text too: a damaged line is not parsed (user 2026-10-18)
    excluded: /^\s*#EKS;\s*0\s*$/m.test(r.text),
  }));
  const orgsProblem = app.orgsError ? 'unreadable' : '';
  // Lines set to "Eksporteres: nei" are left out entirely (navigation spec §4), damaged or not; other
  // damaged lines are still checked (and block the export).
  const exported = routes.filter((r) => (r.rs ? r.rs.exported !== false : !r.excluded));
  const issues = checkForExport({ routes: exported, orgs: app.orgs, register: app.orgRegister?.companies ?? null, orgMode: orgExportMode(meta), codespace: meta.codespace, orgsProblem, brandings: app.brandings, brandingsProblem: app.brandingsError ? 'unreadable' : '', calendars: app.calendars, calendarsProblem: app.calendarsError ? 'unreadable' : '', quayInfo, changedOnDisk, speedLimits: meta.speedLimits ?? null });
  result = { fs, issues };
  refreshAll(); // the route list shows the files as they are now
  return { routes: exported.map(({ code, rs }) => ({ code, rs })), issues };
}

async function runExport() {
  const fs = app.fs, meta = app.meta;
  const checked = await runCheck();
  if (!checked || !fs || !meta || app.fs !== fs) return;
  if (checked.issues.some((i) => i.level === 'error')) {
    setStatus(t('exportBlocked'), true);
    return;
  }
  const files = buildNeTExFiles({ codespace: meta.codespace, deliveryName: meta.name, routes: checked.routes, orgs: app.orgs, orgMode: orgExportMode(app.meta), brandings: app.brandings, calendars: app.calendars });
  const asZip = app.settings.exportAsZip !== false;
  let written = '';
  const ok = await runAction(async () => { written = await writeExport(fs, files, { codespace: meta.codespace, asZip }); });
  if (ok) {
    // Where it is, from the project folder (a web page knows no more of the path than that), as Explorer writes it
    const place = [app.handle?.name ?? app.meta?.name ?? '', ...written.split('/')].filter(Boolean).join('\\');
    setStatus(t('exportDone', place, files.length), false);
  }
}

/** @param {string} text @param {boolean} bad */
function setStatus(text, bad) {
  status = { fs: app.fs, text, bad };
  renderStatus();
}

function renderStatus() {
  const el = $('export-status');
  const current = status && status.fs === app.fs ? status : null;
  el.textContent = current?.text ?? '';
  el.classList.toggle('bad', !!current?.bad);
}

/** @param {import('../core/export-check.js').CheckIssue} i */
function issueLine(i) {
  const place = [i.route ? lineLabel(i.route) : '', i.where?.tableSet, i.where?.period, i.where?.column ? t('columnLabel', i.where.column) : '']
    .filter(Boolean).join(' · ');
  return `<div class="n2-issue ${i.level}">
    <span class="n2-issue-ico">${i.level === 'error' ? '✖' : '⚠'}</span>
    ${place ? `<span class="n2-issue-where">${esc(place)}</span>` : ''}
    <span class="n2-issue-text">${esc(t(`chk:${i.code}`, i.detail ?? ''))}</span>
  </div>`;
}

function renderResults() {
  const el = $('val-results');
  const run = result && result.fs === app.fs ? result : null;
  // The live check runs only while the page is shown (it covers every line).
  if (!app.meta || (!run && currentPage() !== 'export')) { el.innerHTML = ''; return; }
  // The last export run while on this page, else the live check of the lines as they are now.
  const current = run ?? { issues: projectIssues() };
  const live = current !== result ? `<div class="n2-issue-live">${esc(t('liveCheckNote'))}</div>` : '';
  if (!current.issues.length) { el.innerHTML = `${live}<span class="n2-issue-ok">✔ ${esc(t('checkClean'))}</span>`; return; }
  const errors = current.issues.filter((i) => i.level === 'error').length;
  const warnings = current.issues.length - errors;
  el.innerHTML = `${live}<div class="n2-issue-summary">${esc(t('checkSummary', errors, warnings))}</div>${current.issues.map(issueLine).join('')}`;
}

let wasOnPage = false;

/** Opening the Export page starts the slow part of the check: asking NSR about the stops (spec §5). */
function onPageEnter() {
  result = null;
  const fs = app.fs;
  if (!fs) return;
  void loadProjectQuays().then(() => { if (app.fs === fs && currentPage() === 'export') renderResults(); }, () => {});
}

function renderExportPage() {
  const onPage = currentPage() === 'export';
  if (onPage && !wasOnPage) { wasOnPage = true; onPageEnter(); }
  else if (!onPage) wasOnPage = false;
  const open = !!app.meta;
  $('btn-netex').disabled = !open || busy;
  $('chk-zip').disabled = !open;
  $('chk-zip').checked = app.settings.exportAsZip !== false;
  const mode = orgExportMode(app.meta);
  for (const id of ['org-mode-codespace', 'org-mode-nog']) {
    $(id).disabled = !open;
    $(id).checked = $(id).value === mode;
  }
  renderResults();
  renderStatus();
}

export function initExportPage() {
  onRefresh(renderExportPage);
  $('btn-netex').addEventListener('click', () => exclusive(runExport));
  $('chk-zip').addEventListener('change', () => {
    app.settings.exportAsZip = $('chk-zip').checked;
    runAction(persistSettings);
  });
  for (const id of ['org-mode-codespace', 'org-mode-nog']) {
    $(id).addEventListener('change', () => {
      const fs = app.fs, meta = app.meta;
      if (!fs || !meta || !$(id).checked) return;
      const mode = /** @type {'codespace' | 'nog'} */ ($(id).value);
      void runAction(async () => { app.meta = await writeOrgExportMode(fs, meta, mode); });
    });
  }
  renderExportPage();
}
