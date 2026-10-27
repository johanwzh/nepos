// "There are problems" on the editor page (user 2026-10-19): a small marker by the save button with the open
// line's counts ("⚠ 2 feil · 1 advarsel"). It does not list them: a click goes to the first problem, the next
// click to the next, round the list (errors first), and the place is marked for a moment ("Må fylles inn").
import { app } from './state.js';
import { t } from '../i18n/strings.js';
import { $, onLinesChanged } from './shell.js';
import { lineIssues } from './line-info.js';
import { grid, onGridRender, selectDayCode, selectStopCell, selectDestCell, selectCell, viewColumn } from './grid.js';
import { switchTableSet, switchPeriod } from './route-editor.js';
import { openEditDialog } from './table-set-tabs.js';
import { quayStatus } from '../core/quays.js';
import { quayInfo } from './quays.js';
import { servedRows } from '../core/destinations.js';

/** @typedef {import('../core/export-check.js').CheckIssue} CheckIssue */

let index = -1;
let forRoute = /** @type {string | null} */ (null);
let timer = /** @type {any} */ (null);

/** The open line's problems, errors first. */
function issues() {
  return app.activeRoute ? lineIssues(app.activeRoute) : [];
}

/** Fill the marker (the footer has a button #ef-problems). @param {boolean} [keepStep] */
export function updateProblemMarker(keepStep = false) {
  const el = $('ef-problems');
  if (!el) return;
  if (forRoute !== app.activeRoute) { forRoute = app.activeRoute; index = -1; }
  const list = issues();
  const errors = list.filter((i) => i.level === 'error').length, warnings = list.length - errors;
  el.hidden = !list.length;
  el.classList.toggle('has-errors', errors > 0);
  if (!keepStep) index = Math.min(index, list.length - 1);
  const counts = [errors ? t('probErrors', errors) : '', warnings ? t('probWarnings', warnings) : ''].filter(Boolean).join(' · ');
  const step = keepStep && index >= 0 && list[index] ? ` — ${index + 1}/${list.length}: ${t(`chk:${list[index].code}`, list[index].detail ?? '')}` : '';
  el.textContent = `⚠ ${counts}${step}`;
  el.title = t('probHint');
}

/** The next problem, round the list. */
function next() {
  const list = issues();
  if (!list.length) return;
  index = (index + 1) % list.length;
  goToProblem(list[index]);
  updateProblemMarker(true);
}

/**
 * Mark a place for a moment, with a short text.
 * @param {Element | null} el @param {string} text
 */
function markHere(el, text) {
  if (!el) return;
  el.classList.add('go-here');
  el.setAttribute('data-go-here', text);
  setTimeout(() => { el.classList.remove('go-here'); el.removeAttribute('data-go-here'); }, 2500);
  /** @type {any} */ (el).scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
}

/** Switch to the issue's table set and period when it names them. @param {CheckIssue} issue */
function goToPlace(issue) {
  const rs = app.routeState;
  const w = /** @type {any} */ (issue.where);
  if (!rs || !w) return;
  if (w.setId != null && rs.activeSet !== w.setId) switchTableSet(w.setId);
  if (w.periodId != null && rs.activePer !== w.periodId) switchPeriod(w.periodId);
}

/** The first stop row whose NSR status gives this check code. @param {string} code */
function stopRowFor(code) {
  const want = { 'stop-missing': 'missing', 'stop-not-nsr': 'not-nsr', 'stop-not-seen': 'not-seen', 'stop-mode': 'mode-mismatch', 'stop-unchecked': 'unknown' }[code];
  const timedRow = (/** @type {number} */ ri) => grid.cols.some((c) => c.cells[ri]?.time && c.cells[ri].time !== '|');
  return grid.stops.findIndex((s, ri) => {
    if (!timedRow(ri) || s.isDwellArr) return false;
    if (!want) return !!s.stopId; // stop-id-clash: any linked stop
    const id = s.stopId == null || s.stopId === '' ? null : String(s.stopId);
    return quayStatus(id, id ? quayInfo.get(id) : undefined, app.routeState?.transportMode ?? 0) === want;
  });
}

