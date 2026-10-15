// The open route: loading it into the grid, the route header (name, line, mode, periods and
// dates), the comment bar, the footer (direction, organisations, save, delete), saving, new and
// delete. Ported from Nepos 1.5.7 (nepos.html lines 2556–2643, 2694–2706, 3008–3048, 3153–3405)
// with the Nepos 2 project layer, read-only damaged routes and a guard for unsaved changes.
import { app } from './state.js';
import { $, onRefresh, refreshAll, runAction, markDirty, setBeforeLeave, beforeLeave, showMessage, currentPage, onBeforeViewChange, notifyLinesChanged } from './shell.js';
import { t } from '../i18n/strings.js';
import { grid, loadGrid, gridData, markGridClean, clearGrid, render as renderGrid, onGridChange, commitPending, onGridRender } from './grid.js';
import { newRouteState, fillMissingPeriod, gridKey, periodsOf } from './route-state.js';
import { parseERN } from '../core/ern/parse.js';
import { serializeERN } from '../core/ern/serialize.js';
import { checkRouteFile } from '../core/integrity/check.js';
import { orgNameList, findRole, addToCopy } from '../core/orgs.js';
import { createOrgPicker } from './org-picker.js';
import { openModeMenu } from './mode-menu.js';
import { modeIconSvg } from './mode-icons.js';
import { ernCodeFor } from '../core/modes.js';
import { modeLabel, submodeLabel } from '../i18n/modes.js';
import { writeOrgs } from '../project/orgs-store.js';
import { pruneProjectCopy } from './org-register.js';
import { compareRouteCodes } from '../core/route-codes.js';
import { writeRoute } from '../project/routes.js';
import { showProjectCheck } from './project-ui.js';
import { renderTimeline } from './timeline.js';
import { issueMessage } from './messages.js';
import { parkOpenLine, takeDraft, unsavedCodes } from './drafts.js';

/** @param {string} s */
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const activeEntry = () => app.routes.find((r) => r.code === app.activeRoute) ?? null;
const isReadOnly = () => activeEntry()?.status === 'damaged';
/** Whether the open route is read-only (damaged). */
export const isRouteReadOnly = () => isReadOnly();

/** Store the visible grid back into the route state. */
function saveGridToState() {
  if (app.routeState && grid.active) app.routeState.grids[gridKey(app.routeState)] = gridData();
}

/** Finish any typing in the grid and store it in the route state (before changing the structure). */
export function storeGrid() {
  commitPending();
  saveGridToState();
}

/**
 * Show another period (of any table set: the table set follows the period).
 * @param {number} perId
 * @param {{ store?: boolean }} [opts] store: false after deleting the shown period or table set —
 *   the grid on screen belongs to the deleted one and must not be stored under the new key
 */
function switchPeriod(perId, { store = true } = {}) {
  if (store) {
    commitPending();
    saveGridToState();
  }
  const rs = app.routeState;
  const per = rs.periods.find((/** @type {any} */ p) => p.id === perId) ?? periodsOf(rs, rs.activeSet)[0];
  rs.activePer = per.id;
  rs.activeSet = per.setId;
  loadGrid(rs.grids[gridKey(rs)] ?? { stops: [], cols: [] }, { readOnly: isReadOnly() });
  refreshAll();
}

/**
 * Show another table set, at its first period.
 * @param {number} setId
 * @param {{ store?: boolean }} [opts]
 */
export function switchTableSet(setId, opts = {}) {
  const per = periodsOf(app.routeState, setId)[0];
  if (per) switchPeriod(per.id, opts);
}

/** A period's label: its calendars' names (timetable structure spec §4). @param {any} per */
export function periodLabel(per) {
  const names = per.calendarIds.map((/** @type {string} */ id) => app.calendars.find((c) => c.id === id)?.name ?? '⚠ ' + id);
  return names.length ? names.join(' + ') : t('periodNoCalendar');
}

let saving = false;

/**
 * Save the open route (backup first). Returns false when nothing was saved.
 * @param {HTMLButtonElement | null} [trigger]
 */
