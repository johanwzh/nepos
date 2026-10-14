// Ressurser → Profiler (line header spec §6). Rows are built once per showing; edits change
// their own field. A branding is saved once it has a name; the file is never written when it
// could not be read.
import { app } from './state.js';
import { $, onRefresh, currentPage, runAction } from './shell.js';
import { t } from '../i18n/strings.js';
import { writeBrandings, newBranding } from '../project/brandings-store.js';

const FIELDS = /** @type {const} */ (['name', 'shortName', 'description', 'url', 'imageUrl']);
const LABEL = { name: 'brandName', shortName: 'brandShortName', description: 'brandDescription', url: 'brandUrl', imageUrl: 'brandImageUrl' };

function save() {
  const fs = app.fs;
  if (!fs || app.brandingsError) return;
  const named = app.brandings.filter((b) => b.name.trim());
  void runAction(() => writeBrandings(fs, named));
}

/** @param {string} id */
const usedBy = (id) => app.routes.filter((r) => r.text.split(/\r?\n/).some((l) => l.trim() === `#BRA;${id}`)).length;

export function renderBrandingsPage() {
  if (currentPage() !== 'assets' || app.assetsSection !== 'brandings') return;
  const body = $('assets-body');
  body.innerHTML = '';
  const title = document.createElement('div');
  title.className = 'assets-title';
  title.textContent = t('brandTitle');
  body.appendChild(title);
  const p = (/** @type {string} */ text, /** @type {string} */ cls) => { const el = document.createElement('p'); el.className = cls; el.textContent = text; body.appendChild(el); };
  if (!app.meta) { p(t('noProjectOpen'), 'assets-coming'); return; }
  if (app.brandingsError) { p(t('brandsUnreadable'), 'assets-status bad'); return; }
  if (!app.brandings.length) p(t('brandNone'), 'assets-hint');

  for (const b of app.brandings) {
    const row = document.createElement('div');
    row.className = 'brand-row';
    for (const field of FIELDS) {
      const input = document.createElement('input');
      input.className = 'brand-in';
      input.dataset.field = field;
      input.placeholder = t(LABEL[field]);
      input.title = t(LABEL[field]);
      input.value = b[field];
      input.addEventListener('keydown', (e) => e.stopPropagation());
      input.addEventListener('change', () => {
        b[field] = input.value.trim();
        input.classList.toggle('invalid', field === 'name' && !b.name);
        save();
      });
      row.appendChild(input);
    }
    const del = document.createElement('button');
    del.className = 'brand-del';
    del.textContent = '×';
    del.addEventListener('click', () => {
      if (!confirm(t('brandDeleteConfirm', b.name, usedBy(b.id)))) return;
      app.brandings = app.brandings.filter((x) => x !== b);
      save();
      renderBrandingsPage();
    });
    row.appendChild(del);
    body.appendChild(row);
  }
  const add = document.createElement('button');
  add.className = 'brand-add';
  add.textContent = t('brandAdd');
  add.addEventListener('click', () => {
    app.brandings = [...app.brandings, newBranding(app.meta?.codespace ?? '')];
    renderBrandingsPage();
    /** @type {HTMLInputElement | null} */ (body.querySelector('.brand-row:last-of-type .brand-in'))?.focus();
  });
  body.appendChild(add);
}

export function initBrandingsPage() {
  onRefresh(renderBrandingsPage);
}
