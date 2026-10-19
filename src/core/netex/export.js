import { collectNeTExData } from './collect.js';
import { genSharedXml } from './shared.js';
import { genLineXml } from './line.js';

/**
 * Build all NeTEx files for a project: the shared file first, then one file per line.
 * File names follow the Entur delivery convention: _CS-shared.xml and CS-Line-<id>.xml,
 * where CS is the codespace in upper case.
 * @param {{ codespace: string, deliveryName: string, routes: { code: string, rs: any }[],
 *           orgs: import('../orgs.js').Company[], orgMode?: 'codespace' | 'nog',
 *           brandings?: import('../../project/brandings-store.js').Branding[],
 *           calendars?: import('../calendars.js').Calendar[], timestamp?: string,
 *           shapes?: Map<string, import('../link-state.js').SavedShape>, quayInfo?: Map<string, any> }} input
 * @returns {{ name: string, xml: string }[]}
 */
export function buildNeTExFiles({ codespace, deliveryName, routes, orgs, orgMode = 'codespace', brandings = [], calendars = [], timestamp, shapes, quayInfo }) {
  const data = collectNeTExData({ codespace, routes, orgs, orgMode, brandings, calendars, shapes, quayInfo });
  const CS = data.cs.toUpperCase();
  // The line files first: they register the ServiceLinks the shared file then writes (it still comes first)
  const lines = data.routes.map(({ code, rs }) => ({ name: `${CS}-Line-${code}.xml`, xml: genLineXml(code, rs, data, { timestamp }) }));
  return [{ name: `_${CS}-shared.xml`, xml: genSharedXml(data, { deliveryName, timestamp }) }, ...lines];
}
