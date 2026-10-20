// Ressurser (list pages, decided 2026-10-16): merkevarer and organisations in one list on the shared
// frame, mixed and sorted by name. An organisation is listed once per role (Autoritet, Operatør): in
// NeTEx the role is the thing referred to, with its own ID. Each opens its own editor with the
// navigator on the right: a merkevare is edited in full (name, website); a role comes from Entur's
// register and only its export ID (alias) can be changed, after the fixed "ABC:Authority:" prefix.
// Edits wait in app.resourceDrafts until Lagre.
// The register's status and refresh live in Prosjektinnstillinger (entur-settings.js).
import { app } from './state.js';
import { onRefresh, currentPage, runAction } from './shell.js';
import { t } from '../i18n/strings.js';
import { createListView } from './list-view.js';
import { generatedAlias, aliasIssues } from '../core/orgs.js';
import { writeOrgs } from '../project/orgs-store.js';
import { writeBrandings, newBranding } from '../project/brandings-store.js';
import { writeLabels, newLabel, LABEL_COLOURS } from '../project/labels-store.js';
import { writeVehicles, newVehicle, vehicleTypeIdFor } from '../project/vehicles-store.js';
import { FUEL_TYPES, VEHICLE_TYPE_REF_PREFIX, SHORT_CODE_MAX, vehicleProblems } from '../core/vehicles.js';
import { TRANSMODEL_MODES } from '../core/modes.js';
import { modeLabel } from '../i18n/modes.js';
import { getLang } from '../i18n/strings.js';
import { refreshRegister } from './org-register.js';

/**
 * @typedef {import('../project/brandings-store.js').Branding} Branding
 * @typedef {import('../core/orgs.js').Company} Company
 * @typedef {import('../project/labels-store.js').Label} Label
 * @typedef {'label' | 'vehicle'} TagKind
 * @typedef {{ id: string, kind: 'branding', name: string, branding: Branding, used: number, unsaved: boolean, isNew: boolean }
 *   | { id: string, kind: TagKind, name: string, tag: Label, used: number, unsaved: boolean, isNew: boolean }
 *   | { id: string, kind: 'org', role: 'authority' | 'operator', name: string, company: Company, entry: any, used: number, unsaved: boolean, changed: boolean, gone: boolean }} Resource
 */

const ROLES = /** @type {('authority' | 'operator')[]} */ (['authority', 'operator']);

/** @param {string} tag @param {string} cls @param {string} [text] */
const el = (tag, cls, text = '') => { const e = document.createElement(tag); e.className = cls; if (text) e.textContent = text; return e; };
/** @param {string} v */
const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A role's row: its NOG ID. @param {{ id: string }} entry */
const roleKey = (entry) => `o:${entry.id}`;
/** @param {Branding} b */
const brandKey = (b) => `b:${b.id}`;
/** @returns {Map<string, any>} */
const drafts = () => app.resourceDrafts;

// Labels (62) and vehicles (user 2026-10-20): the project's own lists, kept the same way ("tags": a name and a colour)
const TAGS = /** @type {Record<TagKind, { prefix: string, flag: number, list: () => Label[], set: (l: Label[]) => void, error: () => null | string,
  write: (fs: any, l: any[]) => Promise<void>, make: (n: number) => any, type: string, add: string, unreadable: string, deleteConfirm: string }>} */ ({
  label: { prefix: 'l:', flag: 256, list: () => app.labels ?? [], set: (l) => { app.labels = l; }, error: () => app.labelsError, write: writeLabels, make: newLabel,
    type: 'rsTypeLabel', add: 'labelAdd', unreadable: 'labelsUnreadable', deleteConfirm: 'labelDeleteConfirm' },
  vehicle: { prefix: 'v:', flag: 512, list: () => app.vehicles ?? [], set: (l) => { app.vehicles = l; }, error: () => app.vehiclesError, write: writeVehicles, make: (n) => newVehicle(n, app.meta?.codespace ?? ''),
    type: 'rsTypeVehicle', add: 'vehicleAdd', unreadable: 'vehiclesUnreadable', deleteConfirm: 'vehicleDeleteConfirm' },
});
const TAG_KINDS = /** @type {TagKind[]} */ (['label', 'vehicle']);
/** @param {TagKind} kind @param {Label} l */
const tagKey = (kind, l) => `${TAGS[kind].prefix}${l.id}`;
/** The tag kind of a row ID, if it is one. @param {string} id @returns {TagKind | null} */
const tagKindOf = (id) => TAG_KINDS.find((k) => id.startsWith(TAGS[k].prefix)) ?? null;
/** @param {Resource} r @returns {r is Resource & { kind: TagKind }} */
const isTag = (r) => r.kind === 'label' || r.kind === 'vehicle';

