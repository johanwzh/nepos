// The frame around the pages: theme, language, tabs, side panels, keyboard shortcuts, status
// bar, the empty-state placeholder, the project name popover and the message dialog.
// Ported from Nepos 1.5.7 (nepos.html lines 2014–2066, 3407–3568, 3824–3908) and adapted.
import { app } from './state.js';
import { t, setLang } from '../i18n/strings.js';
import { writeSettings } from '../project/settings.js';
import { writeProjectName } from '../project/meta.js';
import { VERSION } from '../version.js';
import { applyColourTheme } from './theme.js';

/** @param {string} id */
export const $ = (id) => /** @type {any} */ (document.getElementById(id));

/** @type {(() => void)[]} */
const refreshers = [];

/** Add a listener unless it is there already: parts are started again (tests reload the page
 * markup), and a stacked copy would redraw again on every keystroke. @template T @param {T[]} list @param {T} fn */
export function addOnce(list, fn) {
  if (!list.includes(fn)) list.push(fn);
}

/** Register a redraw function; it runs on every refreshAll(). @param {() => void} fn */
export function onRefresh(fn) {
  addOnce(refreshers, fn);
}

/** Redraw everything: texts, theme, status bar, and every registered part. */
export function refreshAll() {
  applyLang();
  updateStatusBar();
  updateProjectButton();
  $('sample-banner').hidden = !app.sampleMode;
  for (const fn of refreshers) fn();
}

/** Save language and theme to the open project's private/settings.json. */
export async function persistSettings() {
  if (app.fs) await writeSettings(app.fs, app.settings);
}

/** Mark the open route as changed; refreshes once (status bar, save button). */
export function markDirty() {
  if (app.dirty) { notifyLinesChanged(); return; }
  app.dirty = true;
  refreshAll();
}

/** @type {(() => void)[]} */
const linesListeners = [];

/** The lines pane redraws when an open line changes, without a full refresh. @param {() => void} fn */
export function onLinesChanged(fn) {
  addOnce(linesListeners, fn);
}

export function notifyLinesChanged() {
  for (const fn of linesListeners) fn();
}


/** @type {(reason?: string) => Promise<boolean>} */
let leaveCheck = async () => true;

/** The route editor registers how to protect unsaved changes. @param {(reason?: string) => Promise<boolean>} fn */
export function setBeforeLeave(fn) {
  leaveCheck = fn;
}

/**
 * Ask before anything that closes or reads past the open route's unsaved changes.
 * Resolves false when the user wants to stay.
 * @param {string} [reason] 'export' words the question for an export
 */
export function beforeLeave(reason) {
  return leaveCheck(reason);
}

