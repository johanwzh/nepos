// Organisations are identified by full NeTEx IDs such as RUT:Authority:1 or INN:Operator:62.
// The middle part of the ID says whether the organisation is an authority or an operator, so
// an organisation that is both has two entries (as in Entur's own data).

// The part after the role is limited to letters, digits, _ and -, which are safe in NeTEx IDs.
export const ORG_ID_PATTERN = /^[A-Z]{3}:(Authority|Operator):[A-Za-z0-9_-]+$/;

/**
 * @param {string} id
 * @returns {'authority' | 'operator' | null}
 */
export function orgRole(id) {
  const m = ORG_ID_PATTERN.exec(String(id ?? ''));
  if (!m) return null;
  return m[1] === 'Authority' ? 'authority' : 'operator';
}

/**
 * The NeTEx ID to write for an organisation. A full ID is written exactly as entered; a bare ID
 * (only found in test data carried over from 1.5.7) gets the project codespace and the role.
 * @param {string | number} id
 * @param {'Authority' | 'Operator'} role
 * @param {string} cs
 */
export function netexOrgId(id, role, cs) {
  const s = String(id);
  return ORG_ID_PATTERN.test(s) ? s : `${cs}:${role}:${s}`;
}

/**
 * Local part of the Network that groups an authority's lines. Colons are not allowed there.
 * @param {string | number} authorityId
 */
export function authorityNetworkLocalId(authorityId) {
  return `authority-${String(authorityId).replace(/:/g, '-')}`;
}

/**
 * Check the organisation list as the user typed it. IDs are checked exactly as stored —
 * surrounding spaces or wrong case are reported, never silently fixed.
 * @param {{ id: any, name: string }[]} orgs
 * @returns {{ index: number, code: 'id-required' | 'id-format' | 'id-duplicate' }[]}
 */
export function validateOrgs(orgs) {
  /** @type {{ index: number, code: 'id-required' | 'id-format' | 'id-duplicate' }[]} */
  const issues = [];
  const seen = new Set();
  orgs.forEach((org, index) => {
    const id = String(org.id ?? '');
    if (!id.trim()) { issues.push({ index, code: 'id-required' }); return; }
    if (!ORG_ID_PATTERN.test(id)) issues.push({ index, code: 'id-format' });
    if (seen.has(id)) issues.push({ index, code: 'id-duplicate' });
    seen.add(id);
  });
  return issues;
}


/** @typedef {{ email: string, phone: string, url: string }} OrgContact */
/** @typedef {{ id: string, version: string, contact: OrgContact, alias?: string }} OrgRoleEntry */
/** @typedef {{ organisationId: string, companyNumber: string, name: string, legalName: string,
 *             tradingName: string, authority: OrgRoleEntry | null, operator: OrgRoleEntry | null }} Company */
/** @typedef {'authority' | 'operator'} OrgRoleKey */
/** @typedef {{ role: OrgRoleKey, id: string, version: string, organisationId: string,
 *             companyNumber: string, name: string, legalName: string, tradingName: string,
 *             contact: OrgContact }} RegisterElement */

/** @type {OrgRoleKey[]} */
const ROLES = ['authority', 'operator'];
/** @param {Company[]} list */
const byName = (list) => list.sort((a, b) => a.name.localeCompare(b.name, 'nb'));

/**
 * Group registry elements into companies by organisationId (spec §2).
 * @param {RegisterElement[]} elements
 * @returns {Company[]}
 */
export function groupCompanies(elements) {
  /** @type {Map<string, Company>} */
  const companies = new Map();
  for (const e of elements) {
    const key = e.organisationId ? `org:${e.organisationId}` : `id:${e.id}`;
    let company = companies.get(key);
    if (!company) {
      company = { organisationId: e.organisationId, companyNumber: e.companyNumber, name: e.name,
        legalName: e.legalName, tradingName: e.tradingName, authority: null, operator: null };
      companies.set(key, company);
    }
    company[e.role] = { id: e.id, version: e.version, contact: { ...e.contact } };
  }
  return byName([...companies.values()]);
}

/**
 * @param {Company[]} companies
 * @param {string} id a role ID (NOG:Operator:…)
 * @returns {{ company: Company, role: OrgRoleKey, entry: OrgRoleEntry } | null}
 */
export function findRole(companies, id) {
  for (const company of companies) {
    for (const role of ROLES) {
      const entry = company[role];
      if (entry && entry.id === id) return { company, role, entry };
    }
  }
  return null;
}

/** @param {string} nogId @param {string} codespace */
export function generatedAlias(nogId, codespace) {
  const parts = String(nogId).split(':');
  return `${codespace}:${parts[1]}:${parts.slice(2).join(':')}`;
}

/**
 * The ID an organisation role gets in the export (spec §6).
 * @param {OrgRoleEntry} entry
 * @param {OrgRoleKey} role
 * @param {'codespace' | 'nog'} mode
 * @param {string} codespace
 */
export function exportOrgId(entry, role, mode, codespace) {
  if (mode === 'nog') return entry.id;
  return entry.alias?.trim() ? entry.alias.trim() : generatedAlias(entry.id, codespace);
}

