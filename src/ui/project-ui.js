// Opening, creating and reopening projects, and the empty-state placeholder.
import { app } from './state.js';
import { $, onRefresh, refreshAll, showMessage, runAction, beforeLeave, applyTheme, setPage } from './shell.js';
import { t } from '../i18n/strings.js';
import { createHandleFs } from '../project/fs.js';
import { openProject, updateOutdatedRoutes } from '../project/open.js';
import { createProject } from '../project/create.js';
import { findFileNameProblems, repairFileNames } from '../project/repair.js';
import { summarizeIntegrity } from '../core/integrity/check.js';
import { normalizeCodespace } from '../core/codespace.js';
import { recodeProject } from '../core/recode.js';
import { writeRoute } from '../project/routes.js';
import { writeBrandings } from '../project/brandings-store.js';
import { writeOrgs } from '../project/orgs-store.js';
import { writeProjectCodespace } from '../project/meta.js';
import { loadRecentFolders, rememberFolder, forgetFolder } from './recent-folders.js';

/** @type {() => Promise<void>} the menu reloads its list */
let onRecentChanged = async () => {};
/** @param {() => Promise<void>} fn */
export function setOnRecentChanged(fn) {
  onRecentChanged = fn;
}
import { clearGrid } from './grid.js';
import { loadProjectQuays } from './quays.js';
import { syncProjectCopy } from './org-register.js';
import { openFailureMessage, createFailureMessage, issueMessage, summaryMessage, fileNameMessage } from './messages.js';

/** Notes to show in the next project check (settings reset, format upgraded). @type {string[]} */
let pendingNotes = [];

const supported = () => typeof (/** @type {any} */ (window)).showDirectoryPicker === 'function';

/**
 * Load a project folder into the app.
 * @param {import('../project/fs.js').ProjectFs} fs
 * @param {{ handle?: any, sample?: boolean, landing?: boolean }} [opts] landing: show Oversikt (when the user opens it, not on a reload)
 * @returns {Promise<boolean>} whether the project opened
 */
export async function openFs(fs, { handle = null, sample = false, landing = false } = {}) {
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
    brandings: result.brandings, brandingsError: result.brandingsError,
    labels: result.labels ?? [], labelsError: result.labelsError ?? null,
    vehicles: result.vehicles ?? [], vehiclesError: result.vehiclesError ?? null, exports: result.exports ?? {},
    shapes: result.shapes ?? new Map(), shapesError: result.shapesError ?? '',
    calendars: result.calendars, calendarsError: result.calendarsError,
    routes: result.routes, activeRoute: null, routeState: null, dirty: false, drafts: new Map(), calendarDrafts: new Map(), calendarSelected: null, resourceDrafts: new Map(), resourceSelected: null, calendarMonth: '',
    fileNameProblems: await findFileNameProblems(fs),
  });
  pendingNotes = [];
  if (result.settingsRecovered) pendingNotes.push(t('settingsRecovered'));
  if (result.migrated) pendingNotes.push(t('migrated'));
  if (handle) {
    await rememberFolder(handle);
    await onRecentChanged();
    app.lastHandle = handle;
  }
  if (landing) setPage('home'); // Oversikt is a project's first page (dashboard design 2026-10-21)
  refreshAll();
  showProjectCheck();
  void syncProjectCopy(); // the organisation copy follows Entur's register (organisations spec §3.2)
  void loadProjectQuays(); // advisory, in the background (spec §7.2)
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
  return openRecent(handle);
}

/**
 * Open a remembered folder ("Åpne nylig", "Reopen"). A refused permission keeps the current
 * project and says so.
 * @param {any} handle
 */
