// The route list (F5 panel), ported from Nepos 1.5.7 (nepos.html lines 2501–2554), with a
// mark for routes that can be updated (↻) or need attention (⚠).
import { app } from './state.js';
import { $, onRefresh } from './shell.js';
import { selectRoute } from './route-editor.js';
import { t } from '../i18n/strings.js';
import { routeSummary } from './route-summary.js';
import { modeIconSvg } from './mode-icons.js';

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
    // The ID is a UUID (line header spec §4): filter on what the list shows.
    const brandName = (/** @type {any} */ r) => app.brandings.find((b) => b.id === r.brandingId)?.name ?? '';
    rows = rows.filter((r) => [r.name, r.publicCode, brandName(r)].some((v) => v.toLowerCase().includes(filter)));
  }
  if (sortBy === 'name') rows.sort((a, b) => (a.name || a.code).localeCompare(b.name || b.code, 'nb'));
  if (sortBy === 'code') rows.sort((a, b) => a.publicCode.localeCompare(b.publicCode, 'nb'));
  // 'id' (the default): public code, then name — the IDs are UUIDs and carry no order.
  if (sortBy === 'id') rows.sort((a, b) => a.publicCode.localeCompare(b.publicCode, 'nb', { numeric: true }) || a.name.localeCompare(b.name, 'nb'));

  if (rows.length === 0) {
    el.innerHTML = `<div class="route-list-hint" style="font-style:italic">${esc(t('noMatches'))}</div>`;
    return;
  }

  for (const r of rows) {
    const div = document.createElement('div');
    div.className = `route-item${app.activeRoute === r.code ? ' active' : ''}`;
    const mark = r.status === 'ok' ? '' : `<span class="n2-route-mark ${r.status}">${r.status === 'damaged' ? '⚠' : '↻'}</span>`;
    // Mode icon + public code (or the branding name), and the line name; the ID stays in the tooltip.
    const brand = !r.publicCode && r.brandingId ? app.brandings.find((x) => x.id === r.brandingId)?.name ?? '' : '';
    div.innerHTML = `${mark}<div class="rl-top">${modeIconSvg(r.mode, r.submode)}<span class="rl-code">${esc(r.publicCode || brand)}</span></div>
      ${r.name ? `<div class="rl-name">${esc(r.name)}</div>` : ''}`;
    div.title = [r.code, r.name, r.publicCode, r.status === 'ok' ? '' : t(r.status === 'damaged' ? 'statusDamaged' : 'statusOutdated')].filter(Boolean).join(' · ');
    div.addEventListener('click', () => { selectRoute(r.code); });
    el.appendChild(div);
  }
}

export function initRouteList() {
  $('route-filter-input').addEventListener('input', renderRouteList);
  $('route-sort-sel').addEventListener('change', renderRouteList);
  onRefresh(renderRouteList);
}