/**
 * Typed aliases with the wrong form or role, and aliases (typed or generated) used twice.
 * @param {Company[]} companies
 * @param {string} codespace
 */
export function aliasIssues(companies, codespace) {
  /** @type {{ nogId: string, code: 'org-alias-format' | 'org-alias-duplicate', alias: string }[]} */
  const issues = [];
  /** @type {Map<string, string[]>} alias → NOG IDs */
  const seen = new Map();
  for (const company of companies) {
    for (const role of ROLES) {
      const entry = company[role];
      if (!entry) continue;
      const typed = entry.alias?.trim() ?? '';
      if (typed && orgRole(typed) !== role) issues.push({ nogId: entry.id, code: 'org-alias-format', alias: typed });
      const alias = exportOrgId(entry, role, 'codespace', codespace);
      seen.set(alias, [...(seen.get(alias) ?? []), entry.id]);
    }
  }
  for (const [alias, ids] of seen) {
    if (ids.length > 1) for (const nogId of ids) issues.push({ nogId, code: 'org-alias-duplicate', alias });
  }
  return issues;
}

/**
 * Companies that have the role and match the query (spec §4), sorted by name.
 * @param {Company[]} companies
 * @param {OrgRoleKey} role
 * @param {string} query
 */
export function searchCompanies(companies, role, query) {
  const q = query.trim().toLocaleLowerCase('nb');
  return byName(companies.filter((c) => c[role] && (!q || [c.name, c.legalName, c.tradingName, c.companyNumber, c.organisationId]
    .some((v) => String(v ?? '').toLocaleLowerCase('nb').includes(q)))));
}

/** @param {Company} c @param {Company[]} list */
const sameCompany = (c, list) => list.find((x) => (c.organisationId ? x.organisationId === c.organisationId
  : ROLES.some((r) => c[r] && x[r]?.id === c[r]?.id)));

/**
 * The project copy with a picked company's role added (alias empty). Unchanged if already there.
 * @param {Company[]} copy
 * @param {Company} company
 * @param {OrgRoleKey} role
 * @returns {Company[]}
 */
export function addToCopy(copy, company, role) {
  const source = company[role];
  if (!source) return copy;
  const existing = sameCompany(company, copy);
  if (existing?.[role]?.id === source.id) return copy;
  const entry = { id: source.id, version: source.version, contact: { ...source.contact }, alias: '' };
  if (existing) return copy.map((c) => (c === existing ? { ...c, [role]: entry } : c));
  const fresh = { ...company, authority: null, operator: null, [role]: entry };
  return byName([...copy, fresh]);
}

/** @param {Company} c */
const dataOf = (c) => JSON.stringify([c.companyNumber, c.name, c.legalName, c.tradingName,
  ...ROLES.map((r) => (c[r] ? [c[r]?.id, c[r]?.version, c[r]?.contact] : null))]);

/**
 * Refresh the project copy from the register (spec §3.2). Aliases are never touched; companies
 * and roles that are gone from the register stay, and their IDs are reported as missing.
 * @param {Company[]} copy
 * @param {Company[]} register
 */
export function refreshCopy(copy, register) {
  /** @type {string[]} */ const changed = [];
  /** @type {string[]} */ const missing = [];
  const companies = copy.map((c) => {
    // Role entries are matched by their own NOG ID (that is what the lines store); company details
    // come from the company where one of them was found.
    const fresh = ROLES.map((r) => (c[r] ? findRole(register, /** @type {OrgRoleEntry} */ (c[r]).id) : null)).find(Boolean)?.company;
    /** @type {Company} */
    const next = fresh
      ? { ...c, companyNumber: fresh.companyNumber, name: fresh.name, legalName: fresh.legalName, tradingName: fresh.tradingName }
      : { ...c };
    for (const role of ROLES) {
      const entry = c[role];
      if (!entry) continue;
      const found = findRole(register, entry.id);
      const source = found && found.role === role ? found.entry : null;
      if (!source) { missing.push(entry.id); continue; }
      next[role] = { id: source.id, version: source.version, contact: { ...source.contact }, alias: entry.alias ?? '' };
    }
    if (dataOf(next) !== dataOf(c)) changed.push(c.organisationId || c.name);
    return next;
  });
  return { companies, changed, missing };
}

/**
 * Remove roles no line uses (spec §3.2), unless they carry an alias; drop empty companies.
 * @param {Company[]} copy
 * @param {Set<string>} usedIds
 */
export function pruneCopy(copy, usedIds) {
  return copy
    .map((c) => {
      const next = { ...c };
      for (const role of ROLES) {
        const entry = c[role];
        if (entry && !usedIds.has(entry.id) && !entry.alias?.trim()) next[role] = null;
      }
      return next;
    })
    .filter((c) => c.authority || c.operator);
}

/** @param {Company[]} companies @returns {{ id: string, name: string }[]} */
export function orgNameList(companies) {
  return companies.flatMap((c) => ROLES.filter((r) => c[r]).map((r) => ({ id: /** @type {OrgRoleEntry} */ (c[r]).id, name: c.name })));
}
