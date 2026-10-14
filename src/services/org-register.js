// Entur's organisation register (NOG), spec §2: the only code that calls the agreements API.
// The export is NeTEx; it is parsed with the browser's DOMParser into companies.
import { groupCompanies } from '../core/orgs.js';

export const ORG_REGISTER_URL = 'https://api.entur.io/agreements/v1/adapter/transmodel/export';

/** @param {Element} el @param {string} name */
const child = (el, name) => [...el.children].find((c) => c.localName === name) ?? null;
/** @param {Element} el @param {string} name */
const text = (el, name) => child(el, name)?.textContent?.trim() ?? '';

/**
 * @param {string} xml
 * @returns {import('../core/orgs.js').Company[]}
 */
export function parseOrgRegister(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  // A cut-off or broken download: browsers keep the elements read before the error, which would
  // look like a register where every later company is gone.
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Not an organisation register');
  const elements = [...doc.getElementsByTagNameNS('*', 'Authority'), ...doc.getElementsByTagNameNS('*', 'Operator')];
  if (!elements.length) throw new Error('Not an organisation register');
  return groupCompanies(elements.map((el) => {
    const contact = child(el, 'ContactDetails');
    const orgIdEl = [...el.children].find((c) => c.localName === 'PrivateCode' && c.getAttribute('type') === 'organisationId');
    return {
      role: /** @type {'authority' | 'operator'} */ (el.localName === 'Authority' ? 'authority' : 'operator'),
      id: el.getAttribute('id') ?? '',
      version: el.getAttribute('version') ?? '1',
      organisationId: orgIdEl?.textContent?.trim() ?? '',
      companyNumber: text(el, 'CompanyNumber'),
      name: text(el, 'Name'),
      legalName: text(el, 'LegalName'),
      tradingName: text(el, 'TradingName'),
      contact: { email: contact ? text(contact, 'Email') : '', phone: contact ? text(contact, 'Phone') : '', url: contact ? text(contact, 'Url') : '' },
    };
  }).filter((e) => e.id));
}

/**
 * @param {{ url?: string, clientName: string, fetch?: (url: string, init?: any) => Promise<any> }} opts
 */
export async function fetchOrgRegister({ url = ORG_REGISTER_URL, clientName, fetch: doFetch = (u, init) => fetch(u, init) }) {
  const res = await doFetch(url, { headers: { 'ET-Client-Name': clientName, Accept: 'application/xml' } });
  if (!res.ok) throw new Error(`Entur answered ${res.status}`);
  return parseOrgRegister(await res.text());
}
