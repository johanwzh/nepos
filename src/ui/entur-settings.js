// Prosjektinnstillinger → Entur-tilkobling (list pages, decided 2026-10-16): the organisation
// register's status with a refresh button, where to ask for a missing organisation, and the Entur
// addresses Nepos uses (read-only).
import { app } from './state.js';
import { t } from '../i18n/strings.js';
import { onRefresh } from './shell.js';
import { refreshRegister } from './org-register.js';
import { ORG_REGISTER_URL } from '../services/org-register.js';

/** @param {string} iso */
const when = (iso) => {
  const d = new Date(iso);
  const p = (/** @type {number} */ n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** @param {string} tag @param {string} cls @param {string} [text] */
const el = (tag, cls, text = '') => { const e = document.createElement(tag); e.className = cls; if (text) e.textContent = text; return e; };

/** Fill the section, if the settings dialog has it. */
export function renderEnturSettings() {
  const box = document.getElementById('settings-entur');
  if (!box) return;
  box.innerHTML = '';
  box.appendChild(el('div', 'set-h', t('settingsEntur')));

  const line = el('div', 'org-status');
  const reg = app.orgRegister;
  const s = app.orgRegisterStatus;
  line.textContent = s === 'loading' ? t('orgRegisterLoading')
    : s === 'failed' ? (reg ? t('orgRegisterFailed', when(reg.fetchedAt)) : t('orgRegisterNone'))
    : reg ? t('orgRegisterStatus', reg.companies.length, when(reg.fetchedAt)) : t('orgRegisterNone');
  line.classList.toggle('bad', s === 'failed');
  const btn = /** @type {HTMLButtonElement} */ (el('button', 'pop-btn org-refresh', t('orgRefresh')));
  btn.id = 'org-refresh';
  btn.disabled = s === 'loading';
  btn.addEventListener('click', () => { void refreshRegister(); });
  line.appendChild(btn);
  box.appendChild(line);

  const note = el('p', 'org-missing-note');
  const [before, after] = t('orgMissingNote').split('{mail}');
  const a = document.createElement('a');
  a.href = 'mailto:kollektivdata@entur.org';
  a.textContent = 'kollektivdata@entur.org';
  note.append(before, a, after ?? '');
  box.appendChild(note);

  const urls = el('dl', 'set-urls');
  for (const [label, url] of [[t('settingsOrgUrl'), ORG_REGISTER_URL], [t('settingsGeocoderUrl'), app.settings.geocoderUrl], [t('settingsStopsUrl'), app.settings.stopPlacesUrl]]) {
    urls.append(el('dt', '', label), el('dd', '', url ?? ''));
  }
  box.appendChild(urls);
}

/** Keep the section current while the dialog is open (a refresh finishing, say). */
export function initEnturSettings() {
  onRefresh(() => { if (/** @type {HTMLDialogElement | null} */ (document.getElementById('settings-dlg'))?.open) renderEnturSettings(); });
}
