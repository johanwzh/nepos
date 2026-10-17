// The Hjelp menu's pages, shown in one window (#help-dlg). The user guide and the version history
// are placeholders for now (backlog); the version history will be read from GitHub once the
// project is published there.
import { $ } from './shell.js';
import { t } from '../i18n/strings.js';

export const GITHUB_URL = 'https://github.com/johanwzh/nepos';

/** @param {string} s */
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** @param {string} title @param {string} html */
function show(title, html) {
  $('help-title').textContent = title;
  $('help-body').innerHTML = html;
  $('help-dlg').showModal();
}

export function showShortcuts() {
  const rows = /** @type {[string, string][]} */ (/** @type {unknown} */ (t('helpKeys')));
  show(t('helpShortcuts'), `<table class="help-keys">${rows.map(([k, what]) => `<tr><td><kbd>${esc(k)}</kbd></td><td>${esc(what)}</td></tr>`).join('')}</table>`);
}

export function showUserGuide() {
  show(t('helpGuide'), `<p class="help-soon">${esc(t('helpGuideSoon'))}</p>`);
}

export function showVersionHistory() {
  show(t('helpVersions'), `<p class="help-soon">${esc(t('helpVersionsSoon'))}</p>`);
}

export function showContact() {
  show(t('helpContact'), `<p>${esc(t('helpContactText'))}</p>
    <p><b>Entur</b><br><a href="mailto:kollektivdata@entur.org">kollektivdata@entur.org</a></p>`);
}

export function showGitHub() {
  show('GitHub', `<p>${esc(t('helpGitHubText'))}</p><p><code>${esc(GITHUB_URL)}</code></p><p class="help-soon">${esc(t('helpGitHubSoon'))}</p>`);
}

export function initHelp() {
  $('help-close').addEventListener('click', () => $('help-dlg').close());
}
