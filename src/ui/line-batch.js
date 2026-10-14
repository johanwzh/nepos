// Actions on many lines at once, from the lines pane's maxi view (navigation spec §3.2). Edits are
// unsaved until saved, like any other edit (§2): the open line is changed in place, every other
// line is parked as a draft. Nepos never edits a damaged file: those are skipped and named.
import { app } from './state.js';
import { markDirty, refreshAll, runAction } from './shell.js';
import { t } from '../i18n/strings.js';
import { parseERN } from '../core/ern/parse.js';
import { serializeERN } from '../core/ern/serialize.js';
import { checkRouteFile } from '../core/integrity/check.js';
import { orgNameList, addToCopy } from '../core/orgs.js';
import { writeRoute, deleteRoute } from '../project/routes.js';
import { writeOrgs } from '../project/orgs-store.js';
import { fillMissingPeriod } from './route-state.js';
import { storeGrid, closeRoute } from './route-editor.js';

const lang = () => /** @type {'no' | 'en'} */ (app.settings.lang);

/**
 * @param {string[]} codes
 * @param {(rs: any) => void} fn
 * @returns {{ edited: string[], skipped: string[] }}
 */
export function editLines(codes, fn) {
  /** @type {string[]} */ const edited = [];
  /** @type {string[]} */ const skipped = [];
  let openEdited = false;
  for (const code of codes) {
    const entry = app.routes.find((r) => r.code === code);
    if (!entry) continue;
    if (entry.status === 'damaged') { skipped.push(code); continue; }
    if (code === app.activeRoute && app.routeState) {
      storeGrid();
      fn(app.routeState);
      openEdited = true;
    } else {
      const rs = app.drafts.get(code) ?? parseERN(entry.text, { lang: lang() });
      fillMissingPeriod(rs);
      fn(rs);
      app.drafts.set(code, rs);
    }
    edited.push(code);
  }
  if (openEdited) markDirty();
  else refreshAll();
  return { edited, skipped };
}

/**
 * Put a company on a line in one role, replacing every #SEK of that role; the company is added to
 * the project's copy (unless the copy could not be read).
 * @param {any} rs
 * @param {'authority' | 'operator'} role
 * @param {import('../core/orgs.js').Company} company
 */
export function setOrg(rs, role, company) {
  const entry = company[role];
  if (!entry) return;
  rs.sek = [
    ...rs.sek.filter((/** @type {any} */ s) => !(role === 'authority' ? s.isAuthority : s.isOperator)),
    { orgId: entry.id, isAuthority: role === 'authority', isOperator: role === 'operator', name: company.name },
  ];
  const next = addToCopy(app.orgs, company, role);
  const fs = app.fs;
  if (fs && !app.orgsError && next !== app.orgs) {
    app.orgs = next;
    void runAction(() => writeOrgs(fs, next));
  }
}

/** @param {string} code @param {any} rs */
const toText = (code, rs) => serializeERN(rs, code, { delivery: { name: app.meta.name, codespace: app.meta.codespace }, orgs: orgNameList(app.orgs) });

/**
 * Copy lines as they are now; each copy gets a new line ID, new table-set and column IDs (line
 * header spec §4) and is written at once.
 * @param {string[]} codes
 * @returns {Promise<string[]>} the new codes
 */
export async function duplicateLines(codes) {
  const fs = app.fs;
  if (!fs || !app.meta) return [];
  if (app.routeState) storeGrid();
  /** @type {string[]} */ const made = [];
  for (const code of codes) {
    const entry = app.routes.find((r) => r.code === code);
    if (!entry || entry.status === 'damaged') continue;
    const current = code === app.activeRoute && app.routeState ? app.routeState : app.drafts.get(code);
    const rs = parseERN(current ? toText(code, current) : entry.text, { lang: lang() }); // a deep copy
    rs.routeName = `${rs.routeName} ${t('copySuffix')}`.trim();
    for (const set of rs.tableSets) set.uid = crypto.randomUUID();
    for (const grid of Object.values(rs.grids)) for (const col of /** @type {any} */ (grid).cols) col.uid = crypto.randomUUID();
    const newCode = crypto.randomUUID();
    const text = toText(newCode, rs);
    if (!(await runAction(() => writeRoute(fs, newCode, text)))) break;
    app.routes = [...app.routes, { code: newCode, text, ...checkRouteFile(text) }];
    made.push(newCode);
  }
  refreshAll();
  return made;
}

/**
 * Delete lines after asking once; their unsaved edits go too.
 * @param {string[]} codes
 */
export async function deleteLines(codes) {
  const fs = app.fs;
  if (!fs || !codes.length || !confirm(t('deleteLinesConfirm', codes.length))) return;
  for (const code of codes) {
    if (!(await runAction(() => deleteRoute(fs, code)))) break;
    app.routes = app.routes.filter((r) => r.code !== code);
    app.drafts.delete(code);
    if (code === app.activeRoute) closeRoute();
  }
  refreshAll();
}
