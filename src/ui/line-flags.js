// The Offentlig / Eksporteres switches on the Linjer rows (2.5, user 2026-10-29): export settings, not edits of the
// line, so they are saved at once — only the #EKS / #OFF records of the saved file change, with no backup (the switches
// must not push real backups out). Unsaved edits of the open line or a parked draft stay unsaved and carry the new
// value, so a later save keeps it and a later discard (which re-reads the file) keeps it too. Nepos never edits a
// damaged file: those are skipped and named.
import { app } from './state.js';
import { refreshAll } from './shell.js';
import { setLineFlags } from '../core/ern/flags.js';
import { checkRouteFile } from '../core/integrity/check.js';
import { writeRoute } from '../project/routes.js';

/**
 * @param {string[]} codes
 * @param {'exported' | 'isPublic'} flag
 * @param {boolean} value
 * @returns {Promise<{ edited: string[], skipped: string[] }>}
 */
export async function toggleLineFlag(codes, flag, value) {
  /** @type {string[]} */ const edited = [];
  /** @type {string[]} */ const skipped = [];
  for (const code of codes) {
    const entry = app.routes.find((r) => r.code === code);
    if (!entry) continue;
    if (entry.status === 'damaged') { skipped.push(code); continue; }
    const text = setLineFlags(entry.text, { [flag]: value });
    if (app.fs) await writeRoute(app.fs, code, text, { backup: false });
    app.routes = app.routes.map((r) => (r.code === code ? { code, text, ...checkRouteFile(text) } : r));
    if (code === app.activeRoute && app.routeState) app.routeState[flag] = value;
    const draft = app.drafts.get(code);
    if (draft) draft[flag] = value;
    edited.push(code);
  }
  refreshAll();
  return { edited, skipped };
}