export async function saveRoute(trigger = null) {
  if (!app.fs || !app.meta || !app.activeRoute || !app.routeState || isReadOnly() || saving) return false;
  commitPending();
  const code = app.activeRoute;
  const fs = app.fs;
  const text = currentText();
  const { status, issues } = checkRouteFile(text);
  // Never write a file that Nepos itself would then refuse to edit.
  if (status === 'damaged') {
    showMessage(t('saveWouldDamage', issues.filter((i) => i.severity === 'damaged').map(issueMessage).join('\n')));
    return false;
  }
  saving = true; // one save at a time (Ctrl+S held down, or Ctrl+S during a button save)
  const ok = await runAction(() => writeRoute(fs, code, text), trigger).finally(() => { saving = false; });
  if (!ok) return false;
  app.routes = app.routes.map((r) => (r.code === code ? { code, text, status, issues } : r));
  await pruneProjectCopy();
  // Edits made while the file was being written are not in it: they stay unsaved.
  if (app.activeRoute === code && currentText() === text) {
    app.dirty = false;
    markGridClean();
  }
  refreshAll();
  return true;
}

/** The open route as ERN text, including the grid on screen. */
function currentText() {
  saveGridToState();
  return serializeERN(app.routeState, /** @type {string} */ (app.activeRoute), { delivery: { name: app.meta.name, codespace: app.meta.codespace }, orgs: orgNameList(app.orgs) });
}

/** Ask to save unsaved changes. Resolves false when the user wants to stay. */
/** @param {string} [reason] */
async function confirmLeave(reason) {
  if (app.routeState) storeGrid(); // a half-typed time or name counts as a change
  const n = unsavedCodes().length;
  if (!n) return true;
  if (!confirm(t(reason === 'export' ? 'saveAllBeforeExport' : 'saveAllBeforeLeave', n))) return false;
  return saveAllRoutes();
}

/**
 * Save the open line and every line with unsaved changes (navigation spec §2). Returns false when
 * any could not be saved; the message names them.
 * @param {HTMLButtonElement | null} [trigger]
 */
export async function saveAllRoutes(trigger = null) {
  return saveRoutes(unsavedCodes(), trigger);
}

/**
 * Save the given lines that have unsaved changes (the open one and parked ones). Returns false
 * when any could not be saved; the message names them.
 * @param {string[]} codes
 * @param {HTMLButtonElement | null} [trigger]
 */
export async function saveRoutes(codes, trigger = null) {
  if (!app.fs || !app.meta) return false;
  const fs = app.fs, meta = app.meta;
  /** @type {string[]} */ const failed = [];
  if (app.routeState && app.dirty && codes.includes(/** @type {string} */ (app.activeRoute)) && !(await saveRoute(trigger))) failed.push(/** @type {string} */ (app.activeRoute));
  for (const [code, rs] of [...app.drafts].filter(([c]) => codes.includes(c))) {
    const text = serializeERN(rs, code, { delivery: { name: meta.name, codespace: meta.codespace }, orgs: orgNameList(app.orgs) });
    const { status, issues } = checkRouteFile(text);
    if (status === 'damaged') { failed.push(code); continue; }
    try {
      await writeRoute(fs, code, text);
      app.routes = app.routes.map((r) => (r.code === code ? { code, text, status, issues } : r));
      app.drafts.delete(code);
    } catch {
      failed.push(code);
    }
  }
  await pruneProjectCopy();
  if (failed.length) showMessage(t('saveAllFailed', failed.join(', ')));
  refreshAll();
  return !failed.length;
}

/** Throw away every unsaved change, after asking; the open line is read again from its file. */
export function discardAllChanges() {
  const n = unsavedCodes().length;
  if (!n || !confirm(t('discardAllConfirm', n))) return;
  app.drafts.clear();
  const entry = activeEntry();
  if (entry) {
    const rs = parseERN(entry.text, { lang: /** @type {'no' | 'en'} */ (app.settings.lang) });
    fillMissingPeriod(rs);
    app.routeState = rs;
    loadGrid(rs.grids[gridKey(rs)] ?? { stops: [], cols: [] }, { readOnly: entry.status === 'damaged' }); // drops a half-typed cell too
  }
  app.dirty = false;
  refreshAll();
}

/** Close the open route (after the leave check has passed). */
export function closeRoute() {
  app.activeRoute = null;
  app.routeState = null;
  app.dirty = false;
  clearGrid();
  refreshAll();
}

/**
 * Open a route in the editor.
 * @param {string} code
 * @returns {Promise<boolean>} false when the user chose to stay on the current route
 */
