// The lines pane, mini view (navigation spec §3.1): a narrow band with the mode icon and the
// public code (or branding, or the first letters of the name), ● when unsaved and ⚠ n for problems.
// The order is the maxi view's last sort; F5 opens the maxi view.
import { app } from './state.js';
import { $, onRefresh, onLinesChanged } from './shell.js';
import { selectRoute, newRoute } from './route-editor.js';
import { t } from '../i18n/strings.js';
import { modeIconSvg } from './mode-icons.js';
import { lineRows, sortLines, loadLineSort } from './line-rows.js';
import { lineOrder } from './line-table.js';

/** @param {string} s */
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * The lines as Linjer shows them (its filter and order), so the navigator steps through the same set;
 * the open line is always there. Before Linjer has been shown: every line, by code.
 */
function navigatorRows() {
  const all = lineRows();
  const order = lineOrder().filter((code) => all.some((r) => r.code === code));
  if (!order.length) return sortLines(all, loadLineSort());
  if (app.activeRoute && !order.includes(app.activeRoute) && all.some((r) => r.code === app.activeRoute)) order.unshift(app.activeRoute);
  return order.map((code) => /** @type {any} */ (all.find((r) => r.code === code)));
}

export function renderRouteList() {
  const el = $('route-list');
  el.innerHTML = '';
  if (!app.meta) {
    el.innerHTML = `<div class="route-list-hint">${esc(t('noProjectOpen'))}</div>`;
    return;
  }
  if (app.routes.length === 0) el.innerHTML = `<div class="route-list-hint">${esc(t('noRoutes'))}</div>`;
  for (const r of navigatorRows()) {
    const div = document.createElement('div');
    div.className = `route-item${app.activeRoute === r.code ? ' active' : ''}${r.exported ? '' : ' rl-not-exported'}`;
    const problems = r.damaged ? 1 : r.errors + r.warnings;
    const warn = problems ? `<span class="rl-warn${r.errors || r.damaged ? ' has-errors' : ''}">⚠ ${problems}</span>` : '';
    const dot = r.unsaved ? `<span class="rl-unsaved">●</span>` : '';
    div.innerHTML = `<div class="rl-top">${modeIconSvg(r.mode, r.submode)}<span class="rl-code">${esc(r.label)}</span>${dot}${warn}</div>`;
    div.title = [r.name || r.label, r.publicCode, r.unsaved ? t('unsavedDot') : '', r.damaged ? t('statusDamaged') : '',
      problems && !r.damaged ? t('lineProblems', r.errors, r.warnings) : ''].filter(Boolean).join(' · ');
    div.addEventListener('click', () => { selectRoute(r.code); });
    el.appendChild(div);
  }
  // A new line, after the lines (user 2026-10-18), as in the calendar navigator
  const add = document.createElement('button');
  add.className = 'rl-add';
  add.textContent = t('rlNewLine');
  add.addEventListener('click', () => { void newRoute(); });
  el.appendChild(add);
}

export function initRouteList() {
  onRefresh(renderRouteList);
  onLinesChanged(renderRouteList);
}
