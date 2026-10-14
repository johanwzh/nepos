// The frame around the pages: theme, language, tabs, side panels, keyboard shortcuts, status
// bar, the empty-state placeholder, the project name popover and the message dialog.
// Ported from Nepos 1.5.7 (nepos.html lines 2014–2066, 3407–3568, 3824–3908) and adapted.
import { app } from './state.js';
import { t, setLang } from '../i18n/strings.js';
import { writeSettings } from '../project/settings.js';
import { writeProjectName } from '../project/meta.js';
import { VERSION } from '../version.js';

/** @param {string} id */
export const $ = (id) => /** @type {any} */ (document.getElementById(id));

/** @type {(() => void)[]} */
const refreshers = [];

/** Register a redraw function; it runs on every refreshAll(). @param {() => void} fn */
export function onRefresh(fn) {
  refreshers.push(fn);
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
  if (app.dirty) return;
  app.dirty = true;
  refreshAll();
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
  $('btn-theme').textContent = theme === 'light' ? t('darkMode') : t('lightMode');
}

// ─── Language ───────────────────────────────────────────────────────────────
export function applyLang() {
  setLang(app.settings.lang);
  document.documentElement.lang = app.settings.lang;
  document.querySelectorAll('[data-lk]').forEach((el) => {
    const value = t(/** @type {HTMLElement} */ (el).dataset.lk);
    if (typeof value === 'string') el.textContent = value;
  });
  $('btn-lang').textContent = app.settings.lang === 'no' ? 'EN' : 'NO';
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
function updateProjectButton() {
  const btn = $('delivery-btn');
  btn.textContent = app.meta ? (app.meta.name || `(${app.meta.codespace})`) : t('noProject');
  btn.classList.toggle('loaded', !!app.meta);
  btn.title = app.meta ? `${app.meta.name} · ${app.meta.codespace}` : '';
}

function openPop() {
  $('pop-name').value = app.meta?.name ?? '';
  $('pop-codespace').textContent = app.meta?.codespace ?? '';
  const rect = $('delivery-btn').getBoundingClientRect();
  const pop = $('delivery-pop');
  pop.style.left = `${rect.left}px`;
  pop.style.top = `${rect.bottom + 4}px`;
  pop.classList.add('open');
  $('pop-name').focus();
}

function closePop() {
  $('delivery-pop').classList.remove('open');
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

// ─── Panels (F5 / F6) ───────────────────────────────────────────────────────
const panels = {
  left: { el: null, rz: null, w: 180, open: true },
  right: { el: null, rz: null, w: 300, open: false },
};

/** @type {(() => void)[]} */
const panelListeners = [];

/** @param {'left' | 'right'} side */
export function panelOpen(side) {
  return panels[side].open;
}

/** Called after a side panel opens or closes. @param {() => void} fn */
export function onPanelToggle(fn) {
  panelListeners.push(fn);
}

/** @param {'left' | 'right'} side */
function applyPanel(side) {
  const p = panels[side];
  p.el.style.width = p.open ? `${p.w}px` : '0';
  p.rz.style.display = p.open ? '' : 'none';
  $('btn-p5').classList.toggle('on', panels.left.open);
  $('btn-p6').classList.toggle('on', panels.right.open);
}

/** @param {'left' | 'right'} side */
function togglePanel(side) {
  panels[side].open = !panels[side].open;
  applyPanel(side);
  for (const fn of panelListeners) fn();
}

// ─── Pages (F2 / F3 / F4) ───────────────────────────────────────────────────
let curPage = 'edit';

/** @param {string} id */
/** @type {(() => void)[]} */
const beforeViewChange = [];

/** Run before the view changes away from the edit page (e.g. commit a half-typed cell). @param {() => void} fn */
export function onBeforeViewChange(fn) {
  beforeViewChange.push(fn);
}

export function setPage(id) {
  if (curPage === 'edit' && id !== 'edit') for (const fn of beforeViewChange) fn();
  curPage = id;
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach((tab) => tab.classList.remove('active'));
  $(`page-${id}`)?.classList.add('active');
  document.querySelector(`.tab[data-page="${id}"]`)?.classList.add('active');
  for (const fn of refreshers) fn();
}

export function currentPage() {
  return curPage;
}

/** Wire up the shell once at start-up. */
export function initShell() {
  $('el-ver').textContent = `v${VERSION}`;

  $('btn-theme').addEventListener('click', () => {
    app.settings.theme = resolvedTheme() === 'light' ? 'dark' : 'light';
    applyTheme();
    runAction(persistSettings);
  });
  $('btn-lang').addEventListener('click', () => {
    app.settings.lang = app.settings.lang === 'no' ? 'en' : 'no';
    refreshAll();
    runAction(persistSettings);
  });

  $('delivery-btn').addEventListener('click', () => {
    if (!app.meta) return;
    $('delivery-pop').classList.contains('open') ? closePop() : openPop();
  });
  $('pop-cancel').addEventListener('click', closePop);
  document.addEventListener('mousedown', (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    if (!target.closest('#delivery-pop') && !target.closest('#delivery-btn')) closePop();
  });
  $('pop-save').addEventListener('click', async () => {
    if (!app.fs || !app.meta) return;
    const fs = app.fs, meta = app.meta;
    const ok = await runAction(async () => { app.meta = await writeProjectName(fs, meta, $('pop-name').value); }, $('pop-save'));
    if (!ok) return;
    closePop();
    refreshAll();
  });

  $('msg-close').addEventListener('click', () => $('msg-dlg').close());

  panels.left.el = $('panel-left');
  panels.right.el = $('panel-right');
  panels.left.rz = $('rh-left');
  panels.right.rz = $('rh-right');
  applyPanel('left');
  applyPanel('right');
  $('btn-p5').addEventListener('click', () => togglePanel('left'));
  $('btn-p6').addEventListener('click', () => togglePanel('right'));
  $('close-left').addEventListener('click', () => togglePanel('left'));
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
    const dx = drag.side === 'left' ? e.clientX - drag.x0 : drag.x0 - e.clientX;
    panels[drag.side].w = Math.max(120, Math.min(480, drag.w0 + dx));
    panels[drag.side].el.style.width = `${panels[drag.side].w}px`;
  });
  document.addEventListener('mouseup', () => {
    if (!drag) return;
    $(`rh-${drag.side}`).classList.remove('active');
    drag = null;
  });

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => setPage(/** @type {HTMLElement} */ (tab).dataset.page));
  });

  // View and panel shortcuts (navigation spec §8). Capture phase, so they work from text fields and
  // the grid never sees them; nothing changes behind an open window. F2 belongs to the grid.
  document.addEventListener('keydown', (e) => {
    if (document.querySelector('dialog[open]')) return;
    /** @type {Record<string, string>} */
    const byDigit = { 1: 'edit', 2: 'assets', 3: 'export' };
    const view = e.altKey && !e.ctrlKey && !e.metaKey ? byDigit[e.key] : e.key === 'F3' ? 'assets' : e.key === 'F4' ? 'export' : null;
    if (view) { e.preventDefault(); e.stopPropagation(); setPage(view); return; }
    if (e.key === 'F5' || e.key === 'F6') {
      e.preventDefault(); e.stopPropagation();
      if (curPage !== 'edit') setPage('edit');
      togglePanel(e.key === 'F5' ? 'left' : 'right');
    }
  }, true);

  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
}