export async function selectRoute(code) {
  if (code === app.activeRoute) return true;
  const entry = app.routes.find((r) => r.code === code);
  if (!entry) return false;
  // Switching lines never asks (navigation spec §2): unsaved edits stay with their line.
  if (app.routeState) { storeGrid(); parkOpenLine(); }
  const draft = takeDraft(code);
  const rs = draft ?? parseERN(entry.text, { lang: /** @type {'no' | 'en'} */ (app.settings.lang) });
  fillMissingPeriod(rs);
  app.activeRoute = code;
  app.routeState = rs;
  app.dirty = !!draft;
  loadGrid(rs.grids[gridKey(rs)] ?? { stops: [], cols: [] }, { readOnly: entry.status === 'damaged' });
  refreshAll();
  return true;
}

/** @param {HTMLButtonElement | null} [trigger] */
/** Header and footnote fields keep their text on "change" (blur); Ctrl+S and view keys commit it first. */
function commitFocusedField() {
  const el = document.activeElement;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) el.dispatchEvent(new Event('change', { bubbles: true }));
}

export async function newRoute(trigger = null) {
  if (!app.fs || !app.meta) return;
  // Like switching lines, a new line never asks: the open line's edits are parked (navigation spec §2).
  // IDs carry no data and never change (line header spec §4): the route ID is a UUID.
  const code = crypto.randomUUID();
  const text = serializeERN(newRouteState(app.settings.lang), code, { delivery: { name: app.meta.name, codespace: app.meta.codespace }, orgs: [] });
  const fs = app.fs;
  const ok = await runAction(() => writeRoute(fs, code, text), trigger);
  if (!ok) return;
  const { status, issues } = checkRouteFile(text);
  app.routes = [...app.routes, { code, text, status, issues }].sort((a, b) => compareRouteCodes(a.code, b.code));
  await selectRoute(code);
}

// ─── Route header ───────────────────────────────────────────────────────────
function renderHeader() {
  const hdr = $('route-hdr');
  const rs = app.routeState;
  if (!rs) { hdr.innerHTML = '<span class="rh-hint" id="rh-hint"></span>'; return; }
  const ro = isReadOnly();
  const lang = app.settings.lang === 'en' ? 'en' : 'no';
  const per = rs.periods.find((/** @type {any} */ p) => p.id === rs.activePer);
  const dis = ro ? ' disabled' : '';
  const modeTitle = rs.mode ? [modeLabel(rs.mode, lang), rs.submode ? submodeLabel(rs.submode, lang) : ''].filter(Boolean).join(' · ') : t('pickMode');
  const brandKnown = app.brandings.some((b) => b.id === rs.brandingId);
  const brandOptions = [`<option value="">${esc(t('brandingNone'))}</option>`,
    ...[...app.brandings].sort((x, y) => x.name.localeCompare(y.name, 'nb')).map((b) => `<option value="${esc(b.id)}"${b.id === rs.brandingId ? ' selected' : ''}>${esc(b.name)}</option>`),
    ...(rs.brandingId && !brandKnown ? [`<option value="${esc(rs.brandingId)}" selected>⚠ ${esc(rs.brandingId)}</option>`] : [])].join('');
  hdr.innerHTML = `
    <div class="rh-parta">
      <input class="rh-name" id="rh-name" value="${esc(rs.routeName)}" placeholder="${esc(t('routeNamePh'))}"${dis}>
      <div class="rh-row">
        <button class="rh-mode-tile${rs.mode ? '' : ' empty'}" id="rh-mode-tile" title="${esc(modeTitle)}"${dis}>${modeIconSvg(rs.mode, rs.submode)}</button>
        <input class="rh-public" id="rh-public" value="${esc(rs.publicCode)}" placeholder="${esc(t('publicCodePh'))}"${dis}>
        <label class="rh-private-box" title="${esc(t('privateCodeHint'))}"><span class="rh-private-cap">${esc(t('privateCodeLabel'))}</span><input class="rh-private" id="rh-private" value="${esc(rs.privateCode)}" placeholder="—"${dis}></label>
      </div>
    </div>
    <div class="rh-side">
      <label class="rh-brand-chip${rs.brandingId ? '' : ' empty'}"><span class="org-pick-role">${esc(t('brandingLabel'))}</span><select class="rh-branding" id="rh-branding"${dis}>${brandOptions}</select></label>
      <div class="rh-orgs" id="rh-orgs"></div>
    </div>
  `;

  for (const id of ['rh-name', 'rh-public', 'rh-private']) $(id).addEventListener('keydown', (/** @type {Event} */ e) => e.stopPropagation());
  renderOrgPickers();
  if (ro) return;
  $('rh-name').addEventListener('change', () => { rs.routeName = $('rh-name').value.trim(); markDirty(); });
  $('rh-public').addEventListener('change', () => { rs.publicCode = $('rh-public').value.trim(); markDirty(); });
  $('rh-private').addEventListener('change', () => { rs.privateCode = $('rh-private').value.trim(); markDirty(); });
  $('rh-branding').addEventListener('change', () => { rs.brandingId = $('rh-branding').value; markDirty(); renderHeader(); });
  $('rh-mode-tile').addEventListener('click', () => openModeMenu($('rh-mode-tile'), { mode: rs.mode, submode: rs.submode, lang, onPick: (m, sub) => {
    rs.mode = m; rs.submode = sub; rs.transportMode = ernCodeFor(m, sub, rs.transportMode); markDirty(); renderHeader();
  } }));
}

