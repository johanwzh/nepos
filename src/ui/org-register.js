// Entur's organisation register in the running app (organisations spec §3): a copy kept in this
// browser, refreshed on page load and on request, and used to keep the project's copy current.
import { app } from './state.js';
import { refreshAll, runAction } from './shell.js';
import { fetchOrgRegister } from '../services/org-register.js';
import { refreshCopy, pruneCopy } from '../core/orgs.js';
import { writeOrgs } from '../project/orgs-store.js';

export const REGISTER_KEY = 'nepos.orgRegister';
let loading = false;

export function loadCachedRegister() {
  try {
    const value = JSON.parse(localStorage.getItem(REGISTER_KEY) ?? 'null');
    if (value && typeof value.fetchedAt === 'string' && Array.isArray(value.companies)) app.orgRegister = value;
  } catch { /* no cache: fine */ }
}

/**
 * Download the register. One at a time; a failure keeps the previous register.
 * @param {{ fetch?: (url: string, init?: any) => Promise<any> }} [opts]
 */
export async function refreshRegister({ fetch: doFetch } = {}) {
  if (loading) return false;
  loading = true;
  app.orgRegisterStatus = 'loading';
  refreshAll();
  try {
    const companies = await fetchOrgRegister({ clientName: app.settings.clientName || 'nepos-online', ...(doFetch ? { fetch: doFetch } : {}) });
    app.orgRegister = { companies, fetchedAt: new Date().toISOString() };
    try { localStorage.setItem(REGISTER_KEY, JSON.stringify(app.orgRegister)); } catch { /* storage full or blocked */ }
    app.orgRegisterStatus = 'ok';
    await syncProjectCopy();
    return true;
  } catch {
    app.orgRegisterStatus = 'failed';
    return false;
  } finally {
    loading = false;
    refreshAll();
  }
}

/** @param {import('../core/orgs.js').Company[]} next */
async function saveCopy(next) {
  const fs = app.fs;
  if (!fs || app.orgsError || JSON.stringify(next) === JSON.stringify(app.orgs)) return;
  app.orgs = next;
  await runAction(() => writeOrgs(fs, next));
}

/** Bring the project's copy up to date with the register (never touching aliases). */
export async function syncProjectCopy() {
  if (!app.fs || !app.orgRegister || app.orgsError) return;
  const { companies, changed, missing } = refreshCopy(app.orgs, app.orgRegister.companies);
  app.orgChanges = { changed, missing };
  await saveCopy(companies);
  refreshAll();
}

/** After a route save: drop organisations no route uses any more (unless they have an alias). */
export async function pruneProjectCopy() {
  /** @type {Set<string>} */
  const used = new Set();
  for (const r of app.routes) for (const m of r.text.matchAll(/^[ \t]*#SEK;([^;\r\n]*)/gm)) used.add(m[1].trim());
  await saveCopy(pruneCopy(app.orgs, used));
}

/** @param {{ fetchOnStart: boolean }} opts */
export function initOrgRegister({ fetchOnStart }) {
  loadCachedRegister();
  if (fetchOnStart && navigator.onLine !== false) void refreshRegister();
}
