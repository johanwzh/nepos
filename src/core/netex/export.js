import { collectNeTExData } from './collect.js';
import { genSharedXml } from './shared.js';
import { genLineXml } from './line.js';

/**
 * Build all NeTEx files for a project: the shared file first, then one file per line.
 * @param {{ codespace: string, deliveryName: string, routes: { code: string, rs: any }[],
 *           orgs: { id: any, name: string }[], stopDb: any[], vehicles?: any[], timestamp?: string }} input
 * @returns {{ name: string, xml: string }[]}
 */
export function buildNeTExFiles({ codespace, deliveryName, routes, orgs, stopDb, vehicles = [], timestamp }) {
  const data = collectNeTExData({ codespace, routes, orgs, stopDb });
  return [
    { name: '_shared_data.xml', xml: genSharedXml(data, { deliveryName, vehicles, timestamp }) },
    ...data.routes.map(({ code, rs }) => ({
      name: `Line-${data.cs}_${code}_timetable.xml`,
      xml: genLineXml(code, rs, data, { timestamp }),
    })),
  ];
}
