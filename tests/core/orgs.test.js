import { describe, it, expect } from 'vitest';
import { orgRole, netexOrgId, authorityNetworkLocalId } from '../../src/core/orgs.js';
import { groupCompanies, findRole, generatedAlias, exportOrgId, aliasIssues, searchCompanies,
  addToCopy, refreshCopy, pruneCopy, orgNameList } from '../../src/core/orgs.js';
import { registerCompanies, projectCopy } from '../fixtures/orgs.js';

describe('organisation IDs', () => {
  it('reads the role from a full NeTEx ID', () => {
    expect(orgRole('RUT:Authority:1')).toBe('authority');
    expect(orgRole('INN:Operator:62')).toBe('operator');
    expect(orgRole('1')).toBe(null);
    expect(orgRole('RUT:Line:1')).toBe(null);
  });

  it('writes a full ID exactly as entered', () => {
    expect(netexOrgId('RUT:Authority:1', 'Authority', 'TST')).toBe('RUT:Authority:1');
  });

  it('prefixes a bare ID with the codespace and role', () => {
    expect(netexOrgId(1, 'Operator', 'TST')).toBe('TST:Operator:1');
  });

  it('builds a Network ID without colons in the local part', () => {
    expect(authorityNetworkLocalId('RUT:Authority:1')).toBe('authority-RUT-Authority-1');
    expect(authorityNetworkLocalId(2)).toBe('authority-2');
  });
});

describe('organisation ID characters', () => {
  it('only allows letters, digits, _ and - after the role', () => {
    for (const id of ['RUT:Operator:A&B', 'RUT:Operator:a<b', 'RUT:Operator:62.1', 'RUT:Operator:Øst']) expect(orgRole(id), id).toBe(null);
    expect(orgRole('RUT:Operator:Ab_9-x')).toBe('operator');
  });
});



const el = (role, id, organisationId, name, extra = {}) => ({ role, id, version: '1', organisationId, companyNumber: '9' + organisationId,
  name, legalName: name.toUpperCase(), tradingName: '', contact: { email: '', phone: '', url: '' }, ...extra });

describe('companies from the registry', () => {
  it('groups an authority and an operator with the same organisationId into one company', () => {
    const companies = groupCompanies([el('authority', 'NOG:Authority:a1', '134', 'Fjord AS'), el('operator', 'NOG:Operator:o1', '134', 'Fjord AS'),
      el('authority', 'NOG:Authority:b1', '22', 'Akershus')]);
    expect(companies.map((c) => c.name)).toEqual(['Akershus', 'Fjord AS']);
    expect(companies[1].authority?.id).toBe('NOG:Authority:a1');
    expect(companies[1].operator?.id).toBe('NOG:Operator:o1');
    expect(companies[0].operator).toBe(null);
  });

  it('keeps an element without organisationId as its own company', () => {
    const companies = groupCompanies([el('operator', 'NOG:Operator:x', '', 'Uten id'), el('operator', 'NOG:Operator:y', '', 'Også uten')]);
    expect(companies).toHaveLength(2);
  });

  it('finds a role entry by NOG ID', () => {
    const hit = findRole(registerCompanies(), 'NOG:Operator:ddddddddd4');
    expect(hit?.company.name).toBe('Fjord AS');
    expect(hit?.role).toBe('operator');
    expect(findRole(registerCompanies(), 'NOG:Operator:nope')).toBe(null);
    expect(findRole(registerCompanies(), 'TST:Operator:1')).toBe(null);
  });

  it('generates the alias from the project codespace and the NOG local part', () => {
    expect(generatedAlias('NOG:Operator:eaiEZukmNKG', 'ABC')).toBe('ABC:Operator:eaiEZukmNKG');
    expect(generatedAlias('NOG:Authority:c5MpNEEftqe', 'XYZ')).toBe('XYZ:Authority:c5MpNEEftqe');
  });

  it('uses the NOG ID in nog mode and the alias (typed or generated) in codespace mode', () => {
    const entry = { id: 'NOG:Operator:abc', version: '1', contact: { email: '', phone: '', url: '' }, alias: '' };
    expect(exportOrgId(entry, 'operator', 'nog', 'ABC')).toBe('NOG:Operator:abc');
    expect(exportOrgId(entry, 'operator', 'codespace', 'ABC')).toBe('ABC:Operator:abc');
    expect(exportOrgId({ ...entry, alias: 'KOL:Operator:309' }, 'operator', 'codespace', 'ABC')).toBe('KOL:Operator:309');
  });

  it('reports typed aliases with the wrong form or role', () => {
    const copy = projectCopy();
    /** @type {any} */ (copy[0].authority).alias = 'KOL:Operator:1';
    /** @type {any} */ (copy[1].operator).alias = 'kol:operator:1';
    expect(aliasIssues(copy, 'ABC').map((i) => i.code)).toEqual(['org-alias-format', 'org-alias-format']);
  });

  it('reports a typed alias that collides with another role\'s generated alias', () => {
    const copy = projectCopy();
    /** @type {any} */ (copy[0].authority).alias = 'ABC:Authority:bbbbbbbbbb2';
    /** @type {any} */ (copy[1]).authority = { id: 'NOG:Authority:bbbbbbbbbb2', version: '1', contact: { email: '', phone: '', url: '' }, alias: '' };
    const issues = aliasIssues(copy, 'ABC');
    expect(issues.map((i) => i.code).filter((c) => c !== 'org-alias-missing')).toEqual(['org-alias-duplicate', 'org-alias-duplicate']);
  });

  it('searches companies that have the role, by name, legal name, number or organisationId', () => {
    const all = registerCompanies();
    expect(searchCompanies(all, 'operator', '').map((c) => c.name)).toEqual(['Eksempel Buss AS', 'Fjord AS']);
    expect(searchCompanies(all, 'authority', 'fylke').map((c) => c.name)).toEqual(['Eksempel fylkeskommune']);
    expect(searchCompanies(all, 'operator', '938358').map((c) => c.name)).toEqual(['Eksempel Buss AS']);
    expect(searchCompanies(all, 'operator', '134').map((c) => c.name)).toEqual(['Fjord AS']);
    expect(searchCompanies(all, 'operator', 'EKSEMPEL BUSS').map((c) => c.name)).toEqual(['Eksempel Buss AS']);
  });
});

