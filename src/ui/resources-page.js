// Ressurser (list pages, decided 2026-10-16): merkevarer and organisations in one list on the shared
// frame, mixed and sorted by name. Each opens its own editor with the navigator on the right:
// a merkevare is edited in full (name, website); an organisation comes from Entur's register and only
// its export ID (alias) can be changed. Edits wait in app.resourceDrafts until Lagre.
// The register's status and refresh live in Prosjektinnstillinger (entur-settings.js).
import { app } from './state.js';
import { onRefresh, currentPage, runAction } from './shell.js';
import { t } from '../i18n/strings.js';
import { createListView } from './list-view.js';
import { generatedAlias, aliasIssues, orgRole } from '../core/orgs.js';
import { writeOrgs } from '../project/orgs-store.js';
import { writeBrandings, newBranding } from '../project/brandings-store.js';
import { refreshRegister } from './org-register.js';

/**
 * @typedef {import('../project/brandings-store.js').Branding} Branding
 * @typedef {import('../core/orgs.js').Company} Company
 * @typedef {{ id: string, kind: 'branding', name: string, branding: Branding, used: number, unsaved: boolean, isNew: boolean }
 *   | { id: string, kind: 'org', name: string, company: Company, used: number, unsaved: boolean, changed: boolean, gone: boolean }} Resource
 */

const ROLES = /** @type {('authority' | 'operator')[]} */ (['authority', 'operator']);

/** @param {string} tag @param {string} cls @param {string} [text] */
const el = (tag, cls, text = '') => { const e = document.createElement(tag); e.className = cls; if (text) e.textContent = text; return e; };
/** @param {string} v */
const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** @param {Company} c */
const orgKey = (c) => `o:${c.organisationId || c.name}`;
/** @param {Branding} b */
const brandKey = (b) => `b:${b.id}`;
/** @returns {Map<string, any>} */
const drafts = () => app.resourceDrafts;

