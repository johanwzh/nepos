// Knutepunkt (interchanges spec 2026-10-31, the user's mockup): a power tool in place of the timetable, like Ruting.
// Top: the line, its table sets (and periods) and ✕. Left: every stop of the table set with a switch (user 2026-10-31:
// all stops listed, turned on and off — fewer clicks and a better overview than adding hubs one by one). Middle: the
// timeline at the selected hub, where our trips are picked, and Forslag, the approval round. Right: what our trips wait
// for. Hubs and links are part of the line (ERN): every change is an edit of the line; Godkjenn saves it. While the
// view is open the rest of the app is locked; ✕ and Esc are the ways out.
import { app } from './state.js';
import { t, getLang } from '../i18n/strings.js';
import { onRefresh, refreshAll, markDirty } from './shell.js';
import { onToolChange, setTool, setLeaveGuard, setToolEsc, activeTool } from './power-tools.js';
import { grid } from './grid.js';
import { quayInfo } from './quays.js';
import { lineState } from './line-info.js';
import { saveRoute, storeGrid, switchPeriod, switchTableSet, periodLabel } from './route-editor.js';
import { periodsOf } from './route-state.js';
import { newHub, hubRows, hubState } from '../core/interchanges/hub.js';
import { lineTrips } from '../core/interchanges/trips.js';
import { candidates } from '../core/interchanges/match.js';
import { proposals, approve } from '../core/interchanges/proposals.js';
import { cellToMins } from '../core/interpolate.js';
import { lineModeOf } from '../core/quays.js';
import { modeLabel } from '../i18n/modes.js';
import { drawHubTimeline } from './hub-timeline.js';

/** @typedef {import('../core/interchanges/hub.js').Hub} Hub */
/** @typedef {import('../core/interchanges/proposals.js').Proposal} Proposal */

let isOpen = false;
let wired = false;
let code = '';
/** @type {number | null} the selected hub's row */
let selRow = null;
/** A pick's chosen candidate, by our trip's uid; dropped by Forkast, written by Godkjenn. @type {Record<string, number>} */
let choices = {};
/** @type {[number, number] | null} the timeline's time span (null: fit) */
let view = null;

