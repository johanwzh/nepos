// The Export page (F4): check the whole project, then write the NeTEx delivery into
// exports/<time>/ in the project folder. Errors block the export; warnings never do.
import { app } from './state.js';
import { $, onRefresh, runAction, beforeLeave, persistSettings } from './shell.js';
import { t } from '../i18n/strings.js';
import { parseERN } from '../core/ern/parse.js';
import { validateOrgs } from '../core/orgs.js';
import { checkForExport } from '../core/export-check.js';
import { buildNeTExFiles } from '../core/netex/export.js';
import { writeExport } from '../project/export.js';
import { quayInfo, loadProjectQuays } from './quays.js';

/** @param {string} s */
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The last check, for the project it was made for. */
let result = /** @type {{ fs: any, issues: import('../core/export-check.js').CheckIssue[] } | null} */ (null);
let status = /** @type {{ fs: any, text: string, bad: boolean } | null} */ (null);

/**
 * Save first, look the Quays up again (spec §7.2), parse the saved routes and check them.
 * @returns {Promise<{ routes: { code: string, rs: any }[], issues: import('../core/export-check.js').CheckIssue[] } | null>}
 *   null when the user cancelled
 */
async function runCheck() {
  if (!app.meta || !app.fs) return null;
  if (!(await beforeLeave('export'))) return null;
  $('val-results').textContent = t('checking');
  await loadProjectQuays();
  const routes = app.routes.map((r) => ({
    code: r.code,
    status: r.status,
    rs: r.status === 'damaged' ? null : parseERN(r.text, { lang: /** @type {'no' | 'en'} */ (app.settings.lang) }),
  }));
  const orgsProblem = app.orgsError ? 'unreadable'
    : app.orgsStatus === 'not-saved' || validateOrgs(app.orgs).length ? 'not-saved' : '';
  const issues = checkForExport({ routes, orgs: app.orgs, orgsProblem, quayInfo });
  result = { fs: app.fs, issues };
  renderResults();
  return { routes: routes.map(({ code, rs }) => ({ code, rs })), issues };
}

/** @param {HTMLButtonElement | null} trigger */
async function runExport(trigger) {
  const checked = await runCheck();
  if (!checked || !app.fs || !app.meta) return;
  if (checked.issues.some((i) => i.level === 'error')) {
    setStatus(t('exportBlocked'), true);
    return;
  }
  const files = buildNeTExFiles({
    codespace: app.meta.codespace,
    deliveryName: app.meta.name,
    routes: checked.routes,
    orgs: app.orgs,
  });
  const fs = app.fs, codespace = app.meta.codespace, asZip = app.settings.exportAsZip !== false;
  let written = '';
  const ok = await runAction(async () => { written = await writeExport(fs, files, { codespace, asZip }); }, trigger);
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
  $('btn-validate').disabled = !open;
  $('btn-netex').disabled = !open;
  $('chk-zip').disabled = !open;
  $('chk-zip').checked = app.settings.exportAsZip !== false;
  renderResults();
  renderStatus();
}

export function initExportPage() {
  onRefresh(renderExportPage);
  $('btn-validate').addEventListener('click', () => { runCheck(); });
  $('btn-netex').addEventListener('click', () => { runExport($('btn-netex')); });
  $('chk-zip').addEventListener('change', () => {
    app.settings.exportAsZip = $('chk-zip').checked;
    runAction(persistSettings);
  });
  renderExportPage();
}
