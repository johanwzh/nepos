// The Hjelp menu's pages, shown in one window (#help-dlg). The version history is the changelog (CHANGELOG.md),
// built into the app, so it always matches the version that runs; the user guide is a placeholder for now.
import { $ } from './shell.js';
import { t } from '../i18n/strings.js';
import { VERSION } from '../version.js';
import CHANGELOG from '../../CHANGELOG.md?raw';

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

/** Compare two versions (2.10.0 > 2.9.1). @param {string} a @param {string} b */
const cmpVersion = (a, b) => {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
};

/** The changelog's own small Markdown: **bold** and `code`, after escaping. @param {string} s */
const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<code>$1</code>');

/**
 * The released sections of a changelog ("## 2.1.0 — 2026-10-18"), newest first, up to the running version. A section
 * that is not released yet (no date) is left out, so the menu matches the version that runs.
 * @param {string} md @param {string} running
 * @returns {{ version: string, date: string, html: string }[]}
 */
export function changelogSections(md, running) {
  /** @type {{ version: string, date: string, lines: string[] }[]} */
  const sections = [];
  for (const line of md.split(/\r?\n/)) {
    const h = /^##\s+(\d+\.\d+\.\d+)\s*[—-]\s*(.*)$/.exec(line);
    if (h) { sections.push({ version: h[1], date: /^\d{4}-\d{2}-\d{2}$/.test(h[2].trim()) ? h[2].trim() : '', lines: [] }); continue; }
    if (/^#/.test(line)) continue;
    sections[sections.length - 1]?.lines.push(line);
  }
  return sections.filter((s) => s.date && cmpVersion(s.version, running) <= 0).map((s) => {
    // Paragraphs and list items; an indented line continues the item or paragraph above it
    /** @type {{ li: boolean, text: string }[]} */
    const blocks = [];
    for (const line of s.lines) {
      if (!line.trim()) { blocks.push({ li: false, text: '' }); continue; }
      const item = /^-\s+(.*)$/.exec(line);
      const last = blocks[blocks.length - 1];
      if (item) blocks.push({ li: true, text: item[1] });
      else if (last && last.text) last.text += ` ${line.trim()}`;
      else blocks.push({ li: false, text: line.trim() });
    }
    let html = '', inList = false;
    for (const b of blocks.filter((x) => x.text)) {
      if (b.li && !inList) { html += '<ul>'; inList = true; }
      if (!b.li && inList) { html += '</ul>'; inList = false; }
      html += b.li ? `<li>${inline(b.text)}</li>` : `<p>${inline(b.text)}</p>`;
    }
    if (inList) html += '</ul>';
    return { version: s.version, date: s.date, html };
  });
}

export function showVersionHistory() {
  const sections = changelogSections(CHANGELOG, VERSION);
  show(t('helpVersions'), sections.length
    ? `<div class="help-versions">${sections.map((s) => `<h3>${esc(s.version)} <small>${esc(s.date)}</small></h3>${s.html}`).join('')}</div>`
    : `<p class="help-soon">${esc(t('helpVersionsNone'))}</p>`);
}

export function showContact() {
  show(t('helpContact'), `<p>${esc(t('helpContactText'))}</p>
    <p><b>Entur</b><br><a href="mailto:kollektivdata@entur.org">kollektivdata@entur.org</a></p>`);
}

export function showGitHub() {
  show('GitHub', `<p>${esc(t('helpGitHubText'))}</p><p><a href="${esc(GITHUB_URL)}" target="_blank" rel="noopener">${esc(GITHUB_URL)}</a></p>`);
}

export function initHelp() {
  $('help-close').addEventListener('click', () => $('help-dlg').close());
}
