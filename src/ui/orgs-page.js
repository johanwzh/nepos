// Organisations page (F3). Interim: lists the project's companies. Rebuilt in plan 4a Task 8.
import { app } from './state.js';
import { $, onRefresh, currentPage } from './shell.js';
import { t } from '../i18n/strings.js';

export function renderOrgsPage() {
  if (currentPage() !== 'assets') return;
  const body = $('assets-body');
  body.innerHTML = '';
  const title = document.createElement('div');
  title.className = 'assets-title';
  title.textContent = t('orgTitle');
  body.appendChild(title);
  const p = (/** @type {string} */ text, /** @type {string} */ cls) => {
    const el = document.createElement('p');
    el.className = cls;
    el.textContent = text;
    body.appendChild(el);
  };
  if (!app.meta) { p(t('noProjectOpen'), 'assets-coming'); return; }
  if (app.orgsError) { p(t('orgsUnreadable'), 'assets-status bad'); return; }
  for (const c of app.orgs) p(c.name, 'asset-row');
}

export function initOrgsPage() {
  onRefresh(renderOrgsPage);
}
