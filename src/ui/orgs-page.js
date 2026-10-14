// Ressurser → Organisasjoner (organisations spec §5): Entur's register status and refresh, the
// note on missing organisations, and the companies the project uses with their export IDs.
// Rows are built once per showing; alias edits update their own field in place.
import { app } from './state.js';
import { $, onRefresh, currentPage, runAction } from './shell.js';
import { t } from '../i18n/strings.js';
import { generatedAlias, aliasIssues, orgRole } from '../core/orgs.js';
import { writeOrgs } from '../project/orgs-store.js';
import { refreshRegister } from './org-register.js';

/** @type {Set<string>} organisationIds (or names) whose details are open */
const open = new Set();

/** @param {string} iso */
const when = (iso) => {
  const d = new Date(iso);
  const p = (/** @type {number} */ n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** @param {string} tag @param {string} cls @param {string} [text] */
const el = (tag, cls, text = '') => { const e = document.createElement(tag); e.className = cls; if (text) e.textContent = text; return e; };

function statusLine() {
  const line = el('div', 'org-status');
  const reg = app.orgRegister;
  const s = app.orgRegisterStatus;
  line.textContent = s === 'loading' ? t('orgRegisterLoading')
    : s === 'failed' ? (reg ? t('orgRegisterFailed', when(reg.fetchedAt)) : t('orgRegisterNone'))
    : reg ? t('orgRegisterStatus', reg.companies.length, when(reg.fetchedAt)) : t('orgRegisterNone');
  line.classList.toggle('bad', s === 'failed');
  const btn = /** @type {HTMLButtonElement} */ (el('button', 'org-refresh', t('orgRefresh')));
  btn.id = 'org-refresh';
  btn.disabled = s === 'loading';
  btn.addEventListener('click', () => { void refreshRegister(); });
  line.appendChild(btn);
  return line;
}

function missingNote() {
  const p = el('p', 'org-missing-note');
  const [before, after] = t('orgMissingNote').split('{mail}');
  const a = document.createElement('a');
  a.href = 'mailto:kollektivdata@entur.org';
  a.textContent = 'kollektivdata@entur.org';
  p.append(before, a, after ?? '');
  return p;
}

/** How many route files name each organisation ID in a #SEK record. */
function usage() {
  /** @type {Map<string, number>} */
  const count = new Map();
  for (const r of app.routes) {
    const ids = new Set([...r.text.matchAll(/^[ \t]*#SEK;([^;\r\n]*)/gm)].map((m) => m[1].trim()));
    for (const id of ids) count.set(id, (count.get(id) ?? 0) + 1);
  }
  return count;
}

/** @param {HTMLInputElement} input @param {'authority' | 'operator'} role */
function aliasProblem(input, role) {
  const typed = input.value.trim();
  if (typed && orgRole(typed) !== role) return t('orgAliasFormat');
  const nog = input.dataset.nog ?? '';
  const trial = app.orgs.map((c) => ({ ...c,
    authority: c.authority && (c.authority.id === nog ? { ...c.authority, alias: typed } : c.authority),
    operator: c.operator && (c.operator.id === nog ? { ...c.operator, alias: typed } : c.operator) }));
  return aliasIssues(trial, app.meta?.codespace ?? '').some((i) => i.nogId === nog && i.code === 'org-alias-duplicate') ? t('orgAliasDuplicate') : '';
}

export function renderOrgsPage() {
  if (currentPage() !== 'assets' || app.assetsSection !== 'orgs') return;
  const body = $('assets-body');
  body.innerHTML = '';
  body.appendChild(el('div', 'assets-title', t('orgTitle')));
  if (!app.meta) { body.appendChild(el('p', 'assets-coming', t('noProjectOpen'))); return; }
  body.appendChild(statusLine());
  body.appendChild(missingNote());
  if (app.orgsError) { body.appendChild(el('p', 'assets-status bad', t('orgsUnreadable'))); return; }

  body.appendChild(el('div', 'assets-subtitle', t('orgInProjectTitle')));
  if (!app.orgs.length) { body.appendChild(el('p', 'assets-hint', t('orgNoneInProject'))); return; }
  const used = usage();
  const cs = app.meta.codespace;
  for (const company of [...app.orgs].sort((a, b) => a.name.localeCompare(b.name, 'nb'))) {
    const key = company.organisationId || company.name;
    const row = el('div', 'org-row');
    const head = el('div', 'org-row-head');
    head.appendChild(el('b', '', company.name));
    head.appendChild(el('span', 'org-num', company.companyNumber ? `${t('orgCompanyNumber')} ${company.companyNumber}` : ''));
    const lines = Math.max(company.authority ? used.get(company.authority.id) ?? 0 : 0, company.operator ? used.get(company.operator.id) ?? 0 : 0);
    head.appendChild(el('span', 'org-used', t('orgUsedBy', lines)));
    if (app.orgChanges.changed.includes(key)) head.appendChild(el('span', 'org-mark', t('orgChanged')));
    head.addEventListener('click', () => { if (open.has(key)) open.delete(key); else open.add(key); renderOrgsPage(); });
    row.appendChild(head);

    for (const role of /** @type {('authority' | 'operator')[]} */ (['authority', 'operator'])) {
      const entry = company[role];
      if (!entry) continue;
      const line = el('div', 'org-role-line');
      line.appendChild(el('span', 'org-role', t(role === 'authority' ? 'roleAuthority' : 'roleOperator')));
      line.appendChild(el('label', 'org-alias-label', t('orgAliasLabel')));
      const input = /** @type {HTMLInputElement} */ (el('input', 'org-alias-in'));
      input.dataset.nog = entry.id;
      input.value = entry.alias ?? '';
      input.placeholder = generatedAlias(entry.id, cs);
      const msg = el('span', 'org-alias-msg');
      const check = () => { const p = aliasProblem(input, role); input.classList.toggle('invalid', !!p); msg.textContent = p; return p; };
      input.addEventListener('input', check);
      input.addEventListener('keydown', (e) => e.stopPropagation());
      input.addEventListener('change', () => {
        if (check() || !app.fs) return;
        entry.alias = input.value.trim();
        const fs = app.fs;
        void runAction(() => writeOrgs(fs, app.orgs));
      });
      line.append(input, msg);
      if (app.orgChanges.missing.includes(entry.id)) line.appendChild(el('span', 'org-mark bad', t('orgGone')));
      row.appendChild(line);
    }

    if (open.has(key)) {
      const d = el('div', 'org-details');
      for (const role of /** @type {('authority' | 'operator')[]} */ (['authority', 'operator'])) {
        const entry = company[role];
        if (!entry) continue;
        const c = entry.contact;
        d.appendChild(el('div', '', [entry.id, company.legalName, company.tradingName, c.email, c.phone, c.url].filter(Boolean).join(' · ')));
      }
      row.appendChild(d);
    }
    body.appendChild(row);
  }
}

export function initOrgsPage() {
  onRefresh(renderOrgsPage);
}
