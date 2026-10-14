// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseOrgRegister, fetchOrgRegister, ORG_REGISTER_URL } from '../../src/services/org-register.js';

const xml = readFileSync('tests/fixtures/orgs/register.xml', 'utf8');

describe('organisation register', () => {
  it('parses the export into companies, one per organisationId', () => {
    const companies = parseOrgRegister(xml);
    expect(companies.map((c) => c.name)).toEqual(['Børselv Taxi', 'Lesja Bilruter', 'Ruter']);
    const borselv = companies[0];
    expect(borselv.organisationId).toBe('134');
    expect(borselv.authority?.id).toBe('NOG:Authority:c5MpNEEftqe');
    expect(borselv.operator?.id).toBe('NOG:Operator:eaiFiQuFxGd');
    expect(borselv.operator?.contact).toEqual({ email: '', phone: '78464420', url: '' });
    expect(companies[2].authority?.version).toBe('13');
    expect(companies[2].operator).toBe(null);
    expect(companies[1].legalName).toBe('LESJA INNKJØPSLAG SA');
  });

  it('refuses something that is not an organisation register', () => {
    expect(() => parseOrgRegister('<html><body>Maintenance</body></html>')).toThrow('Not an organisation register');
  });

  it('downloads with the client name header', async () => {
    /** @type {any[]} */ const calls = [];
    const fake = async (/** @type {string} */ url, /** @type {any} */ init) => { calls.push([url, init]); return { ok: true, status: 200, text: async () => xml }; };
    const companies = await fetchOrgRegister({ clientName: 'nepos-online', fetch: fake });
    expect(companies).toHaveLength(3);
    expect(calls[0][0]).toBe(ORG_REGISTER_URL);
    expect(calls[0][1].headers['ET-Client-Name']).toBe('nepos-online');
  });

  it('reports a failed download', async () => {
    const fake = async () => ({ ok: false, status: 503, text: async () => '' });
    await expect(fetchOrgRegister({ clientName: 'x', fetch: fake })).rejects.toThrow('Entur answered 503');
  });
});

describe('a damaged register download', () => {
  it('refuses a cut-off document instead of returning the companies read so far', () => {
    const cut = xml.slice(0, xml.indexOf('<Authority id="NOG:Authority:23e9gDqTGNg"') + 60);
    expect(() => parseOrgRegister(cut)).toThrow('Not an organisation register');
  });
});
