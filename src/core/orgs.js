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