// ─── Theme ──────────────────────────────────────────────────────────────────
function resolvedTheme() {
  const theme = app.settings.theme;
  if (theme === 'light' || theme === 'dark') return theme;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme() {
  const theme = resolvedTheme();
  document.documentElement.setAttribute('data-theme', theme);
  applyColourTheme(); // a custom colour theme follows light/dark
}

// ─── Language ───────────────────────────────────────────────────────────────
export function applyLang() {
  setLang(app.settings.lang);
  document.documentElement.lang = app.settings.lang;
  document.querySelectorAll('[data-lk]').forEach((el) => {
    const value = t(/** @type {HTMLElement} */ (el).dataset.lk);
    if (typeof value === 'string') el.textContent = value;
  });
  applyTheme();
}

// ─── Status bar ─────────────────────────────────────────────────────────────
function updateStatusBar() {
  $('sb-proj').textContent = app.meta?.name || 'Nepos';
  const n = app.routes.length;
  $('sb-dot1').style.display = n ? '' : 'none';
  $('sb-nroutes').textContent = n ? t('routesCount', n) : '';
  $('sb-dot2').style.display = app.activeRoute ? '' : 'none';
  $('sb-route').textContent = app.activeRoute ?? '';
  $('sb-save').textContent = app.activeRoute ? (app.dirty ? t('unsaved') : t('saved')) : '';
}

// ─── Project button and popover ─────────────────────────────────────────────
/** The project as a title on the right of the top band: "Name (CODESPACE)". */
function updateProjectButton() {
  const el = $('project-title');
  el.textContent = app.meta ? `${app.meta.name}${app.meta.name ? ' ' : ''}(${app.meta.codespace})` : '';
  el.title = app.meta ? `${app.meta.name} · ${app.meta.codespace}` : '';
}

/** "Prosjektinnstillinger…" in the Prosjekt menu: the project's name and codespace. */
export function openProjectSettings() {
  if (!app.meta) return;
  $('pop-name').value = app.meta.name ?? '';
  $('pop-codespace').textContent = app.meta.codespace ?? '';
  $('settings-dlg').showModal();
  $('pop-name').focus();
}

function closePop() {
  if ($('settings-dlg').open) $('settings-dlg').close();
}

// ─── Messages ───────────────────────────────────────────────────────────────
/** Show a message in a dialog. @param {string} text */
export function showMessage(text) {
  $('msg-text').textContent = text;
  if (!$('msg-dlg').open) $('msg-dlg').showModal();
}

/**
 * Run something that writes to the project folder. The button that started it is disabled while
 * it runs (no double runs), and a failure is shown to the user instead of disappearing.
 * @param {() => Promise<any>} action
 * @param {HTMLButtonElement | null} [trigger]
 * @returns {Promise<boolean>} true when it succeeded
 */
export async function runAction(action, trigger = null) {
  if (trigger) trigger.disabled = true;
  try {
    await action();
    return true;
  } catch (e) {
    showMessage(t('actionFailed', /** @type {Error} */ (e).message));
    return false;
  } finally {
    if (trigger) trigger.disabled = false;
  }
}

// ─── Panels (lines, map) ───────────────────────────────────────────────────────
const panels = {
  left: { el: null, rz: null, w: 180, open: true },
  right: { el: null, rz: null, w: 300, open: false },
};

/** @type {(() => void)[]} */
const panelListeners = [];

/** @param {'left' | 'right'} side */
/** Open a side panel if it is closed. @param {'left' | 'right'} side */
export function openPanel(side) {
  if (!panels[side].open) togglePanel(side);
}

export function panelOpen(side) {
  return panels[side].open;
}

/** Called after a side panel opens or closes. @param {() => void} fn */
export function onPanelToggle(fn) {
  addOnce(panelListeners, fn);
}

/** @param {'left' | 'right'} side */
function applyPanel(side) {
  const p = panels[side];
  p.el.style.width = p.open ? `${p.w}px` : '0';
  p.rz.style.display = p.open ? '' : 'none';
  const strip = $('map-strip');
  if (strip) strip.hidden = panels.right.open; // the closed map is a strip at the timetable's edge
}

/** @param {'left' | 'right'} side */

function togglePanel(side) {
  panels[side].open = !panels[side].open;
  applyPanel(side);
  for (const fn of panelListeners) fn();
}

// ─── Pages (Alt+2…5) ───────────────────────────────────────────────────
let curPage = 'edit';

/** @param {string} id */
/** @type {(() => void)[]} */
const beforeViewChange = [];

/** Run before the view changes away from the edit page (e.g. commit a half-typed cell). @param {() => void} fn */
export function onBeforeViewChange(fn) {
  addOnce(beforeViewChange, fn);
}

export function setPage(id) {
  if (curPage === 'edit' && id !== 'edit') for (const fn of beforeViewChange) fn();
  curPage = id;
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
  document.querySelectorAll('.tab[data-page]').forEach((tab) => tab.classList.remove('active'));
  $(`page-${id}`)?.classList.add('active');
  document.querySelector(`.tab[data-page="${id}"]`)?.classList.add('active');
  for (const fn of refreshers) fn();
}

export function currentPage() {
  return curPage;
}

/** Wire up the shell once at start-up. */
let keysWired = false;

const TEXT_FIELDS = 'input:not([type]), input[type=text], input[type=search]';
/** Chrome offers the user's own name and address for fields it guesses are "name" fields, and
 * ignores autocomplete="off" for them; a value it does not know switches its autofill off. */
function noAutofill(/** @type {ParentNode} */ root) {
  if (root instanceof HTMLInputElement && root.matches(TEXT_FIELDS)) root.setAttribute('autocomplete', 'nepos-no-autofill');
  root.querySelectorAll?.(TEXT_FIELDS).forEach((el) => el.setAttribute('autocomplete', 'nepos-no-autofill'));
}
let autofillWatched = false;

export function initShell() {
  noAutofill(document);
  if (!autofillWatched) {
    autofillWatched = true;
    new MutationObserver((records) => {
      for (const r of records) for (const n of r.addedNodes) if (n.nodeType === 1) noAutofill(/** @type {Element} */ (n));
    }).observe(document.body, { childList: true, subtree: true });
  }
  $('el-ver').textContent = `v${VERSION}`;


  $('pop-cancel').addEventListener('click', closePop);
  $('pop-save').addEventListener('click', async () => {
    if (!app.fs || !app.meta) return;
    const fs = app.fs, meta = app.meta;
    const ok = await runAction(async () => { app.meta = await writeProjectName(fs, meta, $('pop-name').value); }, $('pop-save'));
    if (!ok) return;
    closePop();
    refreshAll();
  });

  $('msg-close').addEventListener('click', () => $('msg-dlg').close());

  panels.right.open = false; // the map starts closed
  panels.left.el = $('panel-left');
  panels.right.el = $('panel-right');
  panels.left.rz = $('rh-left');
  panels.right.rz = $('rh-right');
  applyPanel('left');
  applyPanel('right');
  panels.left.open = true; // the mini view is always shown (navigation spec §3.1)
  applyPanel('left');
  $('map-strip').addEventListener('click', () => togglePanel('right'));
  $('close-left').addEventListener('click', () => setPage('lines'));
  $('close-right').addEventListener('click', () => togglePanel('right'));

  /** @type {{ side: 'left' | 'right', x0: number, w0: number } | null} */
  let drag = null;
  document.querySelectorAll('.rz-handle').forEach((h) => {
    h.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const side = /** @type {'left' | 'right'} */ (/** @type {HTMLElement} */ (h).dataset.side);
      drag = { side, x0: /** @type {MouseEvent} */ (e).clientX, w0: panels[side].w };
      h.classList.add('active');
    });
  });
  document.addEventListener('mousemove', (e) => {
    if (!drag) return;
    // The map panel ('right') sits left of the timetable, the lines panel ('left') to its right.
    const dx = drag.side === 'right' ? e.clientX - drag.x0 : drag.x0 - e.clientX;
    panels[drag.side].w = Math.max(120, Math.min(480, drag.w0 + dx));
    panels[drag.side].el.style.width = `${panels[drag.side].w}px`;
  });
  document.addEventListener('mouseup', () => {
    if (!drag) return;
    $(`rh-${drag.side}`).classList.remove('active');
    drag = null;
  });

  document.querySelectorAll('.tab[data-page]').forEach((tab) => {
    tab.addEventListener('click', () => setPage(/** @type {string} */ (/** @type {HTMLElement} */ (tab).dataset.page)));
  });

  // View and panel shortcuts (navigation spec §8). Capture phase, so they work from text fields and
  // the grid never sees them; nothing changes behind an open window. F2 belongs to the grid.
  if (!keysWired) document.addEventListener('keydown', (e) => {
    if (document.querySelector('dialog[open]')) return;
    /** @type {Record<string, string>} */
    const byDigit = { 1: 'edit', 2: 'lines', 3: 'calendars', 4: 'assets', 5: 'export' };
    if (!e.altKey || e.ctrlKey || e.metaKey) return;
    // The map is part of the timetable page: Alt+M opens and closes it there.
    if (e.key.toLowerCase() === 'm') { if (curPage === 'edit') { e.preventDefault(); e.stopPropagation(); togglePanel('right'); } return; }
    const view = byDigit[e.key];
    if (view) { e.preventDefault(); e.stopPropagation(); setPage(view); }
  }, true);
  keysWired = true; // the document outlives a re-initialised shell (tests): one listener only

  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
}