// ─── Calendars of the table set ──────────────────────────────────────────────
/** The calendars the open table set runs on (its period's #KAL), as chips under the tabs, picked
 * from a multi-choice list. An older file with several periods in one table set gets a selector. */
function renderCalendarBar() {
  const bar = $('cal-bar');
  const rs = app.routeState;
  closeCalendarPop();
  if (!rs) { bar.innerHTML = ''; bar.style.display = 'none'; renderTimeline(); return; }
  bar.style.display = '';
  const ro = isReadOnly();
  const per = rs.periods.find((/** @type {any} */ p) => p.id === rs.activePer);
  const periods = periodsOf(rs, rs.activeSet);
  const ids = /** @type {string[]} */ (per?.calendarIds ?? []);
  const chips = ids.map((id) => {
    const cal = app.calendars.find((c) => c.id === id);
    return `<span class="cal-chip${cal ? '' : ' n2-missing'}" data-cal="${esc(id)}">${esc(cal?.name ?? '⚠ ' + id)}${ro ? '' : `<button class="cal-chip-x" title="${esc(t('removeCalendar'))}">×</button>`}</span>`;
  }).join('');
  const legacy = periods.length > 1 ? `<select class="rh-select" id="sel-period" title="${esc(t('periodLabel'))}">${periods.map((/** @type {any} */ p) =>
    `<option value="${p.id}"${p.id === rs.activePer ? ' selected' : ''}>${esc(periodLabel(p))}</option>`).join('')}</select>` : '';
  bar.innerHTML = `<span class="cal-bar-label">${esc(t('calendarsLabel'))}</span>${ro ? '' : `<button class="cal-add" id="cal-add">${esc(t('addCalendar'))} ▾</button>`}${legacy}${chips || `<span class="cal-bar-none">${esc(t('periodNoCalendar'))}</span>`}`;
  $('sel-period')?.addEventListener('change', () => switchPeriod(+$('sel-period').value));
  renderTimeline();
  if (ro || !per) return;
  bar.querySelectorAll('.cal-chip-x').forEach((/** @type {HTMLElement} */ b) => b.addEventListener('click', () => {
    const id = /** @type {HTMLElement} */ (b.closest('.cal-chip')).dataset.cal;
    per.calendarIds = per.calendarIds.filter((/** @type {string} */ c) => c !== id);
    markDirty();
    renderCalendarBar();
  }));
  $('cal-add').addEventListener('click', () => openCalendarPop(per));
}

/** @type {HTMLElement | null} */
let calPop = null;
function closeCalendarPop() {
  calPop?.remove();
  calPop = null;
  document.removeEventListener('mousedown', calPopOutside, true);
}
/** @param {MouseEvent} e */
function calPopOutside(e) {
  const target = /** @type {HTMLElement} */ (e.target);
  if (calPop && !calPop.contains(target) && target.id !== 'cal-add') closeCalendarPop();
}

/** A list of every calendar with a tick box; ticking adds or removes it at once. @param {any} per */
function openCalendarPop(per) {
  if (calPop) { closeCalendarPop(); return; }
  calPop = document.createElement('div');
  calPop.id = 'cal-pop';
  calPop.className = 'cal-pop';
  const cals = [...app.calendars].sort((a, b) => a.name.localeCompare(b.name, 'nb'));
  calPop.innerHTML = cals.length
    ? cals.map((c) => `<label class="cal-pop-row"><input type="checkbox" value="${esc(c.id)}"${per.calendarIds.includes(c.id) ? ' checked' : ''}> ${esc(c.name || '—')}</label>`).join('')
    : `<div class="cal-pop-none">${esc(t('noCalendarsYet'))}</div>`;
  calPop.addEventListener('change', (e) => {
    const box = /** @type {HTMLInputElement} */ (e.target);
    per.calendarIds = box.checked
      ? [...per.calendarIds.filter((/** @type {string} */ c) => c !== box.value), box.value]
      : per.calendarIds.filter((/** @type {string} */ c) => c !== box.value);
    const pop = calPop;
    calPop = null; // keep the list open while the chips redraw
    markDirty();
    renderCalendarBarKeepingPop(pop);
  });
  document.body.appendChild(calPop);
  placeCalendarPop();
  document.addEventListener('mousedown', calPopOutside, true);
}

