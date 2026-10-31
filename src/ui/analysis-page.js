// Analyse (spec 2026-10-31): Oversikt's second sub-page, the plan's numbers as a receipt. A tree on the left
// (project → authority → operator); for the node picked, the same blocks: scope per mode, the routed network, production,
// per fuel, per day type, vehicles on the road at once, production through the period, and the node's children. It is
// not validation: missing data is a grey Ukjent row that is part of the sum. Exports: Excel into the project's
// analyse/ folder, Tekst to the clipboard.
import { app } from './state.js';
import { $, onRefresh, currentPage, runAction, showMessage } from './shell.js';
import { t, getLang } from '../i18n/strings.js';
import { lineRows } from './line-rows.js';
import { lineState, lineLabel } from './line-info.js';
import { quayInfo, onQuaysLoaded } from './quays.js';
import { modeLabel } from '../i18n/modes.js';
import { lineFacts } from '../core/analysis/facts.js';
import { receipt } from '../core/analysis/receipt.js';
import { analysisTree, findNode } from '../core/analysis/tree.js';
import { inMotion, perDate, busiestDate } from '../core/analysis/time.js';
import { receiptText, int, dec1, clock } from '../core/analysis/text.js';
import { buildXlsx } from '../core/xlsx.js';
import { renderDashboardPage } from './dashboard-page.js';

/** @typedef {import('../core/analysis/facts.js').TripFact} TripFact */
/** @typedef {import('../core/analysis/receipt.js').Receipt} Receipt */
/** @typedef {import('../core/analysis/receipt.js').Period} Period */
/** @typedef {import('../core/analysis/tree.js').TreeNode} TreeNode */