// ─── Use ────────────────────────────────────────────────────────────────────
/** How many route files name each ID, in #SEK (organisations) or #BRA (brandings). */
function usage() {
  /** @type {Map<string, number>} */
  const count = new Map();
  for (const r of app.routes) {
    const ids = new Set([...r.text.matchAll(/^[ \t]*#(?:SEK|BRA);([^;\r\n]*)/gm)].map((m) => m[1].trim()));
    for (const id of ids) count.set(id, (count.get(id) ?? 0) + 1);
  }
  return count;
}

// ─── The rows ───────────────────────────────────────────────────────────────
/** @returns {Resource[]} */
function allResources() {
  const used = usage();
  /** @type {Resource[]} */
  const rows = [];
  const saved = new Set(app.brandings.map(brandKey));
  for (const b of app.brandings) {
    const draft = drafts().get(brandKey(b));
    const shown = draft ?? b;
    rows.push({ id: brandKey(b), kind: 'branding', name: shown.name, branding: shown, used: used.get(b.id) ?? 0, unsaved: !!draft, isNew: false });
  }
  for (const [id, d] of drafts()) {
    if (id.startsWith('b:') && !saved.has(id)) rows.push({ id, kind: 'branding', name: d.name, branding: d, used: 0, unsaved: true, isNew: true });
  }
  if (!app.orgsError) {
    for (const c of app.orgs) {
      const key = c.organisationId || c.name;
      rows.push({ id: orgKey(c), kind: 'org', name: c.name, company: c, unsaved: drafts().has(orgKey(c)),
        used: Math.max(...ROLES.map((r) => (c[r] ? used.get(/** @type {any} */ (c[r]).id) ?? 0 : 0))),
        changed: app.orgChanges.changed.includes(key), gone: ROLES.some((r) => c[r] && app.orgChanges.missing.includes(/** @type {any} */ (c[r]).id)) });
    }
  }
  return rows;
}

/** @param {string} id */
const resource = (id) => allResources().find((r) => r.id === id) ?? null;

/** @param {Resource} r */
function detail(r) {
  if (r.kind === 'branding') return r.branding.url;
  return r.company.companyNumber ? `${t('orgCompanyNumber')} ${r.company.companyNumber}` : '';
}

/** @param {Resource} r */
function exportIds(r) {
  if (r.kind === 'branding') return r.branding.id;
  const cs = app.meta?.codespace ?? '';
  return ROLES.map((role) => r.company[role]).filter(Boolean).map((e) => /** @type {any} */ (e).alias || generatedAlias(/** @type {any} */ (e).id, cs)).join(', ');
}

/** @param {Resource} r */
function statusCell(r) {
  const parts = [];
  if (r.kind === 'org' && r.changed) parts.push(`<span class="lv-tag ending">${esc(t('orgChanged'))}</span>`);
  if (r.kind === 'org' && r.gone) parts.push(`<span class="lv-tag expired">${esc(t('orgGone'))}</span>`);
  if (r.unsaved) parts.push('<span class="lv-unsaved">●</span>');
  return parts.join(' ');
}

/** @param {Resource} r */
const typeText = (r) => t(r.kind === 'branding' ? 'rsTypeBranding' : 'rsTypeOrg');

// ─── Saving and deleting ────────────────────────────────────────────────────
/** Write brandings with the given drafts applied; unnamed ones are not saved. @param {string[]} ids */
async function saveBrandings(ids) {
  const fs = app.fs;
  if (!fs || app.brandingsError) return;
  let list = [...app.brandings];
  for (const id of ids) {
    const d = drafts().get(id);
    if (!d || !d.name.trim()) continue;
    const at = list.findIndex((b) => brandKey(b) === id);
    if (at >= 0) list[at] = { ...d }; else list = [...list, { ...d }];
  }
  await runAction(() => writeBrandings(fs, list.filter((b) => b.name.trim())));
  app.brandings = list;
  for (const id of ids) drafts().delete(id);
}

/** Write the organisations with the alias drafts applied. @param {string} id */
async function saveOrg(id) {
  const fs = app.fs;
  const d = drafts().get(id);
  if (!fs || !d || app.orgsError) return;
  for (const c of app.orgs) {
    if (orgKey(c) !== id) continue;
    for (const role of ROLES) {
      const entry = c[role];
      if (entry && entry.id in d) entry.alias = String(d[entry.id]).trim();
    }
  }
  await runAction(() => writeOrgs(fs, app.orgs));
  drafts().delete(id);
}

/** @param {string} id */
async function save(id) {
  if (id.startsWith('b:')) await saveBrandings([id]); else await saveOrg(id);
  renderResourcesPage();
}

/** Delete merkevarer (organisations come from the register: not deleted here). @param {string[]} ids */
async function deleteBrandings(ids) {
  const picked = /** @type {Resource[]} */ (ids.map(resource).filter((r) => r && r.kind === 'branding'));
  if (!picked.length || app.brandingsError) return;
  const users = picked.reduce((n, r) => n + r.used, 0);
  const ask = picked.length === 1 ? t('brandDeleteConfirm', picked[0].name, users) : t('brandDeleteMany', picked.length, users);
  if (!confirm(ask)) return;
  const gone = new Set(picked.map((r) => r.id));
  for (const id of gone) drafts().delete(id);
  const keep = app.brandings.filter((b) => !gone.has(brandKey(b)));
  const fs = app.fs;
  if (fs) await runAction(() => writeBrandings(fs, keep));
  app.brandings = keep;
  if (app.resourceSelected && gone.has(app.resourceSelected)) app.resourceSelected = null;
  renderResourcesPage();
}

function newBrandingDraft() {
  const b = newBranding(app.meta?.codespace ?? '');
  drafts().set(brandKey(b), b);
  open(brandKey(b));
  /** @type {HTMLInputElement | null} */ (document.querySelector('#re-name'))?.focus();
}

/** @param {string | null} id */
function open(id) {
  app.resourceSelected = id;
  renderResourcesPage();
}

// ─── The list ───────────────────────────────────────────────────────────────
/** @type {ReturnType<typeof createListView> | null} */
let view = null;

/** @param {HTMLElement} host */
function makeView(host) {
  view = createListView(host, {
    id: 'resources',
    defaultSort: { col: 'name', dir: 1 },
    rows: allResources,
    rowId: (r) => r.id,
    columns: [
      { key: 'type', label: () => t('rsColType'), width: '110px', sort: typeText, cell: (r) => esc(typeText(r)), text: typeText },
      { key: 'name', label: () => t('ltCol_name'), width: 'minmax(0, 2fr)', sort: (r) => r.name,
        cell: (r) => esc(r.name || t('tableSetUnnamed')), text: (r) => r.name },
      { key: 'detail', label: () => t('rsColDetail'), width: 'minmax(0, 1.5fr)', sort: detail, cell: (r) => esc(detail(r)), text: detail },
      { key: 'export', label: () => t('orgAliasLabel'), width: 'minmax(0, 1.5fr)', sort: exportIds, cell: (r) => esc(exportIds(r)), text: exportIds },
      { key: 'used', label: () => t('calColUsed'), width: '90px', sort: (r) => r.used, cell: (r) => esc(t('orgUsedBy', r.used)), text: (r) => String(r.used) },
      { key: 'status', label: () => t('ltCol_status'), width: '200px', cell: statusCell },
    ],
    renderFinders: (box, state, changed) => {
      box.innerHTML = `<input id="rs-search" type="search" autocomplete="off" placeholder="${esc(t('rsSearch'))}">
        <select id="rs-f-type"><option value="">${esc(t('rsAllTypes'))}</option><option value="branding">${esc(t('rsTypeBranding'))}</option>
          <option value="org">${esc(t('rsTypeOrg'))}</option></select>`;
      for (const id of ['rs-search', 'rs-f-type']) {
        const f = /** @type {HTMLInputElement} */ (box.querySelector('#' + id));
        if (state[id] != null) f.value = state[id];
        f.addEventListener(id === 'rs-search' ? 'input' : 'change', () => { state[id] = f.value; changed(); });
      }
    },
    matches: (r, st) => {
      if (st['rs-f-type'] && r.kind !== st['rs-f-type']) return false;
      const q = String(st['rs-search'] ?? '').trim().toLowerCase();
      return !q || [r.name, detail(r), exportIds(r)].some((s) => s.toLowerCase().includes(q));
    },
    tools: [
      { id: 'rs-new', label: () => t('brandAdd'), enabled: () => !app.brandingsError, run: newBrandingDraft },
      { id: 'rs-edit', label: () => t('lvEdit'), enabled: (sel) => sel.length === 1, run: (sel) => open(sel[0]) },
      { id: 'rs-del', label: () => t('ltDelete'), danger: true, enabled: (sel) => sel.length > 0 && sel.every((id) => id.startsWith('b:')),
        run: (sel) => { void deleteBrandings(sel); } },
      { id: 'rs-refresh', label: () => t('rsRefresh'), enabled: () => app.orgRegisterStatus !== 'loading', run: () => { void refreshRegister(); } },
    ],
    onEdit: (id) => open(id),
    onDelete: (ids) => { if (ids.every((id) => id.startsWith('b:'))) void deleteBrandings(ids); },
    empty: () => t(allResources().length ? 'noMatches' : 'rsNone'),
  });
}

/** The resources in the list's order and filter (the editor's navigator follows it). */
function resourceOrder() {
  const all = allResources();
  const ids = view ? view.order().filter((id) => all.some((r) => r.id === id)) : [];
  return ids.length ? ids : [...all].sort((a, b) => a.name.localeCompare(b.name, 'nb')).map((r) => r.id);
}

// ─── The editors ────────────────────────────────────────────────────────────
/** @param {Resource} r */
function navigator(r) {
  const side = el('div', 're-nav');
  const back = el('button', 're-back', t('rsBack'));
  back.addEventListener('click', () => open(null));
  side.appendChild(back);
  const ids = resourceOrder();
  if (!ids.includes(r.id)) ids.unshift(r.id);
  for (const other of /** @type {Resource[]} */ (ids.map(resource).filter(Boolean))) {
    const item = el('div', `re-item re-${other.kind}${other.id === r.id ? ' active' : ''}`, `${other.name || t('tableSetUnnamed')}${other.unsaved ? ' ●' : ''}`);
    item.dataset.id = other.id;
    item.addEventListener('click', () => { if (other.id !== r.id) open(other.id); });
    side.appendChild(item);
  }
  return side;
}

/**
 * The editor's footer: state, Forkast, Lagre.
 * @param {Resource} r @param {boolean} valid
 */
function footer(r, valid) {
  const foot = el('div', 'ce-foot');
  const state = el('span', 're-state ef-state', r.unsaved ? `● ${t('unsavedChanges')}` : '');
  const discard = /** @type {HTMLButtonElement} */ (el('button', 're-discard ef-discard', t('discardLine')));
  discard.disabled = !r.unsaved;
  discard.addEventListener('click', () => {
    drafts().delete(r.id);
    if (r.kind === 'branding' && r.isNew) open(null); else renderResourcesPage();
  });
  const saveBtn = /** @type {HTMLButtonElement} */ (el('button', `re-save ef-save-btn${r.unsaved ? ' dirty' : ''}`, t(r.unsaved ? 'save' : 'savedBtn')));
  saveBtn.disabled = !r.unsaved || !valid;
  saveBtn.addEventListener('click', () => { void save(r.id); });
  foot.append(el('span', 'ef-spacer'), state, discard, saveBtn);
  return foot;
}

/** Mark the footer as changed without rebuilding the form (the field keeps its focus). @param {HTMLElement} main @param {boolean} valid */
function touched(main, valid) {
  main.querySelector('.re-state')?.replaceChildren(document.createTextNode(`● ${t('unsavedChanges')}`));
  const s = /** @type {HTMLButtonElement} */ (main.querySelector('.re-save'));
  s.disabled = !valid;
  s.textContent = t('save');
  s.classList.add('dirty');
  /** @type {HTMLButtonElement} */ (main.querySelector('.re-discard')).disabled = false;
}

/** @param {HTMLElement} main @param {string} label @param {HTMLElement} field */
function row(main, label, field) {
  const line = el('label', 're-row');
  line.append(el('span', 're-label', label), field);
  main.appendChild(line);
}

/** @param {HTMLElement} main @param {Resource & { kind: 'branding' }} r */
function brandingForm(main, r) {
  main.appendChild(el('div', 're-title', `${t('rsTypeBranding')} · ${r.name || t('tableSetUnnamed')}`));
  if (app.brandingsError) main.appendChild(el('p', 'assets-status bad', t('brandsUnreadable')));
  for (const field of /** @type {('name' | 'url')[]} */ (['name', 'url'])) {
    const input = /** @type {HTMLInputElement} */ (el('input', 're-in'));
    input.id = `re-${field}`;
    input.value = r.branding[field];
    input.autocomplete = 'off';
    if (field === 'name') input.classList.toggle('invalid', !r.branding.name.trim());
    input.addEventListener('keydown', (e) => e.stopPropagation());
    input.addEventListener('input', () => {
      const d = { ...(drafts().get(r.id) ?? r.branding), [field]: input.value };
      drafts().set(r.id, d);
      const valid = !!d.name.trim();
      if (field === 'name') input.classList.toggle('invalid', !valid);
      touched(main, valid && !app.brandingsError);
    });
    row(main, t(field === 'name' ? 'brandName' : 'brandUrl'), input);
  }
  row(main, t('rsColId'), el('span', 're-static', r.branding.id));
  main.appendChild(el('div', 're-note', t('orgUsedBy', r.used)));
  main.appendChild(footer(r, !!r.branding.name.trim() && !app.brandingsError));
  if (!r.isNew) {
    const del = el('button', 're-del danger', t('ltDelete'));
    del.addEventListener('click', () => { void deleteBrandings([r.id]); });
    /** @type {HTMLElement} */ (main.querySelector('.ce-foot')).prepend(del);
  }
}

/**
 * Is this alias wrong? The role must match and no other organisation may have it.
 * @param {string} nog @param {string} typed @param {'authority' | 'operator'} role
 */
function aliasProblem(nog, typed, role) {
  if (typed && orgRole(typed) !== role) return t('orgAliasFormat');
  const trial = app.orgs.map((c) => ({ ...c,
    authority: c.authority && (c.authority.id === nog ? { ...c.authority, alias: typed } : c.authority),
    operator: c.operator && (c.operator.id === nog ? { ...c.operator, alias: typed } : c.operator) }));
  return aliasIssues(trial, app.meta?.codespace ?? '').some((i) => i.nogId === nog && i.code === 'org-alias-duplicate') ? t('orgAliasDuplicate') : '';
}

/** @param {HTMLElement} main @param {Resource & { kind: 'org' }} r */
function orgForm(main, r) {
  const c = r.company;
  main.appendChild(el('div', 're-title', `${t('rsTypeOrg')} · ${c.name}`));
  const facts = el('div', 're-facts');
  for (const [label, value] of [[t('orgCompanyNumber'), c.companyNumber], [t('rsLegalName'), c.legalName], [t('rsTradingName'), c.tradingName]]) {
    if (value) facts.appendChild(el('div', '', `${label}: ${value}`));
  }
  if (r.changed) facts.appendChild(el('div', 'org-mark', t('orgChanged')));
  main.appendChild(facts);
  const draft = drafts().get(r.id) ?? {};
  const cs = app.meta?.codespace ?? '';
  /** @type {HTMLInputElement[]} */
  const inputs = [];
  const allValid = () => inputs.every((i) => !i.classList.contains('invalid'));
  for (const role of ROLES) {
    const entry = c[role];
    if (!entry) continue;
    const box = el('div', 're-role');
    box.appendChild(el('div', 're-role-h', t(role === 'authority' ? 'roleAuthority' : 'roleOperator')));
    const ct = entry.contact;
    box.appendChild(el('div', 're-static', [entry.id, ct.email, ct.phone, ct.url].filter(Boolean).join(' · ')));
    if (app.orgChanges.missing.includes(entry.id)) box.appendChild(el('div', 'org-mark bad', t('orgGone')));
    const input = /** @type {HTMLInputElement} */ (el('input', 're-alias'));
    input.dataset.nog = entry.id;
    input.value = entry.id in draft ? draft[entry.id] : entry.alias ?? '';
    input.placeholder = generatedAlias(entry.id, cs);
    input.autocomplete = 'off';
    const msg = el('span', 'org-alias-msg');
    const check = () => { const p = aliasProblem(entry.id, input.value.trim(), role); input.classList.toggle('invalid', !!p); msg.textContent = p; };
    check();
    input.addEventListener('keydown', (e) => e.stopPropagation());
    input.addEventListener('input', () => {
      drafts().set(r.id, { ...(drafts().get(r.id) ?? {}), [entry.id]: input.value });
      check();
      touched(main, allValid() && !app.orgsError);
    });
    inputs.push(input);
    const line = el('label', 're-row');
    line.append(el('span', 're-label', t('orgAliasLabel')), input, msg);
    box.appendChild(line);
    main.appendChild(box);
  }
  main.appendChild(el('div', 're-note', t('orgUsedBy', r.used)));
  main.appendChild(footer(r, allValid() && !app.orgsError));
}

/** @param {HTMLElement} body @param {Resource} r */
function renderEditor(body, r) {
  const wrap = el('div', 're-editor');
  const main = el('div', 're-main');
  if (r.kind === 'branding') brandingForm(main, r); else orgForm(main, r);
  wrap.append(main, navigator(r));
  body.appendChild(wrap);
}

// ─── The page ───────────────────────────────────────────────────────────────
export function renderResourcesPage() {
  if (currentPage() !== 'assets') return;
  const body = document.getElementById('resources-body');
  if (!body) return;
  const reset = (/** @type {string} */ mode) => { body.innerHTML = ''; body.dataset.mode = mode; };
  if (!app.meta) { reset('none'); body.appendChild(el('p', 'assets-coming', t('noProjectOpen'))); return; }
  const r = app.resourceSelected ? resource(app.resourceSelected) : null;
  if (r) { reset('editor'); renderEditor(body, r); return; }
  app.resourceSelected = null;
  const problems = [app.orgsError ? t('orgsUnreadable') : '', app.brandingsError ? t('brandsUnreadable') : ''].filter(Boolean).join(' ');
  if (body.dataset.mode !== 'list' || !view || body.dataset.problems !== problems) {
    reset('list');
    body.dataset.problems = problems;
    if (problems) body.appendChild(el('p', 'assets-status bad rs-problems', problems));
    const host = el('div', 'rs-list-host');
    body.appendChild(host);
    makeView(host);
  }
  /** @type {ReturnType<typeof createListView>} */ (view).render();
}

export function initResourcesPage() {
  onRefresh(renderResourcesPage);
}