/**
 * Go to where a problem is, and mark it.
 * @param {CheckIssue} issue
 */
export function goToProblem(issue) {
  const fill = t('probFill'), fix = t('probFix');
  const c = issue.code;
  const col = viewColumn((issue.where?.column ?? 1) - 1); // a block's band and end columns are not counted
  const focus = (/** @type {string} */ id, /** @type {string} */ text) => { const el = /** @type {HTMLElement | null} */ (document.getElementById(id)); el?.focus(); markHere(el, text); };
  if (c === 'no-name') { focus('rh-name', fill); return; }
  if (c === 'no-mode' || c === 'no-submode') { focus('rh-mode-tile', fill); return; }
  if (c === 'no-authority') { focus('ef-pick-authority', fill); markHere(document.querySelector('#ef-pick-authority .org-pick-btn'), fill); return; }
  if (c === 'no-operator') { focus('ef-pick-operator', fill); markHere(document.querySelector('#ef-pick-operator .org-pick-btn'), fill); return; }
  if (c.startsWith('org-')) { markHere(document.getElementById('ef-pick-authority') ?? document.getElementById('ef-pick-operator'), fix); return; }
  if (c === 'branding-missing') { focus('rh-branding', fix); return; }
  // The line's booking: its button at the end of the line's note bar
  if (c.startsWith('booking-') && issue.detail === 'line') { const el = /** @type {HTMLElement | null} */ (document.querySelector('#kom-bar .kom-booking')); el?.focus(); markHere(el, fix); return; }
  goToPlace(issue);
  if (c === 'table-set-name') { const w = /** @type {any} */ (issue.where); if (w?.setId != null) openEditDialog(w.setId); return; }
  if (c === 'no-period' || c === 'no-calendar' || c.startsWith('calendar-')) { markHere(document.getElementById('cal-add') ?? document.querySelector('.cal-chip'), c === 'no-calendar' ? fill : fix); return; }
  if (c.startsWith('dest-')) {
    const first = grid.cols[col] ? servedRows(grid, grid.cols[col])[0] ?? 0 : 0;
    selectDestCell(first, col);
    markHere(document.querySelector(`.cw-dest[data-dr="${first}"][data-dc="${col}"]`), c === 'dest-missing' ? fill : fix);
    return;
  }
  if (c.startsWith('stop-')) {
    const ri = stopRowFor(c);
    if (ri >= 0) { selectStopCell(ri); markHere(document.querySelector(`.g-td-name[data-ri="${ri}"]`), c === 'stop-missing' ? fill : fix); }
    return;
  }
  if ((c === 'speed-over' || c === 'stop-no-use' || c.startsWith('booking-')) && issue.where?.row != null) {
    selectCell(issue.where.row, col);
    markHere(document.querySelector(`#tbl td[data-r="${issue.where.row}"][data-c="${col}"]`), fix);
    return;
  }
  if (issue.where?.column != null) {
    selectDayCode(col);
    markHere(document.querySelector(`.g-dc-cell[data-ci="${col}"]`), c === 'col-no-daycode' ? fill : fix);
    return;
  }
  markHere($('ef-problems'), fix);
}

/** Keep the marker current while the line is edited (a little after the last change). */
export function initProblemNav() {
  const later = () => { clearTimeout(timer); timer = setTimeout(() => updateProblemMarker(index >= 0), 300); };
  onGridRender(later);
  onLinesChanged(later); // edits outside the grid: the name, the organisations, a table set's name
}

/** Wire the marker's button (called when the footer is built). */
export function wireProblemMarker() {
  $('ef-problems')?.addEventListener('click', next);
  updateProblemMarker();
}
