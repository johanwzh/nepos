// Opening, creating and reopening projects, and the empty-state placeholder.
import { app } from './state.js';
import { $, onRefresh, refreshAll, showMessage, runAction, beforeLeave } from './shell.js';
import { t } from '../i18n/strings.js';
import { createHandleFs } from '../project/fs.js';
import { openProject, updateOutdatedRoutes } from '../project/open.js';
import { createProject } from '../project/create.js';
import { findFileNameProblems, repairFileNames } from '../project/repair.js';
import { summarizeIntegrity } from '../core/integrity/check.js';
import { normalizeCodespace } from '../core/codespace.js';
import { loadLastFolder, saveLastFolder } from './last-folder.js';
import { openFailureMessage, createFailureMessage, issueMessage, summaryMessage, fileNameMessage } from './messages.js';

/** Notes to show in the next project check (settings reset, format upgraded). @type {string[]} */
let pendingNotes = [];

const supported = () => typeof (/** @type {any} */ (window)).showDirectoryPicker === 'function';

/**
 * Load a project folder into the app.
 * @param {import('../project/fs.js').ProjectFs} fs
 * @param {{ handle?: any, sample?: boolean }} [opts]
 * @returns {Promise<boolean>} whether the project opened
 */
export async function openFs(fs, { handle = null, sample = false } = {}) {
  let result;
  try {
    result = await openProject(fs);
  } catch (e) {
    showMessage(t('open:error', /** @type {Error} */ (e).message));
    return false;
  }
  if (result.ok === false) {
    showMessage(openFailureMessage(result));
    return false;
  }
  Object.assign(app, {
    fs, handle, sampleMode: sample,
    meta: result.meta, settings: result.settings,
    orgs: result.orgs, orgsError: result.orgsError,
    routes: result.routes, activeRoute: null, routeState: null, dirty: false, orgsStatus: '',
    fileNameProblems: await findFileNameProblems(fs),
  });
  pendingNotes = [];
  if (result.settingsRecovered) pendingNotes.push(t('settingsRecovered'));
  if (result.migrated) pendingNotes.push(t('migrated'));
  if (handle) {
    await saveLastFolder(handle);
    app.lastHandle = handle;
  }
  refreshAll();
  showProjectCheck();
  return true;
}

/** Notes for the project check dialog; cleared once shown. */
export function takePendingNotes() {
  const notes = pendingNotes;
  pendingNotes = [];
  return notes;
}

/**
 * The project check dialog: summary, notes, the files that need action with their issues,
 * file-name problems, and buttons to update outdated files and repair file names.
 * @param {{ always?: boolean }} [opts]
 */
export function showProjectCheck({ always = false } = {}) {
  const notes = takePendingNotes();
  const summary = summarizeIntegrity(app.routes);
  const attention = summary.outdated + summary.damaged + app.fileNameProblems.length + notes.length;
  if (!attention && !always) return;

  const body = $('check-body');
  const parts = [`<p><strong>${escapeHtml(summaryMessage(summary))}</strong></p>`];
  for (const note of notes) parts.push(`<p>${escapeHtml(note)}</p>`);

  for (const route of app.routes.filter((r) => r.status !== 'ok')) {
    const badge = `<span class="n2-badge ${route.status}">${escapeHtml(t(route.status === 'damaged' ? 'statusDamaged' : 'statusOutdated'))}</span>`;
    const issues = route.issues.filter((i) => i.severity !== 'note').map((i) => `<li>${escapeHtml(issueMessage(i))}</li>`).join('');
    parts.push(`<div class="n2-file"><div class="n2-file-head">${escapeHtml(route.code)} ${badge}</div><ul>${issues}</ul></div>`);
  }

  if (app.fileNameProblems.length) {
    const items = app.fileNameProblems.map((p) => `<li>${escapeHtml(fileNameMessage(p))}</li>`).join('');
    parts.push(`<div class="n2-file"><div class="n2-file-head">${escapeHtml(t('fileNamesTitle'))}</div><ul>${items}</ul></div>`);
  }
  body.innerHTML = parts.join('');

  const actions = $('check-actions');
  actions.innerHTML = '';
  if (summary.outdated > 0) actions.appendChild(button(t('updateOutdated', summary.outdated), updateOutdated));
  const repairable = app.fileNameProblems.filter((p) => p.rename).length;
  if (repairable > 0) actions.appendChild(button(t('repairNames', repairable), repairNames));
  actions.appendChild(button(t('close'), () => $('check-dlg').close(), true));

  if (!$('check-dlg').open) $('check-dlg').showModal();
}

/** @param {HTMLButtonElement} trigger */
async function updateOutdated(trigger) {
  if (!app.fs || !app.meta) return;
  const fs = app.fs;
  const ok = await runAction(async () => {
    const updated = await updateOutdatedRoutes(fs, { meta: app.meta, orgs: app.orgs, routes: app.routes });
    app.routes = app.routes.map((r) => updated.find((u) => u.code === r.code) ?? r);
  }, trigger);
  refreshAll();
  if (ok) showProjectCheck({ always: true });
}