const KEY = 'nepos.analyse';
/** @type {{ sub: 'todo' | 'analyse', node: string }} */
let saved = { sub: 'todo', node: 'project' };
try { saved = { ...saved, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { /* no storage: defaults */ }
const keep = () => { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* no storage */ } };
/** @type {Period} */
let period = null;
let picking = false;
/** @type {string | null} the date of the vehicles chart (null: the busiest) */
let motionDate = null;
let byKm = false;

const esc = (/** @type {unknown} */ s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
/** YYYYMMDD → 5.1.2026 @param {string} d */
const dateText = (d) => (d ? `${+d.slice(6, 8)}.${+d.slice(4, 6)}.${d.slice(0, 4)}` : '—');
const ymd = (/** @type {Date} */ d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
const iso = (/** @type {string} */ d) => (d ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : '');

/** The node and the period on screen (the network view follows them). @returns {{ nodeId: string, period: Period }} */
export const analysisSelection = () => ({ nodeId: saved.node, period });

/** @type {Map<string, { key: any[], facts: TripFact[] }>} per line, recomputed when the line or what it reads changes */
const cache = new Map();
/** The trip facts of these lines, cached per line. @param {string[]} codes @returns {TripFact[]} */
export function factsFor(codes) {
  return codes.flatMap((code) => {
    const rs = lineState(code);
    if (!rs) return [];
    const links = app.lineLinks.get(code);
    const key = [rs, links, app.vehicles, app.calendars, quayInfo.size];
    const hit = cache.get(code);
    if (hit && hit.key.every((v, i) => v === key[i])) return hit.facts;
    const facts = lineFacts(code, rs, { calendars: app.calendars, quayInfo, links: links?.links, vehicles: app.vehicles ?? [] });
    cache.set(code, { key, facts });
    return facts;
  });
}

/** The exported lines, as the tree and the receipt count them. */
const exportedRows = () => lineRows().filter((r) => r.exported && !r.damaged);
const treeOf = () => analysisTree(exportedRows(), { projectName: t('anProject'), unknownAuthority: t('anUnknownAuthority'), unknownOperator: t('anUnknownOperator') });

/** The labels the text export uses. */
const labels = () => ({ t, mode: modeName, fuel: fuelName, profile: profileName });
const modeName = (/** @type {string} */ m) => (m ? modeLabel(m, getLang()) : t('anUnknownMode'));
const fuelName = (/** @type {string} */ f) => (f ? t(`fuel_${f}`) : t('anUnknownFuel'));
const profileName = (/** @type {string} */ p) => (p ? t(`anProfile_${p}`) : t('anUnknownProfile'));

/** A table: head, rows (unk: grey italic), a Sum row. @param {string[]} head @param {{ cells: string[], unk?: boolean, sum?: boolean, grp?: boolean, id?: string }[]} rows */
function table(head, rows) {
  return `<table class="an-table"><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>${rows.map((r) => `<tr class="${r.unk ? 'an-unk' : ''}${r.sum ? ' an-sum' : ''}${r.grp ? ' an-grp' : ''}"${r.id ? ` data-node="${esc(r.id)}"` : ''}>${r.cells.map((c, i) => (r.grp && i === 0 ? `<td colspan="${head.length}">${esc(c)}</td>` : r.grp ? '' : `<td>${i === 0 && r.id ? `<button type="button" class="an-open">${esc(c)} ▸</button>` : esc(c)}</td>`)).join('')}</tr>`).join('')}</table>`;
}
const block = (/** @type {string} */ title, /** @type {string} */ note, /** @type {string} */ body, extra = '') => `<section class="an-block"><h4><span>${esc(title)}</span><span class="an-h-note">${esc(note)}${extra}</span></h4>${body}</section>`;

/** The children of a node with their totals: authorities, operators, or lines. @param {TreeNode} node */
function childRows(node) {
  if (node.kind === 'operator') return node.lines.map((code) => ({ id: '', name: lineLabel(code), unknown: false, r: receipt(factsFor([code]), { period, today: ymd(new Date()) }) }));
  return node.children.map((c) => ({ id: c.id, name: c.name, unknown: c.unknown, r: receipt(factsFor(c.lines), { period, today: ymd(new Date()) }) }));
}

/** @param {Receipt} r */
function blocks(r, /** @type {TreeNode} */ node, /** @type {TripFact[]} */ facts) {
  const p = r.production;
  const scope = block(t('anScopeHead'), t('anScopeNote'), table(['', t('anLines'), t('anTrips'), t('anDepartures'), t('anStops')], [
    ...r.scope.rows.map((x) => ({ cells: [modeName(x.mode), int(x.lines), int(x.trips), int(x.departures), int(x.stops)], unk: !x.mode })),
    { cells: [t('anSum'), int(r.scope.sum.lines), int(r.scope.sum.trips), int(r.scope.sum.departures), int(r.scope.sum.stops)], sum: true }]) + `<p class="an-note">${esc(t('anStopsNote'))}</p>`);
  const network = block(t('anNetworkHead'), t('anNetworkNote'), table(['', t('anStretches'), t('anKm')], [
    ...r.network.groups.flatMap((g) => [{ cells: [profileName(g.profile)], grp: true },
      { cells: [`  ${t('anRouted')}`, int(g.routed.stretches), int(g.routed.km)] }, { cells: [`  ${t('anUnknown')}`, int(g.unknown), '—'], unk: true }]),
    { cells: [t('anSumKnown'), int(r.network.sum.stretches), int(r.network.sum.km)], sum: true }]));
  const prodRow = (/** @type {string} */ name, /** @type {(x: import('../core/analysis/receipt.js').Prod) => number} */ f, unk = false) => ({ cells: [name, int(f(p.planned)), int(f(p.done)), int(f(p.remaining))], unk });
  const production = block(t('anProdHead'), t('anProdNote'), table(['', t('anPlanned'), t('anDone'), t('anRemaining')], [
    prodRow(t('anDepartures'), (x) => x.departures), prodRow(t('anHours'), (x) => x.hours), prodRow(t('anKmKnown'), (x) => x.km),
    prodRow(t('anUnknownKmDeps'), (x) => x.unknownKmDepartures, true),
    { cells: [t('anAvgSpeed'), p.avgKmh == null ? '—' : `${dec1(p.avgKmh)} km/t`, '', ''] }]) + `<p class="an-note">${esc(t('anKmNote'))}</p>`);
  const known = r.fuel.sum.km;
  const bar = known ? `<div class="an-bar">${r.fuel.rows.filter((x) => x.km).map((x, i) => `<span class="an-bar-${x.fuel ? i % 6 : 'unk'}" style="width:${(100 * x.km) / known}%" title="${esc(fuelName(x.fuel))}"></span>`).join('')}</div>` : '';
  const share = (/** @type {number | null} */ v) => (v == null ? '—' : `${Math.round(v * 100)} %`);
  const fuel = block(t('anFuelHead'), t('anFuelNote'), table(['', t('anDepartures'), t('anKm'), t('anHours'), t('anSeatKm')], [
    ...r.fuel.rows.map((x) => ({ cells: [fuelName(x.fuel), int(x.departures), int(x.km), int(x.hours), x.seatKm == null ? '—' : int(x.seatKm)], unk: !x.fuel })),
    { cells: [t('anSum'), int(r.fuel.sum.departures), int(r.fuel.sum.km), int(r.fuel.sum.hours), int(r.fuel.sum.seatKm)], sum: true },
    { cells: [`  ${t('anOfWhichUnknownKm')}`, int(r.fuel.unknownKm.departures), '—', int(r.fuel.unknownKm.hours), '—'], unk: true }])
    + bar + `<p class="an-note">${esc(t('anFuelShares', share(r.fuel.lowFloorShare), share(r.fuel.bookedShare)))}</p>`);
  const days = block(t('anDayHead'), t('anDayNote'), table(['', t('anDates'), t('anDepartures'), t('anHours'), t('anFirstLast')],
    r.dayTypes.map((d) => ({ cells: [t(`anDay_${d.type}`), int(d.dates), int(d.departures), int(d.hours), d.first == null ? '—' : `${clock(d.first)} – ${clock(d.last)}`] }))));
  const date = motionDate ?? busiestDate(facts, period);
  const motion = block(t('anMotionHead'), t('anMotionNote'), date ? motionChart(inMotion(facts, date)) : `<p class="an-note">${esc(t('anNothing'))}</p>`,
    ` <input type="date" class="an-motion-date" value="${iso(date ?? '')}">`);
  const over = block(t('anOverHead'), '', overChart(perDate(facts, period)),
    ` <button type="button" class="an-chip an-by${byKm ? '' : ' on'}" data-by="dep">${esc(t('anDepartures'))}</button><button type="button" class="an-chip an-by${byKm ? ' on' : ''}" data-by="km">km</button>`);
  const kids = childRows(node);
  const children = kids.length ? block(t('anChildrenHead', node.name), t('anChildrenNote'), table(['', t('anDepartures'), t('anKm'), t('anHours')], [
    ...kids.map((k) => ({ cells: [k.name, int(k.r.production.planned.departures), int(k.r.production.planned.km), int(k.r.production.planned.hours)], unk: k.unknown, id: k.id || undefined })),
    { cells: [t('anSum'), int(p.planned.departures), int(p.planned.km), int(p.planned.hours)], sum: true }])) : '';
  return `<div class="an-cols"><div>${scope}${network}${production}</div><div>${fuel}${days}${motion}${over}${children}</div></div>`;
}

/** Trips in motion per 15 minutes, the peak marked. @param {ReturnType<typeof inMotion>} m */
function motionChart(m) {
  const W = 480, H = 90, n = m.slots.length, max = Math.max(1, ...m.slots);
  const x = (/** @type {number} */ i) => (i / Math.max(1, n)) * W, y = (/** @type {number} */ v) => H - 14 - (v / max) * (H - 26);
  const pts = m.slots.map((v, i) => `${x(i)},${y(v)} ${x(i + 1)},${y(v)}`).join(' ');
  const ticks = [];
  for (let h = 0; h * 4 <= n; h += 3) ticks.push(`<text x="${x(h * 4)}" y="${H - 2}">${String(h % 24).padStart(2, '0')}</text>`);
  return `<svg class="an-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(t('anMotionHead'))}"><polygon class="an-area" points="0,${H - 14} ${pts} ${W},${H - 14}"/>${ticks.join('')}<text class="an-peak" x="${Math.min(W - 120, x(m.peak.slot))}" y="10">${esc(t('anPeak', m.peak.count, clock(m.peak.slot * 15)))}</text></svg>`;
}

/** One bar per date. @param {{ date: string, departures: number, km: number }[]} rows */
function overChart(rows) {
  if (!rows.length) return `<p class="an-note">${esc(t('anNothing'))}</p>`;
  const W = 480, H = 80, v = (/** @type {{ departures: number, km: number }} */ d) => (byKm ? d.km : d.departures), max = Math.max(1, ...rows.map(v)), w = W / rows.length;
  return `<svg class="an-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(t('anOverHead'))}">${rows.map((d, i) => `<rect class="an-barv" x="${i * w}" y="${H - 12 - (v(d) / max) * (H - 16)}" width="${Math.max(0.5, w - 0.5)}" height="${(v(d) / max) * (H - 16)}"><title>${esc(dateText(d.date))}: ${esc(int(v(d)))}</title></rect>`).join('')}<text x="0" y="${H - 1}">${esc(dateText(rows[0].date))}</text><text x="${W}" y="${H - 1}" text-anchor="end">${esc(dateText(rows[rows.length - 1].date))}</text></svg>`;
}

/** @param {TreeNode} tree @param {string} sel */
function treeHtml(tree, sel) {
  const item = (/** @type {TreeNode} */ n, /** @type {number} */ level) => `<button type="button" class="an-node an-l${level}${n.id === sel ? ' on' : ''}${n.unknown ? ' an-unk' : ''}" data-node="${esc(n.id)}">${esc(n.name)}<span class="an-n">${n.lines.length}</span></button>`
    + n.children.map((c) => item(c, level + 1)).join('');
  return item(tree, 0);
}

/** The path from the project to a node. @param {TreeNode} tree @param {string} id @returns {TreeNode[]} */
function pathTo(tree, id) {
  if (tree.id === id) return [tree];
  for (const c of tree.children) { const p = pathTo(c, id); if (p.length) return [tree, ...p]; }
  return [];
}

export function renderAnalysisPage() {
  const tabs = $('home-tabs');
  if (tabs) for (const b of tabs.querySelectorAll('[data-sub]')) b.classList.toggle('on', /** @type {HTMLElement} */ (b).dataset.sub === saved.sub);
  const body = $('home-body'), page = $('home-analyse');
  if (!body || !page) return;
  body.hidden = saved.sub === 'analyse';
  page.hidden = saved.sub !== 'analyse';
  if (currentPage() !== 'home' || saved.sub !== 'analyse') return;
  if (!app.meta) { page.innerHTML = `<p class="home-empty">${esc(t('homeNoProject'))}</p>`; return; }
  const tree = treeOf();
  if (!tree.lines.length) { page.innerHTML = `<p class="home-empty an-empty">${esc(t('anNoLines'))}</p>`; return; }
  const node = findNode(tree, saved.node) ?? tree;
  const facts = factsFor(node.lines);
  const today = ymd(new Date());
  const r = receipt(facts, { period, today });
  const crumb = pathTo(tree, node.id).map((n, i, a) => (i === a.length - 1 ? `<b>${esc(n.name)}</b>` : `<button type="button" class="an-crumb" data-node="${esc(n.id)}">${esc(n.name)}</button> ›`)).join(' ');
  const pick = picking ? `<input type="date" class="an-from" value="${iso(period?.from ?? '')}"> – <input type="date" class="an-to" value="${iso(period?.to ?? '')}">` : '';
  const dates = r.dates.count ? t('anDates3', dateText(r.dates.first), dateText(r.dates.last), r.dates.count, dateText(today)) : t('anToday', dateText(today));
  page.innerHTML = `<div class="an-page-grid"><nav class="an-tree">${treeHtml(tree, node.id)}</nav><div class="an-main">`
    + `<div class="an-bar-top"><span class="an-crumbs">${crumb}</span><span class="an-grow"></span>`
    + `<button type="button" class="an-chip an-all${picking ? '' : ' on'}">${esc(t('anAll'))}</button><button type="button" class="an-chip an-pick${picking ? ' on' : ''}">${esc(t('anPick'))}</button>${pick}`
    + `<button type="button" class="pop-btn an-xlsx">Excel</button><button type="button" class="pop-btn an-text">${esc(t('anText'))}</button></div>`
    + `<p class="an-note an-dates">${esc(dates)}</p>`
    + (r.scope.sum.trips ? blocks(r, node, facts) : `<p class="home-empty an-empty">${esc(t('anNothing'))}</p>`) + '</div></div>';
}

/** The receipt of the node on screen, for the exports. */
function current() {
  const tree = treeOf();
  const node = findNode(tree, saved.node) ?? tree;
  const r = receipt(factsFor(node.lines), { period, today: ymd(new Date()) });
  const periodText = r.dates.count ? `${dateText(r.dates.first)} – ${dateText(r.dates.last)} (${r.dates.count})` : '—';
  return { node, r, periodText };
}

async function exportText() {
  const { node, r, periodText } = current();
  const children = childRows(node).map((k) => ({ name: k.name, departures: k.r.production.planned.departures, km: k.r.production.planned.km, hours: k.r.production.planned.hours }));
  const text = receiptText(r, { title: node.name, periodText, labels: labels(), children });
  try { await navigator.clipboard.writeText(text); showMessage(t('anCopied')); } catch { showMessage(text); }
}

async function exportXlsx() {
  const fs = app.fs;
  if (!fs) return;
  const { node, r, periodText } = current();
  const head = [[node.name], [periodText], []];
  const p = r.production;
  /** @type {{ name: string, rows: (string | number | null)[][] }[]} */
  const sheets = [
    { name: t('anScopeHead'), rows: [...head, ['', t('anLines'), t('anTrips'), t('anDepartures'), t('anStops')], ...r.scope.rows.map((x) => [modeName(x.mode), x.lines, x.trips, x.departures, x.stops]), [t('anSum'), r.scope.sum.lines, r.scope.sum.trips, r.scope.sum.departures, r.scope.sum.stops]] },
    { name: t('anNetworkHead'), rows: [...head, ['', t('anRouted'), t('anKm'), t('anUnknown')], ...r.network.groups.map((g) => [profileName(g.profile), g.routed.stretches, Math.round(g.routed.km), g.unknown]), [t('anSumKnown'), r.network.sum.stretches, Math.round(r.network.sum.km), null]] },
    { name: t('anProdHead'), rows: [...head, ['', t('anPlanned'), t('anDone'), t('anRemaining')], ...(/** @type {[string, (x: import('../core/analysis/receipt.js').Prod) => number][]} */ ([[t('anDepartures'), (x) => x.departures], [t('anHours'), (x) => x.hours], [t('anKmKnown'), (x) => x.km], [t('anUnknownKmDeps'), (x) => x.unknownKmDepartures]])).map(([n, f]) => [n, Math.round(f(p.planned)), Math.round(f(p.done)), Math.round(f(p.remaining))]), [t('anAvgSpeed'), p.avgKmh == null ? null : Math.round(p.avgKmh * 10) / 10]] },
    { name: t('anFuelHead'), rows: [...head, ['', t('anDepartures'), t('anKm'), t('anHours'), t('anSeatKm')], ...r.fuel.rows.map((x) => [fuelName(x.fuel), x.departures, Math.round(x.km), Math.round(x.hours), x.seatKm == null ? null : Math.round(x.seatKm)]), [t('anSum'), r.fuel.sum.departures, Math.round(r.fuel.sum.km), Math.round(r.fuel.sum.hours), Math.round(r.fuel.sum.seatKm)], [t('anOfWhichUnknownKm'), r.fuel.unknownKm.departures, null, Math.round(r.fuel.unknownKm.hours), null]] },
    { name: t('anDayHead'), rows: [...head, ['', t('anDates'), t('anDepartures'), t('anHours'), t('anFirstLast')], ...r.dayTypes.map((d) => [t(`anDay_${d.type}`), d.dates, Math.round(d.departures), Math.round(d.hours), d.first == null ? null : `${clock(d.first)} – ${clock(d.last)}`])] },
    { name: t('anOverHead'), rows: [...head, [t('anDate'), t('anDepartures'), t('anKm')], ...perDate(factsFor(node.lines), period).map((d) => [dateText(d.date), d.departures, Math.round(d.km)])] },
  ];
  const now = new Date();
  const stamp = `${ymd(now)}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  const path = `analyse/${stamp} ${node.name.replace(/[\\/:*?"<>|]/g, '-')}.xlsx`;
  if (await runAction(() => fs.writeBytes(path, buildXlsx(sheets)))) showMessage(t('anSaved', path));
}

let wired = false;
export function initAnalysisPage() {
  onRefresh(renderAnalysisPage);
  onQuaysLoaded(renderAnalysisPage);
  if (wired) return;
  wired = true;
  document.addEventListener('click', (e) => {
    const el = /** @type {HTMLElement} */ (e.target);
    const sub = /** @type {HTMLElement | null} */ (el.closest?.('#home-tabs [data-sub]'));
    if (sub) { saved.sub = sub.dataset.sub === 'analyse' ? 'analyse' : 'todo'; keep(); renderAnalysisPage(); if (saved.sub === 'todo') renderDashboardPage(); return; }
    if (!el.closest?.('#home-analyse')) return;
    const nodeEl = /** @type {HTMLElement | null} */ (el.closest('[data-node]'));
    if (nodeEl?.dataset.node && (el.closest('.an-node, .an-crumb, .an-open'))) { saved.node = nodeEl.dataset.node; motionDate = null; keep(); renderAnalysisPage(); return; }
    if (el.closest('.an-all')) { picking = false; period = null; motionDate = null; renderAnalysisPage(); }
    else if (el.closest('.an-pick')) { picking = true; renderAnalysisPage(); }
    else if (el.closest('.an-by')) { byKm = /** @type {HTMLElement} */ (el.closest('.an-by')).dataset.by === 'km'; renderAnalysisPage(); }
    else if (el.closest('.an-text')) void exportText();
    else if (el.closest('.an-xlsx')) void exportXlsx();
  });
  document.addEventListener('change', (e) => {
    const el = /** @type {HTMLInputElement} */ (e.target);
    if (!el.closest?.('#home-analyse')) return;
    const raw = (/** @type {string} */ v) => v.replace(/-/g, '');
    if (el.matches('.an-from, .an-to')) {
      const from = raw(/** @type {HTMLInputElement} */ ($('home-analyse').querySelector('.an-from')).value);
      const to = raw(/** @type {HTMLInputElement} */ ($('home-analyse').querySelector('.an-to')).value);
      if (from && to) { period = from <= to ? { from, to } : { from: to, to: from }; motionDate = null; renderAnalysisPage(); }
    } else if (el.matches('.an-motion-date') && el.value) { motionDate = raw(el.value); renderAnalysisPage(); }
  });
}
