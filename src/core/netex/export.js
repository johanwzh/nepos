import { collectNeTExData } from './collect.js';
import { genSharedXml } from './shared.js';
import { genLineXml } from './line.js';

/**
 * Build all NeTEx files for a project: the shared file first, then one file per line.
 * File names follow the Entur delivery convention: _CS-shared.xml and CS-Line-<id>.xml,
 * where CS is the codespace in upper case.
 * @param {{ codespace: string, deliveryName: string, routes: { code: string, rs: any }[],
 *           orgs: { id: any, name: string }[], stopDb: any[], timestamp?: string }} input
 * @returns {{ name: string, xml: string }[]}
 */
export function buildNeTExFiles({ codespace, deliveryName, routes, orgs, stopDb, timestamp }) {
  const data = collectNeTExData({ codespace, routes, orgs, stopDb });
  const CS = data.cs.toUpperCase();
  return [
    { name: `_${CS}-shared.xml`, xml: genSharedXml(data, { deliveryName, timestamp }) },
    ...data.routes.map(({ code, rs }) => ({
      name: `${CS}-Line-${code}.xml`,
      xml: genLineXml(code, rs, data, { timestamp }),
    })),
  ];
}