const esc = (/** @type {unknown} */ s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
const hhmm = (/** @type {number | null} */ m) => (m == null ? '—' : `${String(Math.floor((((m % 1440) + 1440) % 1440) / 60)).padStart(2, '0')}:${String((((m % 1440) + 1440) % 1440) % 60).padStart(2, '0')}${m >= 1440 ? ' +1' : ''}`);
const root = () => /** @type {HTMLElement} */ (document.getElementById('hub-view'));
/** A stop's name for people: the StopPlace's, else the id. @param {string} id */
const placeName = (id) => {
  for (const info of quayInfo.values()) if (info?.stopPlaceId === id) return info.stopPlaceName || id;
  return quayInfo.get(id)?.stopPlaceName ?? id;
};

/** Every exported line as it is now, ours included (the feeders, and our own trips). */
function lines() {
  return app.routes.filter((r) => r.status !== 'damaged')
    .map((r) => ({ code: r.code, rs: lineState(r.code) }))
    .filter((r) => r.rs && (r.code === code || r.rs.exported !== false));
}
const ctx = () => ({ calendars: app.calendars, quayInfo, ownCode: code });
/** The selected hub, when its row still has one. @returns {Hub | null} */
const hub = () => (selRow != null ? grid.stops[selRow]?.hub ?? null : null);
/** Our trips at a row: the grid's columns with a time there (an interval block's are shown, not pickable). @param {number} ri */
function oursAt(ri) {
  return grid.cols.flatMap((col, ci) => {
    const dep = col.virt ? null : cellToMins(col.cells[ri]);
    return dep == null || !col.uid ? [] : [{ ci, col, dep, block: !!col.block }];
  });
}

/** A change to the hubs: the line is changed; the view follows. */
function changed() {
  markDirty();
  render();
}

function render() {
  const el = root();
  if (!isOpen || !el || !app.routeState) return;
  const rs = app.routeState;
  if (selRow != null && !grid.stops[selRow]?.hub) selRow = null;
  const sets = (rs.tableSets ?? []).map((/** @type {any} */ s) => `<button type="button" class="rv-set hv-set${s.id === rs.activeSet ? ' on' : ''}" data-set="${s.id}">${esc(s.name || '—')}</button>`).join('');
  const pers = periodsOf(rs, rs.activeSet);
  const perChips = pers.length > 1 ? pers.map((/** @type {any} */ p) => `<button type="button" class="rv-set hv-per${p.id === rs.activePer ? ' on' : ''}" data-per="${p.id}">${esc(periodLabel(p))}</button>`).join('') : '';
  const name = app.routes.find((r) => r.code === code) ? `${rs.publicCode || code} ${rs.routeName || ''}`.trim() : code;
  el.innerHTML = `<div class="rv-top hv-top"><span class="rv-title">${esc(t('hvTitle'))}</span><span class="hv-line">${esc(name)}</span><div class="rv-sets">${sets}${perChips}</div><button type="button" class="rv-x hv-close" title="Esc">✕</button></div>`
    + `<div class="hv-body"><div class="hv-stops">${stopList()}</div><div class="hv-mid">${middle()}</div><div class="hv-side">${side()}</div></div>`;
  const tl = /** @type {HTMLElement | null} */ (el.querySelector('.hv-timeline'));
  if (tl && hub() && selRow != null) drawTimeline(tl, selRow);
}

/** The left list: every stop row of the table set, each with its switch. */
function stopList() {
  const rows = hubRows(grid);
  if (!rows.length) return `<p class="rv-note">${esc(t('hvNoStops'))}</p>`;
  return `<div class="rv-head">${esc(t('hvStops'))}</div><ul class="hv-list">${rows.map((ri) => {
    const s = grid.stops[ri];
    const state = hubState(grid, ri);
    const links = grid.cols.map((c) => c.cells[ri]?.hubLink).filter(Boolean);
    const sub = s.hub ? `<small>${state === 'lost' ? esc(t('hvLost')) : esc(t('hvCounts', links.length, links.filter((l) => l.line).length))}</small>` : '';
    return `<li class="hv-stop${s.hub ? ' hv-is-on' : ''}${ri === selRow ? ' on' : ''}${state === 'lost' ? ' hv-lost' : ''}" data-row="${ri}">`
      + `<label class="hv-switch" title="${esc(t('hvToggle'))}"><input type="checkbox" class="hv-on"${s.hub ? ' checked' : ''}></label>`
      + `<span class="hv-name">${esc(s.name || s.stopId)}${sub}</span></li>`;
  }).join('')}</ul>`;
}

/** The selected hub's proposals (the approval round), computed against the lines as they are now. @returns {Proposal[]} */
const props = () => (selRow != null && hub() ? proposals(grid, selRow, lines(), ctx()) : []);

function middle() {
  const h = hub();
  if (!h || selRow == null) return `<p class="rv-note hv-hint">${esc(t('hvPickStop'))}</p>`;
  const list = props();
  const stateText = (/** @type {Proposal} */ p) => `<span class="hv-st hv-st-${p.state}">${esc(t(`hvState_${p.state}`))}</span>`;
  const feederName = (/** @type {{ line: string }} */ c) => { const r = lineState(c.line); return `${r?.publicCode || c.line} ${r?.routeName ?? ''}`.trim(); };
  const rows = list.map((p) => {
    const col = grid.cols[p.ci];
    const tripName = col?.tripNo || `${t('hvTrip')} ${p.ci + 1}`;
    const cands = p.state === 'pick' ? p.candidates : p.pick ? [p.pick] : [];
    const chosen = choices[p.trip];
    const cells = (/** @type {any} */ c, /** @type {number} */ i) => {
      const radio = p.state === 'pick' ? `<input type="radio" name="pick-${esc(p.trip)}" value="${i}"${chosen === i ? ' checked' : ''}> ` : '';
      return `<td>${radio}${esc(feederName(c))}</td><td>${hhmm(c.arr)}</td><td>${c.transfer} min</td><td>${c.commonDays}</td>`;
    };
    if (!cands.length) {
      const old = p.link.line ? `${esc(feederName({ line: p.link.line }))}` : '—';
      return `<tr data-trip="${esc(p.trip)}" data-state="${p.state}"><td>${esc(tripName)}</td><td>${hhmm(p.dep)}</td><td>${old}</td><td>${p.link.line ? hhmm(p.link.arr ?? null) : '—'}</td><td>—</td><td>—</td><td>${stateText(p)}</td></tr>`;
    }
    return cands.map((c, i) => (i === 0
      ? `<tr data-trip="${esc(p.trip)}" data-state="${p.state}"><td rowspan="${cands.length}">${esc(tripName)}</td><td rowspan="${cands.length}">${hhmm(p.dep)}</td>${cells(c, i)}<td rowspan="${cands.length}">${stateText(p)}</td></tr>`
      : `<tr class="hv-alt">${cells(c, i)}</tr>`)).join('');
  }).join('');
  const table = list.length
    ? `<table class="hv-proposals"><tr><th>${esc(t('hvColTrip'))}</th><th>${esc(t('hvColDep'))}</th><th>${esc(t('hvColFeeder'))}</th><th>${esc(t('hvColArr'))}</th><th>${esc(t('hvColTransfer'))}</th><th>${esc(t('hvColDays'))}</th><th>${esc(t('hvColState'))}</th></tr>${rows}</table>`
    : `<p class="rv-note">${esc(t('hvNoTrips'))}</p>`;
  return `<div class="rv-head">${esc(grid.stops[selRow].name || '')}</div><div class="hv-timeline"></div>`
    + `<div class="rv-sub">${esc(t('hvProposals'))}</div>${table}`
    + `<div class="hv-actions"><button type="button" class="hv-find">${esc(t('hvFind'))}</button><button type="button" class="hv-approve primary">${esc(t('hvApprove'))}</button><button type="button" class="hv-discard">${esc(t('hvDiscard'))}</button><span class="rv-note">${esc(t('hvOnlyApproved'))}</span></div>`;
}

/** @param {HTMLElement} el @param {number} ri */
function drawTimeline(el, ri) {
  const h = /** @type {Hub} */ (hub());
  const all = lines();
  const c = ctx();
  const memo = new WeakMap();
  const own = all.find((l) => l.code === code);
  const trips = own ? lineTrips(own.rs, { calendars: c.calendars, memo }) : [];
  const ours = oursAt(ri).map((o) => ({ trip: o.col.uid, dep: o.dep, picked: !!o.col.cells[ri]?.hubLink, block: o.block }));
  // The feeders near our departures: every arrival up to an hour before, grey outside the window
  const wide = { ...h, window: /** @type {[number, number]} */ ([0, Math.max(60, h.window[1])]), walk: 0 };
  /** @type {Map<string, { line: string, label: string, arrs: Map<string, { trip: string, arr: number, candidate: boolean }> }>} */
  const feeders = new Map();
  for (const o of ours) {
    if (o.block) continue;
    const trip = trips.find((x) => x.uid === o.trip && x.calls.some((k) => k.ri === ri));
    if (!trip) continue;
    for (const cand of candidates(wide, ri, trip, all, { ...c, memo })) {
      const r = lineState(cand.line);
      const row = feeders.get(cand.line) ?? { line: cand.line, label: `${r?.publicCode || cand.line} ${modeLabel(cand.mode, getLang())}`.trim(), arrs: new Map() };
      const key = `${cand.trip}|${cand.arr}`;
      const ok = cand.transfer >= h.window[0] && cand.transfer <= h.window[1] && cand.transfer >= h.walk;
      const prev = row.arrs.get(key);
      row.arrs.set(key, { trip: cand.trip, arr: cand.arr, candidate: ok || !!prev?.candidate });
      feeders.set(cand.line, row);
    }
  }
  /** @type {import('./hub-timeline.js').TimelineLink[]} */
  const links = [];
  for (const p of props()) {
    if (p.state === 'same' && p.pick) links.push({ line: p.pick.line, trip: p.pick.trip, arr: p.pick.arr, to: p.trip, kind: 'approved' });
    else if ((p.state === 'new' || p.state === 'changed') && p.pick) links.push({ line: p.pick.line, trip: p.pick.trip, arr: p.pick.arr, to: p.trip, kind: 'proposal' });
    else if (p.state === 'pick') for (const k of p.candidates) links.push({ line: k.line, trip: k.trip, arr: k.arr, to: p.trip, kind: 'pick' });
  }
  drawHubTimeline(el, { ours, feeders: [...feeders.values()].map((f) => ({ ...f, arrs: [...f.arrs.values()] })), window: h.window, links, view, oursLabel: t('hvOurs') }, {
    onPick: (trip) => togglePick(ri, trip),
    onView: (v) => { view = v; const tl = /** @type {HTMLElement | null} */ (root().querySelector('.hv-timeline')); if (tl) drawTimeline(tl, ri); },
  });
}

/** The right side: what our trips at the selected hub wait for. */
function side() {
  const h = hub();
  if (!h || selRow == null) return '';
  const c = h.criteria ?? {};
  const all = lines();
  const orgs = (/** @type {'isAuthority' | 'isOperator'} */ role) => {
    /** @type {Map<string, string>} */ const m = new Map();
    for (const l of all) for (const s of l.rs.sek ?? []) if (s[role]) m.set(s.orgId, s.name || s.orgId);
    return [...m];
  };
  const modes = [...new Set(all.map((l) => lineModeOf(l.rs)).filter(Boolean))];
  const places = new Map();
  for (const l of all) for (const g of Object.values(l.rs.grids ?? {})) for (const s of /** @type {any} */ (g).stops ?? []) {
    const sp = s.stopId ? quayInfo.get(String(s.stopId))?.stopPlaceId : null;
    if (sp) places.set(sp, placeName(sp));
  }
  const pills = (/** @type {string[]} */ ids, /** @type {string} */ kind) => ids.map((id) => `<span class="hv-pill" data-${kind}="${esc(id)}">${esc(placeName(id))} <button type="button" class="hv-x" title="${esc(t('hvRemove'))}">✕</button></span>`).join('');
  const datalist = `<datalist id="hv-places">${[...places].map(([id, n]) => `<option value="${esc(id)}">${esc(n)}</option>`).join('')}</datalist>`;
  const checks = (/** @type {[string, string][]} */ list, /** @type {string[] | undefined} */ on, /** @type {string} */ cls) => list.map(([id, n]) =>
    `<label class="hv-check"><input type="checkbox" class="${cls}" value="${esc(id)}"${on?.includes(id) ? ' checked' : ''}> ${esc(n)}</label>`).join('') || '—';
  const picked = grid.cols.filter((col) => col.cells[selRow ?? -1]?.hubLink).length;
  return `<div class="rv-info hv-criteria">${datalist}<div class="rv-head">${esc(t('hvCriteria'))}</div>`
    + `<div class="rv-sub">${esc(t('hvWhere'))}</div><div class="hv-pills">${pills(h.stops, 'stop')}</div>`
    + `<input class="hv-addstop" list="hv-places" placeholder="${esc(t('hvAddStop'))}"> <label>${esc(t('hvRadius'))} <input type="number" min="0" step="50" class="hv-radius" value="${h.radiusM ?? ''}"> m</label>`
    + `<div class="hv-nums"><label>${esc(t('hvWindow'))} <input type="number" min="0" max="120" class="hv-win0" value="${h.window[0]}">–<input type="number" min="0" max="120" class="hv-win1" value="${h.window[1]}"> min</label>`
    + `<label>${esc(t('hvMaxWait'))} <input type="number" min="0" max="60" class="hv-maxwait" value="${h.maxWait}"> min</label>`
    + `<label>${esc(t('hvWalk'))} <input type="number" min="0" max="60" class="hv-walk" value="${h.walk}"> min</label></div>`
    + `<div class="rv-sub">${esc(t('hvFeeder'))}</div>`
    + `<div class="hv-crit"><b>${esc(t('hvAuthority'))}</b>${checks(orgs('isAuthority'), c.authority, 'hv-auth')}</div>`
    + `<div class="hv-crit"><b>${esc(t('hvOperator'))}</b>${checks(orgs('isOperator'), c.operator, 'hv-oper')}</div>`
    + `<label class="hv-crit"><b>${esc(t('hvMode'))}</b> <select class="hv-mode"><option value="">${esc(t('hvAny'))}</option>${modes.map((m) => `<option value="${esc(m)}"${c.mode === m ? ' selected' : ''}>${esc(modeLabel(m, getLang()))}</option>`).join('')}</select></label>`
    + `<label class="hv-crit"><b>${esc(t('hvPublicCode'))}</b> <input class="hv-public" value="${esc(c.publicCode ?? '')}"></label>`
    + `<div class="hv-crit"><b>${esc(t('hvCalledAt'))}</b><div class="hv-pills">${pills(c.calledAt ?? [], 'called')}</div><input class="hv-addcalled" list="hv-places" placeholder="${esc(t('hvAddStop'))}"></div>`
    + `<div class="rv-sub">${esc(t('hvTrips'))}</div><p class="rv-note">${esc(t('hvTripsNote', picked, oursAt(selRow).filter((o) => !o.block).length))}</p>`
    + '<div class="hv-actions"><button type="button" class="hv-all">' + esc(t('hvAll')) + '</button><button type="button" class="hv-none">' + esc(t('hvNone')) + '</button></div></div>';
}

/** Pick or unpick one of our trips at a row. @param {number} ri @param {string} uid */
function togglePick(ri, uid) {
  const col = grid.cols.find((c) => c.uid === uid);
  const cell = col?.cells[ri];
  if (!cell) return;
  if (cell.hubLink) delete cell.hubLink; else cell.hubLink = {};
  delete choices[uid];
  changed();
}

/** @param {number} ri @param {boolean} on */
function setHub(ri, on) {
  const stop = grid.stops[ri];
  if (!stop) return;
  if (on) {
    stop.hub = newHub(String(stop.stopId), quayInfo);
    selRow = ri;
  } else {
    const linked = grid.cols.some((c) => c.cells[ri]?.hubLink?.line);
    if (linked && !confirm(t('hvOffQ', stop.name || stop.stopId))) { render(); return; }
    delete stop.hub;
    for (const c of grid.cols) if (c.cells[ri]?.hubLink) delete c.cells[ri].hubLink;
    if (selRow === ri) selRow = null;
  }
  choices = {};
  view = null;
  changed();
}

/** Read one criteria field into the hub. @param {HTMLElement} el */
function readField(el) {
  const h = hub();
  if (!h) return;
  const num = (/** @type {string} */ v, /** @type {number} */ d) => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= 0 ? n : d; };
  const v = /** @type {HTMLInputElement} */ (el).value;
  const c = { ...(h.criteria ?? {}) };
  const boxes = (/** @type {string} */ cls) => [...root().querySelectorAll(`input.${cls}:checked`)].map((b) => /** @type {HTMLInputElement} */ (b).value);
  if (el.matches('.hv-radius')) h.radiusM = num(v, 0) || null;
  else if (el.matches('.hv-win0')) h.window = [Math.min(num(v, 2), h.window[1]), h.window[1]];
  else if (el.matches('.hv-win1')) h.window = [h.window[0], Math.max(num(v, 15), h.window[0])];
  else if (el.matches('.hv-maxwait')) h.maxWait = Math.min(60, num(v, 5));
  else if (el.matches('.hv-walk')) h.walk = Math.min(60, num(v, 0));
  else if (el.matches('.hv-auth')) c.authority = boxes('hv-auth');
  else if (el.matches('.hv-oper')) c.operator = boxes('hv-oper');
  else if (el.matches('.hv-mode')) c.mode = v;
  else if (el.matches('.hv-public')) c.publicCode = v.trim();
  else if (el.matches('.hv-addstop') && v.trim()) h.stops = [...new Set([...h.stops, v.trim()])];
  else if (el.matches('.hv-addcalled') && v.trim()) c.calledAt = [...new Set([...(c.calledAt ?? []), v.trim()])];
  else return;
  // Unset criteria are left out (the file writes empty fields)
  for (const k of /** @type {(keyof typeof c)[]} */ (Object.keys(c))) { const x = c[k]; if (Array.isArray(x) ? !x.length : !x) delete c[k]; }
  h.criteria = c;
  changed();
}