/** How many route files use each name of this kind (its row's #TTC cells: flags 256 for labels, 512 for vehicles). @param {TagKind} kind */
function tagUsage(kind) {
  /** @type {Map<string, number>} */
  const count = new Map();
  const flag = TAGS[kind].flag;
  for (const r of app.routes) {
    const names = new Set([...r.text.matchAll(/^[ \t]*#TTC;[^;\r\n]*;[^;\r\n]*;[^;\r\n]*;([^;\r\n]*);(\d+)\s*$/gm)].filter((m) => Number(m[2]) === flag).map((m) => m[1]));
    for (const n of names) count.set(n, (count.get(n) ?? 0) + 1);
  }
  return count;
}

// ─── Use ────────────────────────────────────────────────────────────────────
/** How many route files name each ID, in #SEK (organisations) or #MRK (brands; #BRA in older files). */
function usage() {
  /** @type {Map<string, number>} */
  const count = new Map();
  for (const r of app.routes) {
    const ids = new Set([...r.text.matchAll(/^[ \t]*#(?:SEK|MRK|BRA);([^;\r\n]*)/gm)].map((m) => m[1].trim()));
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
  // Column labels (62) and vehicles: the project's own, like merkevarer
  for (const kind of TAG_KINDS) {
    const tused = tagUsage(kind);
    const savedT = new Set(TAGS[kind].list().map((l) => tagKey(kind, l)));
    for (const l of TAGS[kind].list()) {
      const draft = drafts().get(tagKey(kind, l));
      const shown = draft ?? l;
      rows.push({ id: tagKey(kind, l), kind, name: shown.name, tag: shown, used: tused.get(l.name) ?? 0, unsaved: !!draft, isNew: false });
    }
    for (const [id, d] of drafts()) {
      if (tagKindOf(id) === kind && !savedT.has(id)) rows.push({ id, kind, name: d.name, tag: d, used: 0, unsaved: true, isNew: true });
    }
  }
  if (!app.orgsError) {
    for (const c of app.orgs) {
      const changed = app.orgChanges.changed.includes(c.organisationId || c.name);
      for (const role of ROLES) {
        const entry = c[role];
        if (!entry) continue;
        rows.push({ id: roleKey(entry), kind: 'org', role, name: c.name, company: c, entry, unsaved: drafts().has(roleKey(entry)),
          used: used.get(entry.id) ?? 0, changed, gone: app.orgChanges.missing.includes(entry.id) });
      }
    }
  }
  return rows;
}

/** @param {string} id */
const resource = (id) => allResources().find((r) => r.id === id) ?? null;

/** @param {Resource} r */
function detail(r) {
  if (r.kind === 'branding') return r.branding.url;
  if (r.kind === 'vehicle') return vehicleDetail(/** @type {any} */ (r.tag));
  if (isTag(r)) return r.tag.colour;
  return r.company.companyNumber ? `${t('orgCompanyNumber')} ${r.company.companyNumber}` : '';
}

/** The role's alias prefix in this project: "ABC:Authority:". @param {'authority' | 'operator'} role */
const aliasPrefix = (role) => `${app.meta?.codespace ?? ''}:${role === 'authority' ? 'Authority' : 'Operator'}:`;

/** @param {Resource} r */
function exportIds(r) {
  if (r.kind === 'branding') return r.branding.id;
  if (r.kind === 'vehicle') return /** @type {any} */ (r.tag).vehicleTypeRef || /** @type {any} */ (r.tag).vehicleTypeId || '';
  if (isTag(r)) return '';
  return r.entry.alias || generatedAlias(r.entry.id, app.meta?.codespace ?? '');
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
const typeKey = (r) => (r.kind === 'org' ? r.role : r.kind);
/** @param {Resource} r */
const typeText = (r) => t(r.kind === 'branding' ? 'rsTypeBranding' : isTag(r) ? TAGS[r.kind].type : r.role === 'authority' ? 'roleAuthority' : 'roleOperator');
/** The name, with the role when the company has both (the navigator). @param {Resource} r */
const navName = (r) => (r.kind === 'org' && r.company.authority && r.company.operator ? `${r.name} · ${typeText(r)}` : r.name || t('tableSetUnnamed'));

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

/** Is this name missing, or already used by another of the same kind (a vehicle may share a label's name)?
 *  @param {TagKind} kind @param {string} id @param {string} name */
function tagNameProblem(kind, id, name, list = TAGS[kind].list(), withDrafts = true) {
  const n = name.trim();
  if (!n || n.includes(';')) return true; // ; separates ERN fields
  const same = (/** @type {string} */ other) => other.trim().toLowerCase() === n.toLowerCase();
  return list.some((l) => tagKey(kind, l) !== id && same(l.name))
    || withDrafts && [...drafts()].some(([k, d]) => tagKindOf(k) === kind && k !== id && !list.some((l) => tagKey(kind, l) === k) && same(d.name));
}

/** Write labels or vehicles with the given drafts applied; unnamed or doubled ones are not saved. @param {TagKind} kind @param {string[]} ids */
async function saveTags(kind, ids) {
  const fs = app.fs;
  const tag = TAGS[kind];
  if (!fs || tag.error() || !ids.length) return;
  let list = [...tag.list()];
  for (const id of ids) {
    const d = drafts().get(id);
    if (!d || tagNameProblem(kind, id, d.name, list, false) || kind === 'vehicle' && Object.keys(vehicleProblems(d)).length) continue;
    drafts().delete(id); // checked against what is saved so far: a second new one with the same name is refused
    const at = list.findIndex((l) => tagKey(kind, l) === id);
    const saved = { ...d, name: d.name.trim() };
    if (kind === 'vehicle' && !saved.vehicleTypeId) saved.vehicleTypeId = vehicleTypeIdFor(app.meta?.codespace ?? '');
    if (at >= 0) list[at] = saved; else list = [...list, saved];
  }
  await runAction(() => tag.write(fs, list));
  tag.set(list);
}

/** Delete labels or vehicles (lines that use them keep the name, shown grey). @param {TagKind} kind @param {string[]} ids */
async function deleteTags(kind, ids) {
  const tag = TAGS[kind];
  const picked = /** @type {Resource[]} */ (ids.map(resource).filter((r) => r && r.kind === kind));
  if (!picked.length || tag.error()) return;
  const users = picked.reduce((n, r) => n + r.used, 0);
  if (users && !confirm(t(tag.deleteConfirm, picked.length, users))) return;
  const gone = new Set(picked.map((r) => r.id));
  for (const id of gone) drafts().delete(id);
  const keep = tag.list().filter((l) => !gone.has(tagKey(kind, l)));
  const fs = app.fs;
  if (fs) await runAction(() => tag.write(fs, keep));
  tag.set(keep);
  if (app.resourceSelected && gone.has(app.resourceSelected)) app.resourceSelected = null;
  renderResourcesPage();
}

/** @param {TagKind} kind */
function newTagDraft(kind) {
  const l = TAGS[kind].make(TAGS[kind].list().length);
  drafts().set(tagKey(kind, l), l);
  open(tagKey(kind, l));
  /** @type {HTMLInputElement | null} */ (document.querySelector('#re-name'))?.focus();
}

/** Write the organisations with this role's alias draft applied (not when the alias is wrong). @param {string} id */
async function saveOrg(id) {
  const fs = app.fs;
  const d = drafts().get(id);
  if (!fs || d == null || app.orgsError) return;
  const nog = id.slice(2);
  const hit = app.orgs.flatMap((c) => ROLES.map((role) => ({ role, entry: c[role] }))).find((x) => x.entry?.id === nog);
  if (!hit?.entry || aliasProblem(nog, d.suffix, hit.role)) return;
  hit.entry.alias = d.suffix.trim() ? aliasPrefix(hit.role) + d.suffix.trim() : '';
  await runAction(() => writeOrgs(fs, app.orgs));
  drafts().delete(id);
}

/** How many resources have unsaved edits. */
export const unsavedResourceCount = () => app.resourceDrafts.size;

/** Save every unsaved resource (Lagre alle endringer, Ctrl+Shift+S). */
export async function saveAllResources() {
  const ids = [...drafts().keys()];
  await saveBrandings(ids.filter((id) => id.startsWith('b:')));
  for (const kind of TAG_KINDS) await saveTags(kind, ids.filter((id) => tagKindOf(id) === kind));
  for (const id of ids.filter((id) => id.startsWith('o:'))) await saveOrg(id);
  renderResourcesPage();
}

/** @param {string} id */
async function save(id) {
  const kind = tagKindOf(id);
  if (id.startsWith('b:')) await saveBrandings([id]); else if (kind) await saveTags(kind, [id]); else await saveOrg(id);
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

/** Only one kind is deleted at a time: merkevarer, labels or vehicles (organisations come from the register). @param {string[]} ids */
const deletable = (ids) => ids.every((id) => id.startsWith('b:')) || TAG_KINDS.some((k) => ids.every((id) => tagKindOf(id) === k));
/** @param {string[]} ids */
function deleteSome(ids) {
  const kind = tagKindOf(ids[0] ?? '');
  void (kind ? deleteTags(kind, ids) : deleteBrandings(ids));
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
          <option value="authority">${esc(t('roleAuthority'))}</option><option value="operator">${esc(t('roleOperator'))}</option><option value="label">${esc(t('rsTypeLabel'))}</option><option value="vehicle">${esc(t('rsTypeVehicle'))}</option></select>`;
      for (const id of ['rs-search', 'rs-f-type']) {
        const f = /** @type {HTMLInputElement} */ (box.querySelector('#' + id));
        if (state[id] != null) f.value = state[id];
        f.addEventListener(id === 'rs-search' ? 'input' : 'change', () => { state[id] = f.value; changed(); });
      }
    },
    matches: (r, st) => {
      if (st['rs-f-type'] && typeKey(r) !== st['rs-f-type']) return false;
      const q = String(st['rs-search'] ?? '').trim().toLowerCase();
      return !q || [r.name, detail(r), exportIds(r)].some((s) => s.toLowerCase().includes(q));
    },
    tools: [
      { id: 'rs-new', label: () => t('brandAdd'), enabled: () => !app.brandingsError, run: newBrandingDraft },
      { id: 'rs-new-label', label: () => t('labelAdd'), enabled: () => !app.labelsError, run: () => newTagDraft('label') },
      { id: 'rs-new-vehicle', label: () => t('vehicleAdd'), enabled: () => !app.vehiclesError, run: () => newTagDraft('vehicle') },
      { id: 'rs-edit', label: () => t('lvEdit'), enabled: (sel) => sel.length === 1, run: (sel) => open(sel[0]) },
      { id: 'rs-del', label: () => t('ltDelete'), danger: true, enabled: (sel) => sel.length > 0 && deletable(sel), run: (sel) => deleteSome(sel) },
      { id: 'rs-refresh', label: () => t('rsRefresh'), enabled: () => app.orgRegisterStatus !== 'loading', run: () => { void refreshRegister(); } },
    ],
    onEdit: (id) => open(id),
    onDelete: (ids) => { if (ids.length && deletable(ids)) deleteSome(ids); },
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
    const item = el('div', `re-item re-${other.kind}${other.id === r.id ? ' active' : ''}`, `${navName(other)}${other.unsaved ? ' ●' : ''}`);
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
    if (r.kind !== 'org' && r.isNew) open(null); else renderResourcesPage();
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

/** The list's detail for a vehicle: short code, mode, fuel. @param {any} v */
function vehicleDetail(v) {
  return [v.shortCode, v.transportMode ? modeLabel(v.transportMode, getLang()) : '', v.fuelType ? t(`fuel_${v.fuelType}`) : ''].filter(Boolean).join(' · ');
}

/** A typed number: empty is none, a comma is a decimal point; anything else stays as typed so the check can refuse it. @param {string} text */
const typedNumber = (text) => { const x = text.trim().replace(',', '.'); return x === '' ? null : Number(x); };

/**
 * A vehicle's own fields (user 2026-10-20): short code, mode, fuel, low floor, seats and size.
 * @param {HTMLElement} main @param {string} id @param {() => any} cur @param {() => boolean} valid
 */
function vehicleFields(main, id, cur, valid) {
  /** @param {string} key @param {any} value */
  const set = (key, value) => { drafts().set(id, { ...cur(), [key]: value }); };
  /** Mark every field the check refuses. */
  const mark = () => { const p = vehicleProblems(cur()); for (const k of ['shortCode', 'seats', 'length', 'width', 'height']) main.querySelector(`#re-${k}`)?.classList.toggle('invalid', !!p[k]); };
  /** @param {string} key @param {string} label @param {(text: string) => any} parse @param {string} [note] */
  const text = (key, label, parse, note = '') => {
    const input = /** @type {HTMLInputElement} */ (el('input', 're-in'));
    input.id = `re-${key}`;
    const v = cur()[key];
    input.value = v == null ? '' : String(v);
    input.autocomplete = 'off';
    input.addEventListener('keydown', (e) => e.stopPropagation());
    input.addEventListener('input', () => { set(key, parse(input.value)); mark(); touched(main, valid()); });
    if (note) { const box = el('span', 're-field'); box.append(input, el('span', 're-hint', note)); row(main, label, box); } else row(main, label, input);
  };
  /** @param {string} key @param {string} label @param {[string, string][]} options value → text */
  const choose = (key, label, options) => {
    const sel = /** @type {HTMLSelectElement} */ (el('select', 're-in'));
    sel.id = `re-${key}`;
    for (const [value, shown] of options) { const o = document.createElement('option'); o.value = value; o.textContent = shown; sel.appendChild(o); }
    sel.value = cur()[key] ?? '';
    sel.addEventListener('change', () => { set(key, sel.value); touched(main, valid()); });
    row(main, label, sel);
  };
  text('shortCode', t('vehShortCode'), (x) => x.trim(), t('vehShortCodeNote'));
  const shortCode = /** @type {HTMLInputElement} */ (main.querySelector('#re-shortCode'));
  shortCode.maxLength = SHORT_CODE_MAX + 4; // room to see that it is too long
  choose('transportMode', t('vehMode'), [['', t('vehModeNone')], ...TRANSMODEL_MODES.map((m) => /** @type {[string, string]} */ ([m.mode, modeLabel(m.mode, getLang())]))]);
  choose('fuelType', t('vehFuel'), [['', '—'], ...FUEL_TYPES.map((x) => /** @type {[string, string]} */ ([x, t(`fuel_${x}`)]))]);
  const low = /** @type {HTMLInputElement} */ (el('input', 're-check'));
  low.type = 'checkbox';
  low.id = 're-lowFloor';
  low.checked = !!cur().lowFloor;
  low.addEventListener('change', () => { set('lowFloor', low.checked); touched(main, valid()); });
  row(main, t('vehLowFloor'), low);
  text('seats', t('vehSeats'), typedNumber);
  text('length', t('vehLength'), typedNumber);
  text('width', t('vehWidth'), typedNumber);
  text('height', t('vehHeight'), typedNumber);
  mark();
}

/** The VehicleTypeRef: the fixed NMR:VehicleType: prefix, then what is typed. @param {HTMLElement} main @param {string} id @param {() => any} cur @param {() => boolean} valid */
function vehicleRefField(main, id, cur, valid) {
  const input = /** @type {HTMLInputElement} */ (el('input', 're-alias'));
  input.id = 're-vehicleTypeRef';
  const ref = String(cur().vehicleTypeRef ?? '');
  input.value = ref.startsWith(VEHICLE_TYPE_REF_PREFIX) ? ref.slice(VEHICLE_TYPE_REF_PREFIX.length) : ref;
  input.autocomplete = 'off';
  input.spellcheck = false;
  const check = () => input.classList.toggle('invalid', !!vehicleProblems(cur()).vehicleTypeRef);
  input.addEventListener('keydown', (e) => e.stopPropagation());
  input.addEventListener('input', () => {
    const typed = input.value.trim();
    drafts().set(id, { ...cur(), vehicleTypeRef: typed ? VEHICLE_TYPE_REF_PREFIX + typed : '' });
    check();
    touched(main, valid());
  });
  check();
  const field = el('span', 're-alias-field');
  field.append(el('span', 're-alias-prefix', VEHICLE_TYPE_REF_PREFIX), input);
  row(main, t('vehTypeRef'), field);
}

/** A label's or a vehicle's editor: name and colour (a vehicle also has its own data). @param {HTMLElement} main @param {Resource & { kind: TagKind }} r */
function tagForm(main, r) {
  const kind = r.kind, tag = TAGS[kind];
  main.appendChild(el('div', 're-title', `${t(tag.type)} · ${r.name || t('tableSetUnnamed')}`));
  if (tag.error()) main.appendChild(el('p', 'assets-status bad', t(tag.unreadable)));
  const cur = () => drafts().get(r.id) ?? r.tag;
  const valid = () => !tagNameProblem(kind, r.id, cur().name) && !tag.error() && (kind !== 'vehicle' || !Object.keys(vehicleProblems(cur())).length);
  const name = /** @type {HTMLInputElement} */ (el('input', 're-in'));
  name.id = 're-name';
  name.value = r.tag.name;
  name.autocomplete = 'off';
  name.classList.toggle('invalid', tagNameProblem(kind, r.id, r.tag.name));
  name.addEventListener('keydown', (e) => e.stopPropagation());
  name.addEventListener('input', () => {
    drafts().set(r.id, { ...cur(), name: name.value });
    name.classList.toggle('invalid', tagNameProblem(kind, r.id, name.value));
    touched(main, valid());
  });
  row(main, t('labelName'), name);
  if (kind === 'vehicle') vehicleFields(main, r.id, cur, valid);
  // The colour: a picker and a few ready ones
  const colour = /** @type {HTMLInputElement} */ (el('input', 're-colour'));
  colour.type = 'color';
  colour.id = 're-colour';
  colour.value = r.tag.colour;
  const setColour = (/** @type {string} */ c) => { colour.value = c; drafts().set(r.id, { ...cur(), colour: c }); touched(main, valid()); };
  colour.addEventListener('input', () => setColour(colour.value));
  const field = el('span', 're-colours');
  field.appendChild(colour);
  for (const c of LABEL_COLOURS) {
    const sw = el('button', 're-swatch');
    sw.style.background = c;
    sw.title = c;
    sw.addEventListener('click', (e) => { e.preventDefault(); setColour(c); });
    field.appendChild(sw);
  }
  row(main, t(kind === 'vehicle' ? 'vehColour' : 'labelColour'), field);
  if (kind === 'vehicle') {
    main.appendChild(el('div', 're-note', t('vehColourNote')));
    const v = /** @type {any} */ (cur());
    row(main, t('vehTypeId'), el('span', 're-static', v.vehicleTypeId || t('vehTypeIdOnSave')));
    vehicleRefField(main, r.id, cur, valid);
  }
  main.appendChild(el('div', 're-note', `${t('orgUsedBy', r.used)} · ${t('labelRenameNote')}`));
  main.appendChild(footer(r, valid()));
  if (!r.isNew) {
    const del = el('button', 're-del danger', t('ltDelete'));
    del.addEventListener('click', () => { void deleteTags(kind, [r.id]); });
    /** @type {HTMLElement} */ (main.querySelector('.ce-foot')).prepend(del);
  }
}

/**
 * Is this alias wrong? Only the part after the prefix is typed: it may hold A–Z, a–z, 0–9, - and _,
 * and no other organisation may end up with the same ID.
 * @param {string} nog @param {string} suffix @param {'authority' | 'operator'} role
 */
function aliasProblem(nog, suffix, role) {
  const typed = suffix.trim();
  if (typed && !/^[A-Za-z0-9_-]+$/.test(typed)) return t('orgAliasChars');
  const alias = typed ? aliasPrefix(role) + typed : '';
  const trial = app.orgs.map((c) => ({ ...c,
    authority: c.authority && (c.authority.id === nog ? { ...c.authority, alias } : c.authority),
    operator: c.operator && (c.operator.id === nog ? { ...c.operator, alias } : c.operator) }));
  return aliasIssues(trial, app.meta?.codespace ?? '').some((i) => i.nogId === nog && i.code === 'org-alias-duplicate') ? t('orgAliasDuplicate') : '';
}

/** The part of a saved alias after the role's prefix (an alias from another codespace keeps its own last part). @param {string} alias */
const suffixOf = (alias) => (alias ? alias.split(':').slice(2).join(':') || alias : '');

/** @param {HTMLElement} main @param {Resource & { kind: 'org' }} r */
function orgForm(main, r) {
  const c = r.company, entry = r.entry, role = r.role;
  main.appendChild(el('div', 're-title', `${typeText(r)} · ${c.name}`));
  // Everything from the register, read-only, in one place: the company, then this role's contact
  const facts = el('div', 're-facts');
  const ct = entry.contact ?? {};
  for (const [label, value] of [[t('orgCompanyNumber'), c.companyNumber], [t('rsLegalName'), c.legalName], [t('rsTradingName'), c.tradingName],
    [t('brandUrl'), ct.url], [t('rsEmail'), ct.email], [t('rsPhone'), ct.phone], [t('rsNogId'), entry.id]]) {
    if (value) facts.appendChild(el('div', '', `${label}: ${value}`));
  }
  if (r.changed) facts.appendChild(el('div', 'org-mark', t('orgChanged')));
  if (r.gone) facts.appendChild(el('div', 'org-mark bad', t('orgGone')));
  main.appendChild(facts);

  const cs = app.meta?.codespace ?? '';
  const draft = drafts().get(r.id);
  const input = /** @type {HTMLInputElement} */ (el('input', 're-alias'));
  input.dataset.nog = entry.id;
  input.value = draft ? draft.suffix : suffixOf(entry.alias ?? '');
  input.placeholder = suffixOf(generatedAlias(entry.id, cs));
  input.autocomplete = 'off';
  input.spellcheck = false;
  const msg = el('span', 'org-alias-msg');
  const check = () => { const p = aliasProblem(entry.id, input.value, role); input.classList.toggle('invalid', !!p); msg.textContent = p; return !p; };
  check();
  input.addEventListener('keydown', (e) => e.stopPropagation());
  input.addEventListener('input', () => {
    drafts().set(r.id, { suffix: input.value });
    touched(main, check() && !app.orgsError);
  });
  const field = el('span', 're-alias-field');
  field.append(el('span', 're-alias-prefix', aliasPrefix(role)), input);
  const line = el('label', 're-row');
  line.append(el('span', 're-label', t('orgAliasLabel')), field, msg);
  main.appendChild(line);
  main.appendChild(el('div', 're-note', t('orgUsedBy', r.used)));
  main.appendChild(footer(r, check() && !app.orgsError));
}

/** @param {HTMLElement} body @param {Resource} r */
function renderEditor(body, r) {
  const wrap = el('div', 're-editor');
  const main = el('div', 're-main');
  if (r.kind === 'branding') brandingForm(main, r); else if (isTag(r)) tagForm(main, r); else orgForm(main, r);
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

let keysWired = false;
export function initResourcesPage() {
  onRefresh(renderResourcesPage);
  if (keysWired) return;
  keysWired = true;
  // Ctrl+S (user 2026-10-21): in an editor it saves that resource, on the list every unsaved one (as Kalendere)
  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.key.toLowerCase() !== 's' || currentPage() !== 'assets' || document.querySelector('dialog[open]')) return;
    e.preventDefault();
    const id = app.resourceSelected;
    void (id ? save(id) : saveAllResources());
  }, true);
}
