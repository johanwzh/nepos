// The open route: loading it into the grid, the route header (name, line, mode, periods and
// dates), the comment bar, the footer (direction, organisations, save, delete), saving, new and
// delete. Ported from Nepos 1.5.7 (nepos.html lines 2556–2643, 2694–2706, 3008–3048, 3153–3405)
// with the Nepos 2 project layer, read-only damaged routes and a guard for unsaved changes.
import { app } from './state.js';
import { $, onRefresh, refreshAll, runAction, markDirty, setBeforeLeave, beforeLeave, showMessage, currentPage } from './shell.js';
import { t } from '../i18n/strings.js';
import { grid, loadGrid, gridData, markGridClean, clearGrid, render as renderGrid, onGridChange, commitPending } from './grid.js';
import { newRouteState, fillMissingPeriod, addPeriod, deletePeriod, addDirection, deleteDirection, periodHasData, directionHasData, gridKey } from './route-state.js';
import { parseERN } from '../core/ern/parse.js';
import { serializeERN } from '../core/ern/serialize.js';
import { ERN_MODES } from '../core/ern/modes.js';
import { checkRouteFile } from '../core/integrity/check.js';
import { orgNameList, findRole, addToCopy } from '../core/orgs.js';
import { createOrgPicker } from './org-picker.js';
import { writeOrgs } from '../project/orgs-store.js';
import { pruneProjectCopy } from './org-register.js';
import { nextRouteCode, compareRouteCodes } from '../core/route-codes.js';
import { yyyymmddToInput, inputToYyyymmdd } from '../core/footnotes.js';
import { writeRoute, deleteRoute as deleteRouteFile } from '../project/routes.js';
import { showProjectCheck } from './project-ui.js';
import { issueMessage } from './messages.js';

/** @param {string} s */
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const activeEntry = () => app.routes.find((r) => r.code === app.activeRoute) ?? null;
const isReadOnly = () => activeEntry()?.status === 'damaged';

/** Store the visible grid back into the route state. */
function saveGridToState() {
  if (app.routeState && grid.active) app.routeState.grids[gridKey(app.routeState)] = gridData();
}

/**
 * Show another period × direction.
 * @param {number} perId
 * @param {number} dirId
 * @param {{ store?: boolean }} [opts] store: false after deleting the shown period/direction —
 *   the grid on screen belongs to the deleted one and must not be stored under the new key
 */
function switchPeriodDir(perId, dirId, { store = true } = {}) {
  if (store) {
    commitPending();
    saveGridToState();
  }
  app.routeState.activePer = perId;
  app.routeState.activeDir = dirId;
  loadGrid(app.routeState.grids[gridKey(app.routeState)] ?? { stops: [], cols: [] }, { readOnly: isReadOnly() });
  refreshAll();
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
  commitPending(); // a half-typed time or name counts as a change
  if (!app.dirty) return true;
  if (!confirm(t(reason === 'export' ? 'saveBeforeExport' : 'saveBeforeSwitch', app.activeRoute))) return false;
  return saveRoute();
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
  if (!(await beforeLeave())) return false;
  const entry = app.routes.find((r) => r.code === code);
  if (!entry) return false;
  const rs = parseERN(entry.text, { lang: /** @type {'no' | 'en'} */ (app.settings.lang) });
  fillMissingPeriod(rs, app.settings.lang);
  app.activeRoute = code;
  app.routeState = rs;
  app.dirty = false;
  loadGrid(rs.grids[gridKey(rs)] ?? { stops: [], cols: [] }, { readOnly: entry.status === 'damaged' });
  refreshAll();
  return true;
}

/** @param {HTMLButtonElement | null} [trigger] */
export async function newRoute(trigger = null) {
  if (!app.fs || !app.meta) return;
  if (!(await beforeLeave())) return;
  const code = nextRouteCode(app.routes.map((r) => r.code));
  const text = serializeERN(newRouteState(app.settings.lang), code, { delivery: { name: app.meta.name, codespace: app.meta.codespace }, orgs: [] });
  const fs = app.fs;
  const ok = await runAction(() => writeRoute(fs, code, text), trigger);
  if (!ok) return;
  const { status, issues } = checkRouteFile(text);
  app.routes = [...app.routes, { code, text, status, issues }].sort((a, b) => compareRouteCodes(a.code, b.code));
  app.activeRoute = null;
  await selectRoute(code);
}