function build() {
  const el = root();
  if (!el || el.dataset.wired) return; // once per page (tests load the page again)
  el.dataset.wired = '1';
  el.addEventListener('click', (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    if (target.closest('.hv-close')) { setTool(''); return; }
    const setBtn = /** @type {HTMLElement | null} */ (target.closest('.hv-set'));
    if (setBtn) { storeGrid(); switchTableSet(Number(setBtn.dataset.set)); selRow = null; choices = {}; view = null; render(); return; }
    const perBtn = /** @type {HTMLElement | null} */ (target.closest('.hv-per'));
    if (perBtn) { storeGrid(); switchPeriod(Number(perBtn.dataset.per)); selRow = null; choices = {}; view = null; render(); return; }
    const li = /** @type {HTMLElement | null} */ (target.closest('.hv-stop'));
    if (li && !target.closest('.hv-switch')) {
      const ri = Number(li.dataset.row);
      if (grid.stops[ri]?.hub) { selRow = ri; choices = {}; view = null; render(); }
      return;
    }
    const pill = /** @type {HTMLElement | null} */ (target.closest('.hv-x') ? target.closest('.hv-pill') : null);
    const h = hub();
    if (pill && h) {
      if (pill.dataset.stop) h.stops = h.stops.filter((s) => s !== pill.dataset.stop);
      if (pill.dataset.called) { h.criteria = { ...h.criteria, calledAt: (h.criteria.calledAt ?? []).filter((s) => s !== pill.dataset.called) }; if (!h.criteria.calledAt?.length) delete h.criteria.calledAt; }
      changed();
      return;
    }
    if (selRow == null || !h) return;
    const ri = selRow;
    if (target.closest('.hv-all') || target.closest('.hv-none')) {
      const on = !!target.closest('.hv-all');
      for (const o of oursAt(ri)) {
        if (o.block) continue;
        const cell = o.col.cells[ri];
        if (on && !cell.hubLink) cell.hubLink = {};
        if (!on && cell.hubLink) delete cell.hubLink;
      }
      choices = {};
      changed();
    } else if (target.closest('.hv-find')) render();
    else if (target.closest('.hv-discard')) { choices = {}; render(); }
    else if (target.closest('.hv-approve')) {
      const out = approve(props(), choices, new Date());
      for (const col of grid.cols) if (col.uid && out[col.uid] && col.cells[ri]) col.cells[ri].hubLink = out[col.uid];
      choices = {};
      markDirty();
      void saveRoute().then(render);
    }
  });
  el.addEventListener('change', (e) => {
    const target = /** @type {HTMLInputElement} */ (e.target);
    if (target.matches('.hv-on')) { setHub(Number(/** @type {HTMLElement} */ (target.closest('.hv-stop')).dataset.row), target.checked); return; }
    if (target.type === 'radio' && target.name.startsWith('pick-')) { choices[target.name.slice(5)] = Number(target.value); return; }
    readField(target);
  });
}

function open() {
  if (!app.activeRoute || !app.routeState || !grid.active) { setTool(''); return; }
  storeGrid();
  code = app.activeRoute;
  isOpen = true;
  selRow = null; choices = {}; view = null;
  document.body.classList.add('hub-on');
  build();
  render();
}

function close() {
  isOpen = false;
  document.body.classList.remove('hub-on');
  const el = root();
  if (el) el.replaceChildren();
  refreshAll();
}

/** Esc steps back: the selected hub first; with none selected the view closes. */
function stepBack() {
  if (selRow != null) { selRow = null; choices = {}; view = null; render(); return true; }
  return false;
}

export function initHubView() {
  if (isOpen) close();
  // Leaving with a pick chosen but not approved asks first
  setLeaveGuard('hub', () => !Object.keys(choices).length || confirm(t('hvLeave')));
  setToolEsc('hub', stepBack);
  if (wired) return;
  wired = true;
  onRefresh(() => { if (isOpen && activeTool() === 'hub') render(); });
  onToolChange((name) => {
    if (name === 'hub' && !isOpen) open();
    else if (name !== 'hub' && isOpen) close();
  });
}
