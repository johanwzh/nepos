// Oversikt (dashboard design 2026-10-21): a project's first page, calm and in plain sentences, like a day view: what
// needs the planner today (a line ending within 30 days, a line with errors, lines changed since their export), what
// soon (ending within Entur's 120 days, not exported for a long time, warnings), that the rest is fine, every line's
// validity against the 30/60/90/120-day marks, and the network.
import { app } from './state.js';
import { $, onRefresh, currentPage, setPage } from './shell.js';
import { t, getLang } from '../i18n/strings.js';
import { lineRows } from './line-rows.js';
import { lineIssues, lineState, lineLabel } from './line-info.js';
import { lineErn } from './line-text.js';
import { textHash } from '../core/hash.js';
import { buildDashboard, VALIDITY_MARKS } from '../core/dashboard.js';
import { networkOf } from '../core/network.js';
import { quayInfo, onQuaysLoaded } from './quays.js';
import { selectRoute } from './route-editor.js';
import { createMapView } from './map-view.js';
import { styleUrlFor } from '../core/map-style.js';

/** @param {string} s */
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** How far the validity strip reaches, in days (a little beyond Entur's 120). */
const HORIZON = 150;

/** A line's ERN fingerprint now, cached per state object (a saved line's parsed state is cached by line-info). */
const hashes = new WeakMap();
/** @param {string} code */
function hashOf(code) {
  const rs = lineState(code);
  if (!rs) return '';
  if (!hashes.has(rs)) hashes.set(rs, textHash(lineErn(code, rs)));
  return hashes.get(rs);
}

/** YYYYMMDD as "2. nov. 2026". @param {string} ymd */
function dateText(ymd) {
  if (!ymd) return '';
  const d = new Date(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8)));
  return d.toLocaleDateString(getLang() === 'en' ? 'en-GB' : 'nb-NO', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** The project's lines as the dashboard reads them. */
function dashLines() {
  return lineRows().map((r) => ({ code: r.code, label: lineLabel(r.code), exported: r.exported, lastDay: r.lastDay, issues: lineIssues(r.code), hash: hashOf(r.code) }));
}

/** A group of problems in a sentence: "×20 Turen mangler destinasjon". @param {import('../core/issue-groups.js').IssueGroup} g */
const groupText = (g) => `${g.count > 1 ? `×${g.count} ` : ''}${t(`chk:${g.code}`, g.issues[0]?.detail ?? '')}`;

/** @param {string} icon @param {string} tone @param {string} what @param {string} why @param {string} button @param {string} action */
const card = (icon, tone, what, why, button, action) => `<div class="home-card">
    <div class="home-ico ${tone}">${icon}</div>
    <div class="home-what">${esc(what)}</div>
    <div class="home-why">${why}</div>
    <button class="home-go" data-action="${esc(action)}">${esc(button)}</button>
  </div>`;

/** A line's errors under another reason on its card: one card per line. @param {any} errors */
const also = (errors) => (errors ? `<div class="home-also"><div>${esc(t('homeAlsoErrors', errors.count))}</div>${errors.groups.slice(0, 3).map((/** @type {any} */ g) => `<div>${esc(groupText(g))}</div>`).join('')}</div>` : '');

/** @param {import('../core/dashboard.js').TodayItem} item @param {any} [errors] the same line's errors, shown on its card */
function todayCard(item, errors) {
  if (item.kind === 'expires') {
    return item.days < 0
      ? card('⏳', 'red', t('homeEnded', item.label), esc(t('homeEndedWhy', dateText(item.lastDay))) + also(errors), t('homeOpenLine'), `line:${item.code}`)
      : card('⏳', 'red', t('homeEndsIn', item.label, item.days), esc(t('homeEndsWhy', dateText(item.lastDay))) + also(errors), t('homeOpenLine'), `line:${item.code}`);
  }
  if (item.kind === 'errors') {
    const why = item.groups.slice(0, 3).map((g) => `<div>${esc(groupText(g))}</div>`).join('') + (item.groups.length > 3 ? '<div>…</div>' : '');
    return card('⚠️', 'red', t('homeErrors', item.label), why, t('homeShowProblems'), `line:${item.code}`);
  }
  const what = item.codes.length === 1 ? t('homeChangedOne', item.labels[0]) : t('homeChangedMany', item.codes.length);
  return card('⬆️', 'blue', what, esc(t('homeChangedWhy', item.labels.join(', '))), t('homeGoExport'), 'export');
}

/** @param {import('../core/dashboard.js').SoonItem} item */
function soonItem(item) {
  /** @param {string} tone @param {string} what @param {string} when @param {string} [note] @param {string} [action] */
  const row = (tone, what, when, note = '', action = '') => `<div class="home-item${action ? ' home-link' : ''}"${action ? ` data-action="${esc(action)}"` : ''}>
      <span class="home-dot ${tone}"></span><span class="home-item-text">${esc(what)}${note ? `<span class="home-note">${esc(note)}</span>` : ''}</span>
      <span class="home-when">${esc(when)}</span></div>`;
  if (item.kind === 'expiring') return row('amber', t('homeSoonEnds', item.label), t('homeSoonEndsWhen', item.days, dateText(item.lastDay)), t('homeEntur120'), `line:${item.code}`);
  if (item.kind === 'stale') return item.never ? row('grey', t('homeNeverExported', item.label), '', '', `line:${item.code}`) : row('grey', t('homeStale', item.label), t('homeStaleWhen', item.days), '', `line:${item.code}`);
  return `<details class="home-item home-warn"><summary><span class="home-dot grey"></span><span class="home-item-text">${esc(t('homeWarnings', item.label, item.count))}</span></summary>
    ${item.groups.map((g) => `<div class="home-warn-row">${esc(groupText(g))}</div>`).join('')}</details>`;
}

/** @param {import('../core/dashboard.js').Validity[]} validity */
function validityStrip(validity) {
  const at = (/** @type {number} */ d) => `${Math.max(0, Math.min(d, HORIZON)) / HORIZON * 100}%`;
  const marks = VALIDITY_MARKS.map((m) => `<div class="home-mark-line" style="left:${at(m)}"></div><span class="home-mark" style="left:${at(m)}">${m}</span>`).join('');
  const bars = validity.map((v) => `<div class="home-vrow"><span class="home-vlabel">${esc(v.label)}</span>
      <span class="home-vtrack"><span class="home-bar ${v.bucket}" style="width:${at(v.days)}"></span>${v.days > HORIZON ? '<span class="home-more">→</span>' : ''}</span>
      <span class="home-vdate">${esc(dateText(v.lastDay))}</span></div>`).join('');
  return `<section class="home-section"><h3>${esc(t('homeValidity'))}</h3><p class="home-sub">${esc(t('homeValidityNote'))}</p>
    <div class="home-validity"><div class="home-vmarks"><span class="home-vlabel"></span><span class="home-vtrack">${marks}</span><span class="home-vdate">${esc(t('homeDays'))}</span></div>${bars}</div></section>`;
}

function greeting() {
  const h = new Date().getHours();
  return t(h < 10 ? 'homeMorning' : h < 17 ? 'homeDay' : 'homeEvening');
}

// ─── The network map ────────────────────────────────────────────────────────
/** @type {ReturnType<typeof createMapView> | null} */
let view = null;
/** @type {HTMLElement | null} */
let mapEl = null;
let fittedFor = '';

/** @param {import('../core/dashboard.js').DashLine[]} lines */
function drawNetwork(lines) {
  const host = document.getElementById('home-map');
  const none = document.getElementById('home-map-none');
  if (!host) return;
  const routes = lines.filter((l) => l.exported).map((l) => ({ code: l.code, rs: lineState(l.code), problem: l.issues.some((i) => i.level === 'error') })).filter((r) => r.rs);
  const net = networkOf(routes, quayInfo);
  if (none) none.hidden = net.stops.length > 0;
  if (!net.stops.length) return;
  try {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (!view || mapEl !== host) { view = createMapView(host, { style: styleUrlFor(app.settings, dark ? 'dark' : 'light'), dark }); mapEl = host; fittedFor = ''; }
    const most = Math.max(...net.segments.map((s) => s.trips), 1);
    view.setNetwork({
      lines: net.segments.map((s) => ({ coords: s.coords, w: 2 + 6 * Math.log1p(s.trips) / Math.log1p(most), c: s.problem ? '#d9534f' : '#3d7ebf', tooltip: `${esc(s.lines.map(lineLabel).join(', '))} · ${s.trips}` })),
      stops: net.stops.map((p) => ({ lon: p.lon, lat: p.lat, r: p.lines > 1 ? 5 : 3.5, tooltip: esc(p.name) })),
    });
    const key = `${app.meta?.name}|${net.stops.length}`;
    if (key !== fittedFor) { view.whenReady(() => view?.fit(net.stops.map((p) => /** @type {[number, number]} */ ([p.lon, p.lat])), { padding: 30, maxZoom: 13 })); fittedFor = key; }
    view.resize();
  } catch { /* no map here (no WebGL): the rest of the page still works */ }
}

// ─── The page ───────────────────────────────────────────────────────────────
export function renderDashboardPage() {
  if (currentPage() !== 'home') return;
  const body = $('home-body');
  if (!app.meta) { body.innerHTML = `<p class="home-empty">${esc(t('homeNoProject'))}</p>`; mapEl = null; return; }
  if (!app.routes.length) { body.innerHTML = `<p class="home-empty">${esc(t('homeNoLines'))}</p>`; mapEl = null; return; }
  const lines = dashLines();
  const d = buildDashboard({ lines, exports: app.exports ?? {}, today: new Date() });
  // One card per line: a line that ends soon shows its errors on the same card
  const errorsOf = new Map(d.today.flatMap((i) => (i.kind === 'errors' ? [[i.code, i]] : [])));
  const ending = new Set(d.today.flatMap((i) => (i.kind === 'expires' ? [i.code] : [])));
  const cards = d.today.filter((i) => !(i.kind === 'errors' && ending.has(i.code))).map((i) => todayCard(i, i.kind === 'expires' ? errorsOf.get(i.code) : undefined));
  const summary = cards.length ? t('homeToday', cards.length) : d.soon.length ? t('homeNothingToday') : t('homeAllGood');
  const flagged = d.today.length + d.soon.length > 0;
  const ok = d.ok.count && d.ok.until ? `<div class="home-ok">✓ ${esc(flagged ? t('homeOkSome', d.ok.count, dateText(d.ok.until)) : t('homeOkAll', d.ok.count, dateText(d.ok.until)))}</div>` : '';
  const never = d.soon.some((s) => s.kind === 'stale' && s.never) ? `<p class="home-sub">${esc(t('homeNeverNote'))}</p>` : '';
  // The map's container stays between renders: only the text around it is rebuilt
  let main = /** @type {HTMLElement | null} */ (body.querySelector('.home-main'));
  if (!main || !body.querySelector('#home-map')) {
    body.innerHTML = `<div class="home-main"></div>
      <section class="home-section home-network"><h3>${esc(t('homeNetwork'))}</h3><p class="home-sub">${esc(t('homeNetworkNote'))}</p>
        <div class="home-map" id="home-map"></div><p class="home-sub" id="home-map-none" hidden>${esc(t('homeNetworkNone'))}</p></section>`;
    main = /** @type {HTMLElement} */ (body.querySelector('.home-main'));
  }
  main.innerHTML = `<p class="home-hello">${esc(greeting())}</p><p class="home-summary">${esc(summary)}</p>
    ${cards.length ? `<div class="home-cards">${cards.join('')}</div>` : ''}
    ${d.soon.length ? `<section class="home-soon"><h3>${esc(t('homeSoon'))}</h3>${d.soon.map(soonItem).join('')}${never}</section>` : ''}
    ${ok}
    ${d.validity.length ? validityStrip(d.validity) : ''}`;
  drawNetwork(lines);
}

/** @param {string} action "line:<code>" or "export" */
async function act(action) {
  if (action === 'export') { setPage('export'); return; }
  const code = action.slice(5);
  if (await selectRoute(code)) setPage('edit');
}

let wired = false;
export function initDashboardPage() {
  onRefresh(renderDashboardPage);
  onQuaysLoaded(renderDashboardPage);
  if (wired) return;
  wired = true;
  document.addEventListener('click', (e) => {
    const el = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest?.('#home-body [data-action]'));
    if (el?.dataset.action) void act(el.dataset.action);
  });
}
