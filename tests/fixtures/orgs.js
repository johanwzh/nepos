
// Registry companies for tests: one authority-only, one operator-only, one with both roles.
/** @returns {import('../../src/core/orgs.js').Company[]} */
export function registerCompanies() {
  const contact = (url = '') => ({ email: '', phone: '', url });
  return [
    { organisationId: '22', companyNumber: '991609407', name: 'Eksempel fylkeskommune', legalName: 'EKSEMPEL FYLKESKOMMUNE',
      tradingName: '', authority: { id: 'NOG:Authority:aaaaaaaaaa1', version: '3', contact: contact('https://fylke.example') }, operator: null },
    { organisationId: '135', companyNumber: '938358907', name: 'Eksempel Buss AS', legalName: 'EKSEMPEL BUSS AS',
      tradingName: 'Eksempel Buss', authority: null, operator: { id: 'NOG:Operator:bbbbbbbbbb2', version: '1', contact: { email: '', phone: '61245400', url: '' } } },
    { organisationId: '134', companyNumber: '985859310', name: 'Fjord AS', legalName: 'FJORD AS', tradingName: '',
      authority: { id: 'NOG:Authority:ccccccccc3', version: '1', contact: contact() },
      operator: { id: 'NOG:Operator:ddddddddd4', version: '1', contact: contact() } },
  ];
}

/** A project copy holding the first two companies, aliases empty. */
export function projectCopy() {
  return registerCompanies().slice(0, 2).map((c) => ({
    ...c,
    authority: c.authority && { ...c.authority, alias: '' },
    operator: c.operator && { ...c.operator, alias: '' },
  }));
}
