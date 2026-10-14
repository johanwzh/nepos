// Unsaved edits per line (navigation spec §2): the open line's unsaved state is parked here when
// another line is opened, and taken back when the line is opened again.
import { app } from './state.js';

/** @param {string} code */
export function isUnsaved(code) {
  return code === app.activeRoute ? app.dirty : app.drafts.has(code);
}

export function unsavedCodes() {
  const codes = [...app.drafts.keys()];
  if (app.activeRoute && app.dirty && !codes.includes(app.activeRoute)) codes.push(app.activeRoute);
  return codes;
}

/** Park the open line's state if it has unsaved changes (call after storing the grid). */
export function parkOpenLine() {
  if (app.activeRoute && app.routeState && app.dirty) app.drafts.set(app.activeRoute, app.routeState);
}

/** @param {string} code */
export function takeDraft(code) {
  const rs = app.drafts.get(code) ?? null;
  app.drafts.delete(code);
  return rs;
}
