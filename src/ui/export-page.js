// The Export page (F4): check the whole project, then write the NeTEx delivery into
// exports/<time>/ in the project folder. Errors block the export; warnings never do.
import { app } from './state.js';
import { $, onRefresh, refreshAll, runAction, beforeLeave, persistSettings, showMessage } from './shell.js';
import { t } from '../i18n/strings.js';
import { parseERN } from '../core/ern/parse.js';
import { orgExportMode } from '../project/meta.js';
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
    rs: r.status === 'damaged' ? null : parseERN(r.text, { lang: /** @type {'no' | 'en'} */ (app.settings.lang) }),
  }));
  const orgsProblem = app.orgsError ? 'unreadable' : '';
  const issues = checkForExport({ routes, orgs: app.orgs, register: app.orgRegister?.companies ?? null, orgMode: orgExportMode(meta), codespace: meta.codespace, orgsProblem, quayInfo, changedOnDisk });
  result = { fs, issues };
  refreshAll(); // the route list shows the files as they are now
  return { routes: routes.map(({ code, rs }) => ({ code, rs })), issues };
}

async function runExport() {
  const fs = app.fs, meta = app.meta;
  const checked = await runCheck();
  if (!checked || !fs || !meta || app.fs !== fs) return;
  if (checked.issues.some((i) => i.level === 'error')) {
    setStatus(t('exportBlocked'), true);
    return;
  }
  const files = buildNeTExFiles({ codespace: meta.codespace, deliveryName: meta.name, routes: checked.routes, orgs: app.orgs, orgMode: orgExportMode(app.meta) });
  const asZip = app.settings.exportAsZip !== false;
  let written = '';
  const ok = await runAction(async () => { written = await writeExport(fs, files, { codespace: meta.codespace, asZip }); });
  if (ok) setStatus(t('exportDone', written, files.length), false);
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
  const place = [i.route, i.where?.period, i.where?.direction, i.where?.column ? t('columnLabel', i.where.column) : '']
    .filter(Boolean).join(' · ');
  return `<div class="n2-issue ${i.level}">
    <span class="n2-issue-ico">${i.level === 'error' ? '✖' : '⚠'}</span>
    ${place ? `<span class="n2-issue-where">[${esc(place)}]</span>` : ''}
    <span class="n2-issue-text">${esc(t(`chk:${i.code}`, i.detail ?? ''))}</span>
  </div>`;
}

function renderResults() {
  const el = $('val-results');
  const current = result && result.fs === app.fs ? result : null;
  if (!current) { el.innerHTML = `<span>${esc(t('validateHint'))}</span>`; return; }
  if (!current.issues.length) { el.innerHTML = `<span class="n2-issue-ok">✔ ${esc(t('checkClean'))}</span>`; return; }
  const errors = current.issues.filter((i) => i.level === 'error').length;
  const warnings = current.issues.length - errors;
  el.innerHTML = `<div class="n2-issue-summary">${esc(t('checkSummary', errors, warnings))}</div>${current.issues.map(issueLine).join('')}`;
}

function renderExportPage() {
  const open = !!app.meta;
  $('btn-validate').disabled = !open || busy;
  $('btn-netex').disabled = !open || busy;
  $('chk-zip').disabled = !open;
  $('chk-zip').checked = app.settings.exportAsZip !== false;
  renderResults();
  renderStatus();
}

export function initExportPage() {
  onRefresh(renderExportPage);
  $('btn-validate').addEventListener('click', () => exclusive(async () => { await runCheck(); }));
  $('btn-netex').addEventListener('click', () => exclusive(runExport));
  $('chk-zip').addEventListener('change', () => {
    app.settings.exportAsZip = $('chk-zip').checked;
    runAction(persistSettings);
  });
  renderExportPage();
}