/** @param {HTMLButtonElement | null} [trigger] */
async function deleteActiveRoute(trigger = null) {
  if (!app.fs || !app.activeRoute || isReadOnly()) return;
  const code = app.activeRoute;
  if (!confirm(t('deleteRouteConfirm', code))) return;
  const fs = app.fs;
  const ok = await runAction(() => deleteRouteFile(fs, code), trigger);
  if (!ok) return;
  app.routes = app.routes.filter((r) => r.code !== code);
  closeRoute();
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
  hdr.innerHTML = `
    <div class="rh-group"><span class="rh-label">${esc(t('routeNameLabel'))}:</span>
      <input class="rh-input" id="rh-name" value="${esc(rs.routeName)}" placeholder="${esc(t('routeNamePh'))}" style="width:150px"${dis}></div>
    <div class="rh-group"><span class="rh-label">${esc(t('publicCodeLabel'))}:</span>
      <input class="rh-input" id="rh-line" value="${esc(rs.publicCode)}" placeholder="${esc(t('publicCodePh'))}" style="width:100px"${dis}></div>
    <div class="rh-group"><span class="rh-label">${esc(t('modeLabel'))}:</span>
      <select class="rh-select" id="rh-mode"${dis}>${Object.entries(ERN_MODES).map(([k, v]) =>
        `<option value="${k}"${+k === rs.transportMode ? ' selected' : ''}>${esc(v[lang] || v.en)}</option>`).join('')}</select></div>
    <div class="rh-vsep"></div>
    <div class="rh-group"><span class="rh-label">${esc(t('periodLabel'))}:</span>
      <select class="rh-select" id="sel-period">${rs.periods.map((/** @type {any} */ p) =>
        `<option value="${p.id}"${p.id === rs.activePer ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
      ${ro ? '' : `<span class="rh-icon-btn" id="btn-add-per" title="${esc(t('newPeriod'))}">+</span>
      <span class="rh-icon-btn" id="btn-del-per" title="${esc(t('deletePeriod'))}" style="font-size:15px;line-height:1">×</span>`}</div>
    <div class="rh-group">
      <input type="date" class="rh-date" id="per-from" value="${yyyymmddToInput(per?.from || '')}" title="${esc(t('startDate'))}"${dis}>
      <span class="rh-arrow">→</span>
      <input type="date" class="rh-date" id="per-to" value="${yyyymmddToInput(per?.to || '')}" title="${esc(t('endDate'))}"${dis}></div>
    <div class="rh-group"><span class="rh-label" style="font-size:10px;color:var(--text-f)">${esc(t('altDates'))}</span>
      <input type="date" class="rh-date" id="per-from2" value="${yyyymmddToInput(per?.from2 || '')}" title="${esc(t('altStart'))}" style="width:100px"${dis}>
      <span class="rh-arrow">→</span>
      <input type="date" class="rh-date" id="per-to2" value="${yyyymmddToInput(per?.to2 || '')}" title="${esc(t('altEnd'))}" style="width:100px"${dis}></div>`;

  for (const id of ['rh-name', 'rh-line', 'rh-mode']) $(id).addEventListener('keydown', (/** @type {Event} */ e) => e.stopPropagation());
  $('sel-period').addEventListener('change', () => switchPeriodDir(+$('sel-period').value, rs.activeDir));
  if (ro) return;
  $('rh-name').addEventListener('change', () => { rs.routeName = $('rh-name').value.trim(); markDirty(); });
  $('rh-line').addEventListener('change', () => { rs.publicCode = $('rh-line').value.trim(); markDirty(); });
  $('rh-mode').addEventListener('change', () => { rs.transportMode = +$('rh-mode').value; markDirty(); });
  /** @type {[string, string][]} */
  const dateFields = [['per-from', 'from'], ['per-to', 'to'], ['per-from2', 'from2'], ['per-to2', 'to2']];
  for (const [id, field] of dateFields) {
    $(id).addEventListener('change', () => { if (per) { per[field] = inputToYyyymmdd($(id).value); markDirty(); } });
  }
  $('btn-add-per').addEventListener('click', () => {
    const name = prompt(t('periodNamePrompt'), t('periodDefault', rs.periods.length + 1));
    if (!name?.trim()) return;
    const active = rs.periods.find((/** @type {any} */ p) => p.id === rs.activePer);
    const copy = confirm(t('copyTripsConfirm', active?.name ?? ''));
    saveGridToState();
    const id = addPeriod(rs, name.trim(), copy);
    markDirty();
    switchPeriodDir(id, rs.activeDir);
  });
  $('btn-del-per').addEventListener('click', () => {
    if (rs.periods.length <= 1) { showMessage(t('lastPeriod')); return; }
    const active = rs.periods.find((/** @type {any} */ p) => p.id === rs.activePer);
    if (periodHasData(rs, rs.activePer) && !confirm(t('deletePeriodConfirm', active?.name ?? ''))) return;
    saveGridToState();
    deletePeriod(rs);
    markDirty();
    switchPeriodDir(rs.activePer, rs.activeDir, { store: false });
  });
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
  const cur = rs.directions.find((/** @type {any} */ d) => d.id === rs.activeDir);
  const other = rs.directions.find((/** @type {any} */ d) => d.id !== rs.activeDir);
  const dirLabel = other ? `${esc(cur?.name ?? '—')} ⇄ ${esc(other.name)}` : esc(t('createReturn'));

  el.innerHTML = `
    <button class="ef-dir-btn" id="ef-dir">${dirLabel}</button>
    ${other && !ro ? '<button class="ef-del-dir" id="ef-del-dir">×</button>' : ''}
    <div class="ef-vsep2"></div>
    <div class="ef-orgs" id="ef-orgs"></div>
    <div class="ef-spacer"></div>
    ${ro ? `<span class="n2-readonly-note">${esc(t('statusDamaged'))}</span>` : `
    <button class="ef-save-btn${app.dirty ? ' dirty' : ''}" id="ef-save">${app.dirty ? '● ' : ''}${esc(t('save'))}</button>
    <button class="ef-del-route" id="ef-del-route">${esc(t('deleteRoute'))}</button>`}`;

  const orgsEl = $('ef-orgs');
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
          renderFooter();
        });
        note.appendChild(x);
      }
      orgsEl.appendChild(note);
    }
  }

  $('ef-dir').addEventListener('click', () => {
    if (other) { switchPeriodDir(rs.activePer, other.id); return; }
    if (ro) return;
    saveGridToState();
    const src = rs.grids[gridKey(rs)];
    const copy = src?.stops?.length > 0 && confirm(t('copyStopsReversed', cur?.name ?? ''));
    const id = addDirection(rs, t('returnName'), !!copy);
    markDirty();
    switchPeriodDir(rs.activePer, id);
  });
  $('ef-del-dir')?.addEventListener('click', () => {
    if (rs.directions.length <= 1) { showMessage(t('lastDirection')); return; }
    if (directionHasData(rs, rs.activeDir) && !confirm(t('deleteDirectionConfirm', cur?.name ?? ''))) return;
    saveGridToState();
    deleteDirection(rs);
    markDirty();
    switchPeriodDir(rs.activePer, rs.activeDir, { store: false });
  });
  $('ef-save')?.addEventListener('click', () => saveRoute($('ef-save')));
  $('ef-del-route')?.addEventListener('click', () => deleteActiveRoute($('ef-del-route')));
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
  renderFooter();
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
    renderCommentBar();
    renderFooter();
    renderReadOnlyBar();
    return;
  }
  renderHeader();
  renderCommentBar();
  renderFooter();
  renderReadOnlyBar();
  if (grid.active) renderGrid();
}

let listenersWired = false;

export function initRouteEditor() {
  onRefresh(renderEditor);
  onGridChange(markDirty);
  setBeforeLeave(confirmLeave);
  $('btn-new-route').disabled = false;
  $('btn-new-route').onclick = () => newRoute($('btn-new-route'));
  // Document and window listeners only once, also when tests reload the page markup.
  if (listenersWired) return;
  listenersWired = true;
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's' && currentPage() === 'edit' && app.routeState) {
      e.preventDefault();
      saveRoute();
    }
  });
  window.addEventListener('beforeunload', (e) => {
    if (app.dirty) { e.preventDefault(); e.returnValue = ''; }
  });
}