/** @param {HTMLButtonElement} trigger */
async function repairNames(trigger) {
  if (!app.fs) return;
  if (!(await beforeLeave())) return;
  const fs = app.fs;
  await runAction(() => repairFileNames(fs, app.fileNameProblems), trigger);
  $('check-dlg').close();
  // Reopen either way: after a failure some of the renames may already have happened.
  await openFs(fs, { handle: app.handle, sample: app.sampleMode });
}

/** @param {any} handle */
async function hasPermission(handle, ask) {
  const opts = { mode: 'readwrite' };
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  return ask && (await handle.requestPermission(opts)) === 'granted';
}

/** @param {any} handle */
async function openHandle(handle) {
  if (!(await beforeLeave())) return false;
  if (!(await hasPermission(handle, true))) return false;
  return openFs(createHandleFs(handle), { handle });
}

async function pickAndOpen() {
  if (!(await beforeLeave())) return;
  try {
    const handle = await /** @type {any} */ (window).showDirectoryPicker({ mode: 'readwrite', id: 'nepos-project' });
    await openHandle(handle);
  } catch (e) {
    if (/** @type {Error} */ (e).name !== 'AbortError') showMessage(t('open:error', /** @type {Error} */ (e).message));
  }
}

// ─── New project dialog ─────────────────────────────────────────────────────
async function openNewDialog() {
  if (!(await beforeLeave())) return;
  $('new-name').value = '';
  $('new-cs').value = '';
  $('new-error').textContent = '';
  $('new-dlg').showModal();
  $('new-name').focus();
}

async function createFromDialog() {
  const cs = normalizeCodespace($('new-cs').value);
  if (cs.ok === false) {
    $('new-error').textContent = t(`create:codespace-${cs.error}`);
    return;
  }
  let handle;
  try {
    handle = await /** @type {any} */ (window).showDirectoryPicker({ mode: 'readwrite', id: 'nepos-project' });
  } catch (e) {
    if (/** @type {Error} */ (e).name !== 'AbortError') $('new-error').textContent = t('open:error', /** @type {Error} */ (e).message);
    return;
  }
  const fs = createHandleFs(handle);
  /** @type {any} */
  let result;
  const ok = await runAction(async () => { result = await createProject(fs, { name: $('new-name').value, codespace: cs.value }); }, $('new-create'));
  if (!ok) return;
  if (result.ok === false) {
    $('new-error').textContent = createFailureMessage(result);
    return;
  }
  $('new-dlg').close();
  await openFs(fs, { handle });
}

// ─── Placeholder (shown where the grid will be) ─────────────────────────────
/**
 * @param {string} label
 * @param {(trigger: HTMLButtonElement) => void} onClick receives the button, e.g. to disable it while working
 * @param {boolean} [primary]
 */
function button(label, onClick, primary = false) {
  const b = document.createElement('button');
  b.className = primary ? 'open-btn' : 'pop-btn';
  b.textContent = label;
  b.addEventListener('click', () => onClick(b));
  return b;
}

export function renderPlaceholder() {
  const actions = $('grid-ph-actions');
  const info = $('grid-ph-info');
  actions.innerHTML = '';
  info.innerHTML = '';
  $('grid-ph').style.display = app.routeState ? 'none' : '';

  if (!supported() && !app.sampleMode) {
    $('grid-ph-h').textContent = 'Nepos';
    $('grid-ph-s').textContent = t('unsupportedBrowser');
    return;
  }
  if (!app.meta) {
    $('grid-ph-h').textContent = 'Nepos';
    $('grid-ph-s').textContent = t('noProjectOpen');
    if (app.lastHandle) actions.appendChild(button(t('reopen', app.lastHandle.name), () => openHandle(app.lastHandle), true));
    actions.appendChild(button(t('openProject'), pickAndOpen, !app.lastHandle));
    actions.appendChild(button(t('newProject'), openNewDialog));
    return;
  }
  $('grid-ph-h').textContent = app.meta.name || app.meta.codespace;
  $('grid-ph-s').textContent = t('noRouteOpen');
}

/** @param {string} s */
function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Wire up project actions and, unless told not to, try to reopen the last folder.
 * @param {{ restoreLast?: boolean }} [opts]
 */
export async function initProjectUi({ restoreLast = true } = {}) {
  $('btn-open').addEventListener('click', pickAndOpen);
  $('btn-new').addEventListener('click', openNewDialog);
  $('new-cancel').addEventListener('click', () => $('new-dlg').close());
  $('new-create').addEventListener('click', createFromDialog);
  onRefresh(renderPlaceholder);
  if (!restoreLast) return;
  if (!supported()) {
    $('btn-open').disabled = true;
    $('btn-new').disabled = true;
    return;
  }
  const last = await loadLastFolder();
  if (!last) return;
  app.lastHandle = last;
  if (await hasPermission(last, false)) await openFs(createHandleFs(last), { handle: last });
  else refreshAll();
}