export async function openRecent(handle) {
  if (!(await beforeLeave())) return false;
  let granted = false;
  try { granted = await hasPermission(handle, true); } catch { granted = false; }
  // A folder that was moved or deleted still has a handle; reading it fails.
  let exists = true;
  if (granted) try { await handle.values().next(); } catch { exists = false; }
  if (!granted || !exists) {
    if (confirm(t(exists ? 'recentNoAccessForget' : 'recentGoneForget', handle.name))) {
      await forgetFolder(handle);
      await onRecentChanged();
    }
    return false;
  }
  return openFs(createHandleFs(handle), { handle, landing: true });
}


export async function pickAndOpen() {
  if (!(await beforeLeave())) return;
  try {
    const handle = await /** @type {any} */ (window).showDirectoryPicker({ mode: 'readwrite', id: 'nepos-project' });
    await openHandle(handle);
  } catch (e) {
    if (/** @type {Error} */ (e).name !== 'AbortError') showMessage(t('open:error', /** @type {Error} */ (e).message));
  }
}

/** Close the open project (after the unsaved-changes check). */
export async function closeProject() {
  if (!app.meta || !(await beforeLeave())) return;
  Object.assign(app, { fs: null, handle: null, meta: null, routes: [], orgs: [], orgsError: null, brandings: [], brandingsError: null, labels: [], labelsError: null, vehicles: [], vehiclesError: null, exports: {}, shapes: new Map(), shapesError: '',
    calendars: [], calendarsError: null, activeRoute: null, routeState: null, dirty: false, drafts: new Map(), calendarDrafts: new Map(), calendarSelected: null, resourceDrafts: new Map(), resourceSelected: null, fileNameProblems: [], sampleMode: false });
  clearGrid();
  refreshAll();
}

/** Copy the project's data/ into an empty folder the user picks, then open the copy (navigation spec §6). */
export async function copyProject() {
  if (!app.fs || !app.meta || !(await beforeLeave())) return;
  const from = app.fs;
  let handle;
  try {
    handle = await /** @type {any} */ (window).showDirectoryPicker({ mode: 'readwrite', id: 'nepos-copy' });
  } catch (e) {
    if (/** @type {Error} */ (e).name !== 'AbortError') showMessage(t('open:error', /** @type {Error} */ (e).message));
    return;
  }
  const to = createHandleFs(handle);
  const found = (await to.list('')).filter((e) => !/^(desktop\.ini|thumbs\.db|\.ds_store)$/i.test(e.name));
  if (found.length) { showMessage(t('create:folder-not-empty', found.slice(0, 5).map((e) => e.name).join(', '))); return; }
  /** @param {string} dir */
  const copyTree = async (dir) => {
    for (const entry of await from.list(dir)) {
      const path = `${dir}/${entry.name}`;
      if (entry.kind === 'directory') await copyTree(path);
      else { const bytes = await from.readBytes(path); if (bytes) await to.writeBytes(path, bytes); }
    }
  };
  if (!(await runAction(() => copyTree('data')))) return;
  await openFs(to, { handle, landing: true });
}

// ─── New project dialog ─────────────────────────────────────────────────────
/** The language and theme when the dialog opened: Cancel goes back to them. */
let before = { lang: 'no', theme: 'system' };

