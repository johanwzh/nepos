// "Replace calendar in all periods" (timetable structure spec §3): the season-switch bulk edit.
// Saved route files are rewritten (writeRoute keeps a backup); the open route is changed in memory
// and left unsaved, so the user's other unsaved edits are not saved behind their back.
import { app } from './state.js';
import { $, refreshAll, markDirty, showMessage } from './shell.js';
import { t } from '../i18n/strings.js';
import { replaceCalendarInErn, replaceCalendarInState } from '../core/calendar-replace.js';
import { writeRoute } from '../project/routes.js';
import { checkRouteFile } from '../core/integrity/check.js';

/** @type {string | null} */
let fromId = null;

/** @param {string} calendarId */
export function openCalendarReplace(calendarId) {
  fromId = calendarId;
  const others = app.calendars.filter((c) => c.id !== calendarId && c.name.trim());
  const from = app.calendars.find((c) => c.id === calendarId);
  $('cal-replace-from').textContent = from?.name ?? '';
  $('cal-replace-to').innerHTML = others.map((c) => `<option value="${c.id.replace(/"/g, '&quot;')}"></option>`).join('');
  [...$('cal-replace-to').options].forEach((/** @type {HTMLOptionElement} */ o, /** @type {number} */ i) => { o.textContent = others[i].name; });
  $('cal-replace-ok').disabled = !others.length;
  $('cal-replace-dlg').showModal();
}

async function apply() {
  const fs = app.fs;
  const to = $('cal-replace-to').value;
  if (!fs || !fromId || !to) return;
  const old = fromId;
  $('cal-replace-dlg').close();
  let total = 0;
  /** @type {string[]} */ const failed = [];
  for (const r of [...app.routes]) {
    if (r.code === app.activeRoute) continue;
    const { text, changed } = replaceCalendarInErn(r.text, old, to);
    if (!changed) continue;
    try {
      await writeRoute(fs, r.code, text);
      const { status, issues } = checkRouteFile(text);
      app.routes = app.routes.map((x) => (x.code === r.code ? { code: r.code, text, status, issues } : x));
      total += changed;
    } catch {
      failed.push(r.code);
    }
  }
  if (app.routeState) {
    const n = replaceCalendarInState(app.routeState, old, to);
    if (n) { total += n; markDirty(); }
  }
  showMessage([t('calReplaceDone', total), failed.length ? t('calReplaceFailed', failed.join(', ')) : ''].filter(Boolean).join('\n'));
  refreshAll();
}

export function initCalendarReplace() {
  $('cal-replace-ok').addEventListener('click', () => { void apply(); });
  $('cal-replace-cancel').addEventListener('click', () => $('cal-replace-dlg').close());
}