/** Under the "+ Kalender" button, measured now and once more after layout has settled. */
function placeCalendarPop() {
  const place = () => {
    const btn = document.getElementById('cal-add');
    if (!calPop || !btn) return;
    const r = btn.getBoundingClientRect();
    calPop.style.left = `${r.left}px`;
    calPop.style.top = `${r.bottom + 2}px`;
  };
  place();
  requestAnimationFrame(place);
}

/** Redraw the chips without closing the open list. @param {HTMLElement | null} pop */
function renderCalendarBarKeepingPop(pop) {
  calPop = null;
  const keep = pop;
  pop?.remove();
  renderCalendarBar();
  if (keep) { document.body.appendChild(keep); calPop = keep; placeCalendarPop(); document.addEventListener('mousedown', calPopOutside, true); }
}

// ─── Comment bar (#KOM) ─────────────────────────────────────────────────────
function renderCommentBar() {
  const el = $('kom-bar');
  const rs = app.routeState;
  if (!rs) { el.style.display = 'none'; el.onclick = null; return; }
  el.style.display = '';
  const text = rs.kom?.trim() || '';
  el.innerHTML = `<span class="kom-icon">✎</span><span class="kom-text${text ? '' : ' empty'}">${text ? esc(text) : esc(t('komPlaceholder'))}</span>`;
  el.onclick = isReadOnly() ? null : () => {
    el.innerHTML = `<input class="kom-edit" placeholder="${esc(t('komPlaceholder'))}">`;
    const input = el.querySelector('.kom-edit');
    input.value = rs.kom || '';
    input.focus();
    input.select();
    input.addEventListener('keydown', (/** @type {KeyboardEvent} */ e) => {
      e.stopPropagation();
      if (e.key === 'Enter' || e.key === 'Escape') input.blur();
    });
    input.addEventListener('blur', () => {
      // Single line: the comment is one ERN record.
      const value = input.value.replace(/[\r\n]+/g, ' ').trim();
      if (value !== (rs.kom || '').trim()) { rs.kom = value; markDirty(); }
      renderCommentBar();
    });
    el.onclick = null;
  };
}

// ─── Footer ─────────────────────────────────────────────────────────────────
function renderFooter() {
  const el = $('edit-footer');
  const rs = app.routeState;
  if (!rs) { el.classList.remove('visible'); el.innerHTML = ''; return; }
  el.classList.add('visible');
  const ro = isReadOnly();

  el.innerHTML = `
    <div class="ef-spacer"></div>
    ${ro ? `<span class="n2-readonly-note">${esc(t('statusDamaged'))}</span>` : `
    <span class="ef-state" id="ef-state">${app.dirty ? `● ${esc(t('unsavedChanges'))}` : ''}</span>
    <button class="ef-discard" id="ef-discard"${app.dirty ? '' : ' disabled'}>${esc(t('discardLine'))}</button>
    <button class="ef-save-btn${app.dirty ? ' dirty' : ''}" id="ef-save"${app.dirty ? '' : ' disabled'}>${esc(t(app.dirty ? 'save' : 'savedBtn'))}</button>`}`;

  $('ef-save')?.addEventListener('click', () => { if (app.dirty) void saveRoute($('ef-save')); });
  $('ef-discard')?.addEventListener('click', discardLine);
}

/** "Forkast endringer": the open line goes back to its saved file, after asking. */
function discardLine() {
  const entry = activeEntry();
  if (!entry || !app.dirty || !confirm(t('discardLineConfirm'))) return;
  const rs = parseERN(entry.text, { lang: /** @type {'no' | 'en'} */ (app.settings.lang) });
  fillMissingPeriod(rs);
  app.routeState = rs;
  loadGrid(rs.grids[gridKey(rs)] ?? { stops: [], cols: [] }, { readOnly: entry.status === 'damaged' }); // drops a half-typed cell too
  app.dirty = false;
  refreshAll();
}