export async function openNewDialog() {
  if (!(await beforeLeave())) return;
  $('new-name').value = '';
  $('new-cs').value = '';
  $('new-error').textContent = '';
  // Language and light/dark from the start (user 2026-10-19): a new project's settings start from these
  before = { lang: app.settings.lang, theme: app.settings.theme };
  for (const lang of ['no', 'en']) $(`new-lang-${lang}`).checked = app.settings.lang === lang;
  for (const theme of ['light', 'dark', 'system']) $(`new-theme-${theme}`).checked = app.settings.theme === theme;
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
  const ok = await runAction(async () => { result = await createProject(fs, { name: $('new-name').value, codespace: cs.value, settings: { lang: app.settings.lang, theme: app.settings.theme } }); }, $('new-create'));
  if (!ok) return;
  if (result.ok === false) {
    $('new-error').textContent = createFailureMessage(result);
    return;
  }
  $('new-dlg').close();
  await openFs(fs, { handle, landing: true });
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
// ─── Change the codespace (Prosjekt → Bytt codespace…) ───────────────────────
/** The codespace is locked in Project settings; changing it is a conversion of the whole project. */
export function openCodespaceDialog() {
  if (!app.meta || !app.fs) return;
  $('cs-current').textContent = app.meta.codespace;
  /** @type {HTMLInputElement} */ ($('cs-new')).value = '';
  $('cs-error').textContent = '';
  $('cs-dlg').showModal();
  $('cs-new').focus();
}

async function applyCodespace() {
  const fs = app.fs, meta = app.meta;
  if (!fs || !meta) return;
  const parsed = normalizeCodespace(/** @type {HTMLInputElement} */ ($('cs-new')).value);
  if (parsed.ok === false) { $('cs-error').textContent = t(`create:codespace-${parsed.error}`); return; }
  const from = meta.codespace, to = parsed.value;
  if (to === from) { $('cs-dlg').close(); return; }
  $('cs-dlg').close();
  // Unsaved edits still hold the old IDs: save them first (or stop).
  if (!(await beforeLeave())) return;
  // Nepos never edits a damaged file; those keep the old codespace and are named.
  const skipped = app.routes.filter((r) => r.status === 'damaged').map((r) => r.code);
  const out = recodeProject(from, to, { brandings: app.brandings, orgs: app.orgs,
    routes: app.routes.filter((r) => r.status !== 'damaged').map(({ code, text }) => ({ code, text })) });
  const ok = await runAction(async () => {
    for (const r of out.routes) if (r.changed) await writeRoute(fs, r.code, r.text); // backups kept
    if (!app.brandingsError && JSON.stringify(out.brandings) !== JSON.stringify(app.brandings)) await writeBrandings(fs, out.brandings);
    if (!app.orgsError && JSON.stringify(out.orgs) !== JSON.stringify(app.orgs)) await writeOrgs(fs, out.orgs);
    await writeProjectCodespace(fs, meta, to);
  });
  await openFs(fs, { handle: app.handle, sample: app.sampleMode });
  if (ok) showMessage([t('csDone', from, to), skipped.length ? t('csSkipped', skipped.join(', ')) : ''].filter(Boolean).join('\n'));
}

export async function initProjectUi({ restoreLast = true } = {}) {
  $('cs-ok').addEventListener('click', () => { void applyCodespace(); });
  $('cs-cancel').addEventListener('click', () => $('cs-dlg').close());
  $('cs-new').addEventListener('keydown', (/** @type {KeyboardEvent} */ e) => { if (e.key === 'Enter') { e.preventDefault(); void applyCodespace(); } });
  // Cancel (or Esc) keeps the open project's language and theme; they are the new project's only once it is made
  const revert = () => {
    if (app.settings.lang === before.lang && app.settings.theme === before.theme) return;
    app.settings.lang = before.lang; app.settings.theme = before.theme;
    applyTheme(); refreshAll();
  };
  $('new-cancel').addEventListener('click', () => { revert(); $('new-dlg').close(); });
  $('new-dlg').addEventListener('cancel', revert);
  // The choices apply at once, so the dialog itself shows them
  for (const lang of ['no', 'en']) $(`new-lang-${lang}`).addEventListener('change', () => { app.settings.lang = lang; refreshAll(); });
  for (const theme of ['light', 'dark', 'system']) $(`new-theme-${theme}`).addEventListener('change', () => { app.settings.theme = theme; applyTheme(); });
  $('new-create').addEventListener('click', createFromDialog);
  onRefresh(renderPlaceholder);
  if (!restoreLast) return;
  if (!supported()) return;
  const last = (await loadRecentFolders())[0]?.handle;
  if (!last) return;
  app.lastHandle = last;
  if (await hasPermission(last, false)) await openFs(createHandleFs(last), { handle: last, landing: true });
  else refreshAll();
}