describe('the project copy', () => {
  it('adds a picked company with an empty alias, and adds a second role to an existing company', () => {
    const fjord = registerCompanies()[2];
    let copy = addToCopy([], fjord, 'operator');
    expect(copy).toHaveLength(1);
    expect(copy[0].operator?.alias).toBe('');
    expect(copy[0].authority).toBe(null);
    copy = addToCopy(copy, fjord, 'authority');
    expect(copy).toHaveLength(1);
    expect(copy[0].authority?.id).toBe('NOG:Authority:ccccccccc3');
    expect(addToCopy(copy, fjord, 'authority')).toEqual(copy);
  });

  it('refreshes names and contact from the register, keeps aliases, and reports changes', () => {
    const copy = projectCopy();
    /** @type {any} */ (copy[1].operator).alias = 'KOL:Operator:309';
    const register = registerCompanies();
    register[1].name = 'Eksempel Buss Norge AS';
    const r = refreshCopy(copy, register);
    expect(r.companies[1].name).toBe('Eksempel Buss Norge AS');
    expect(r.companies[1].operator?.alias).toBe('KOL:Operator:309');
    expect(r.changed).toEqual(['135']);
    expect(r.missing).toEqual([]);
  });

  it('keeps a company that is gone from the register and reports its role IDs as missing', () => {
    const r = refreshCopy(projectCopy(), registerCompanies().slice(1));
    expect(r.companies).toHaveLength(2);
    expect(r.missing).toEqual(['NOG:Authority:aaaaaaaaaa1']);
    expect(r.changed).toEqual([]);
  });

  it('prunes roles no line uses, but keeps those with an alias', () => {
    const copy = projectCopy();
    expect(pruneCopy(copy, new Set(['NOG:Operator:bbbbbbbbbb2'])).map((c) => c.name)).toEqual(['Eksempel Buss AS']);
    /** @type {any} */ (copy[0].authority).alias = 'RUT:Authority:1';
    expect(pruneCopy(copy, new Set())).toHaveLength(1);
  });

  it('lists every role entry as an id and name', () => {
    expect(orgNameList(registerCompanies())).toContainEqual({ id: 'NOG:Operator:ddddddddd4', name: 'Fjord AS' });
    expect(orgNameList(registerCompanies())).toHaveLength(4);
  });
});