/** The authority and operator pickers in the header (organisations spec §4, line header spec §2). */
function renderOrgPickers() {
  const rs = app.routeState;
  const orgsEl = $('rh-orgs');
  if (!rs || !orgsEl) return;
  orgsEl.innerHTML = '';
  const ro = isReadOnly();
  const register = app.orgRegister?.companies ?? app.orgs;
  for (const role of /** @type {('authority' | 'operator')[]} */ (['authority', 'operator'])) {
    const ofRole = rs.sek.filter((/** @type {any} */ s) => (role === 'authority' ? s.isAuthority : s.isOperator));
    const first = ofRole[0];
    const hit = first ? findRole(register, first.orgId) : null;
    const known = hit && hit.role === role ? hit : null;
    const picker = createOrgPicker({
      role, currentId: first?.orgId ?? '', currentName: known?.company.name ?? first?.name ?? '',
      projectCompanies: app.orgs, registerCompanies: app.orgRegister?.companies ?? [],
      invalid: first && !known ? t('orgNotInRegister') : '', disabled: ro,
      onPick: (company) => pickOrg(role, company),
    });
    picker.id = `ef-pick-${role}`;
    orgsEl.appendChild(picker);
    if (ofRole.length > 1) {
      const note = document.createElement('span');
      note.className = 'ef-org-extra';
      note.textContent = t('orgExtra', ofRole.length, t(role === 'authority' ? 'rolesAuthority' : 'rolesOperator'));
      if (!ro) {
        const x = document.createElement('button');
        x.className = 'ef-org-extra-x';
        x.textContent = t('orgExtraRemove');
        x.addEventListener('click', () => {
          rs.sek = rs.sek.filter((/** @type {any} */ s) => s === first || !(role === 'authority' ? s.isAuthority : s.isOperator));
          markDirty();
          renderOrgPickers();
        });
        note.appendChild(x);
      }
      orgsEl.appendChild(note);
    }
  }

}

/**
 * Put a company on the open line in one role (replacing every #SEK of that role) and add it to the
 * project copy — unless the copy could not be read, which is never overwritten.
 * @param {'authority' | 'operator'} role
 * @param {import('../core/orgs.js').Company} company
 */
function pickOrg(role, company) {
  const rs = app.routeState;
  const entry = company[role];
  if (!rs || !entry) return;
  rs.sek = [
    ...rs.sek.filter((/** @type {any} */ s) => !(role === 'authority' ? s.isAuthority : s.isOperator)),
    { orgId: entry.id, isAuthority: role === 'authority', isOperator: role === 'operator', name: company.name },
  ];
  markDirty();
  renderOrgPickers();
  const fs = app.fs;
  const next = addToCopy(app.orgs, company, role);
  if (fs && !app.orgsError && next !== app.orgs) {
    app.orgs = next;
    void runAction(() => writeOrgs(fs, next));
  }
}

function renderReadOnlyBar() {
  const bar = $('grid-status');
  if (app.routeState && isReadOnly()) {
    bar.textContent = t('readOnlyBar');
    bar.classList.add('on', 'n2-readonly');
    bar.onclick = () => showProjectCheck({ always: true });
  } else if (bar.classList.contains('n2-readonly')) {
    bar.textContent = '';
    bar.classList.remove('on', 'n2-readonly');
    bar.onclick = null;
  }
}

function renderEditor() {
  if (!app.routeState) {
    if (grid.active) clearGrid();
    renderHeader();
    renderCalendarBar();
    renderCommentBar();
    renderFooter();
    renderReadOnlyBar();
    return;
  }
  renderHeader();
  renderCalendarBar();
  renderCommentBar();
  renderFooter();
  renderReadOnlyBar();
  if (grid.active) renderGrid();
}

let listenersWired = false;

export function initRouteEditor() {
  onGridRender(renderTimeline); // the column under the cursor shows on the timeline
  onRefresh(renderEditor);
  onGridChange(() => { if (app.dirty) notifyLinesChanged(); else markDirty(); });
  setBeforeLeave(confirmLeave);
  // Document and window listeners only once, also when tests reload the page markup.
  if (listenersWired) return;
  listenersWired = true;
  // Ctrl+S saves the open line, also from text fields (navigation spec §2); not behind a window.
  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 's' || document.querySelector('dialog[open]')) return;
    e.preventDefault();
    e.stopPropagation();
    if (currentPage() === 'edit' && app.activeRoute) { commitFocusedField(); void saveRoute(); }
  }, true);
  onBeforeViewChange(() => { commitFocusedField(); if (app.routeState) commitPending(); });
  window.addEventListener('beforeunload', (e) => {
    if (unsavedCodes().length) { e.preventDefault(); e.returnValue = ''; }
  });
}
