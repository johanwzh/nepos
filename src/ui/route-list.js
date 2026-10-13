// The route list (F5 panel), ported from Nepos 1.5.7 (nepos.html lines 2501–2554), with a
// mark for routes that can be updated (↻) or need attention (⚠).
import { app } from './state.js';
import { $, onRefresh, refreshAll } from './shell.js';
import { t } from '../i18n/strings.js';
import { routeSummary } from './route-summary.js';

/** @param {string} s */
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function renderRouteList() {
  const el = $('route-list');
  el.innerHTML = '';
  if (!app.meta) {
    el.innerHTML = `<div class="route-list-hint">${esc(t('noProjectOpen'))}</div>`;
    return;
  }
  if (app.routes.length === 0) {
    el.innerHTML = `<div class="route-list-hint">${esc(t('noRoutes'))}</div>`;
    return;
  }

  const filter = ($('route-filter-input').value || '').toLowerCase();
  const sortBy = $('route-sort-sel').value || 'id';
  let rows = app.routes.map((r) => ({ ...r, ...routeSummary(r.text) }));
  if (filter) {
    rows = rows.filter((r) => [r.code, r.name, r.publicCode].some((v) => v.toLowerCase().includes(filter)));
  }
  if (sortBy === 'name') rows.sort((a, b) => (a.name || a.code).localeCompare(b.name || b.code, 'nb'));
  if (sortBy === 'code') rows.sort((a, b) => a.publicCode.localeCompare(b.publicCode, 'nb'));
  // 'id' keeps the order from listRoutes (numbers first, numerically)

  if (rows.length === 0) {
    el.innerHTML = `<div class="route-list-hint" style="font-style:italic">${esc(t('noMatches'))}</div>`;
    return;
  }

  for (const r of rows) {
    const div = document.createElement('div');
    div.className = `route-item${app.activeRoute === r.code ? ' active' : ''}`;
    const mark = r.status === 'ok' ? '' : `<span class="n2-route-mark ${r.status}">${r.status === 'damaged' ? '⚠' : '↻'}</span>`;
    div.innerHTML = `
      ${mark}<div style="font-size:9px;color:var(--text-f);line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(r.code)}</div>
      ${r.name ? `<div style="font-size:12px;color:var(--text);font-weight:500;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(r.name)}</div>` : ''}
      ${r.publicCode ? `<div style="font-size:14px;color:var(--accent);line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(r.publicCode)}</div>` : ''}`;
    div.title = [r.code, r.name, r.publicCode, r.status === 'ok' ? '' : t(r.status === 'damaged' ? 'statusDamaged' : 'statusOutdated')].filter(Boolean).join(' · ');
    div.addEventListener('click', () => {
      app.activeRoute = r.code;
      refreshAll();
    });
    el.appendChild(div);
  }
}

export function initRouteList() {
  $('route-filter-input').addEventListener('input', renderRouteList);
  $('route-sort-sel').addEventListener('change', renderRouteList);
  onRefresh(renderRouteList);
}
