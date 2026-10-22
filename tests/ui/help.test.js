// @vitest-environment jsdom
// Help → Version history reads the changelog built into the app (user 2026-10-19): released versions only.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadAppMarkup } from './dom-setup.js';
import { initShell } from '../../src/ui/shell.js';
import { initHelp, showVersionHistory, showGitHub, changelogSections } from '../../src/ui/help.js';
import { VERSION } from '../../src/version.js';

beforeEach(() => { loadAppMarkup(); initShell(); initHelp(); });

const SAMPLE = `# Changelog

Intro text.

## 2.2.0 — not released yet

- **New:** something.

## 2.1.0 — 2026-10-18

The first version tested against Entur.

- **Destinations:** \`#DST\` and more.
- A plain line.

## 2.0.0 — 2026-10-17

Nepos 2.
`;

describe('version history', () => {
  it('reads the released sections of the changelog, newest first, up to the running version', () => {
    const s = changelogSections(SAMPLE, '2.1.0');
    expect(s.map((x) => x.version)).toEqual(['2.1.0', '2.0.0']);
    expect(s[0].date).toBe('2026-10-18');
    expect(s[0].html).toContain('<li><b>Destinations:</b> <code>#DST</code> and more.</li>');
    expect(s[0].html).toContain('<p>The first version tested against Entur.</p>');
  });

  it('shows the app\'s own changelog in the Help window, with the running version first', () => {
    showVersionHistory();
    const body = /** @type {HTMLElement} */ (document.getElementById('help-body'));
    expect(body.querySelector('h3')?.textContent).toContain(VERSION);
    expect(body.textContent).not.toContain('not released yet');
  });

  it('links to GitHub, now that Nepos is published there', () => {
    showGitHub();
    const a = /** @type {HTMLAnchorElement} */ (document.querySelector('#help-body a'));
    expect(a.href).toBe('https://github.com/johanwzh/nepos');
    expect(document.getElementById('help-body')?.textContent).not.toContain('Ikke publisert');
  });
});

describe('what is new after an update (user 2026-10-21)', () => {
  const MD = `## 2.3.0 — 2026-10-21\n\n- **Vehicles.**\n\n## 2.2.0 — 2026-10-19\n\n- **Labels.**\n\n## 2.1.0 — 2026-10-18\n\n- Old.\n`;
  /** @param {Record<string, string>} [init] */
  const store = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: (/** @type {string} */ k) => m.get(k) ?? null, setItem: (/** @type {string} */ k, /** @type {string} */ v) => { m.set(k, v); }, m }; };

  it('shows the versions since the one seen last, then remembers this one', async () => {
    const { showWhatsNew } = await import('../../src/ui/help.js');
    const s = store({ 'nepos.seenVersion': '2.1.0' });
    expect(showWhatsNew({ md: MD, running: '2.3.0', storage: s })).toBe(true);
    const dlg = /** @type {HTMLDialogElement} */ (document.getElementById('help-dlg'));
    expect(dlg.open).toBe(true);
    expect(document.getElementById('help-title')?.textContent).toContain('2.3.0');
    expect(document.getElementById('help-body')?.textContent).toContain('Vehicles');
    expect(document.getElementById('help-body')?.textContent).toContain('Labels');
    expect(document.getElementById('help-body')?.textContent).not.toContain('Old');
    expect(s.m.get('nepos.seenVersion')).toBe('2.3.0');
    dlg.close();
    expect(showWhatsNew({ md: MD, running: '2.3.0', storage: s })).toBe(false); // seen: not again
  });

  it('a returning user from before this feature sees this version\'s notes; a new user sees nothing', async () => {
    const { showWhatsNew } = await import('../../src/ui/help.js');
    const old = store({ 'nepos.lastTheme': 'dark' });
    expect(showWhatsNew({ md: MD, running: '2.3.0', storage: old })).toBe(true);
    expect(document.getElementById('help-body')?.textContent).not.toContain('Labels');
    /** @type {HTMLDialogElement} */ (document.getElementById('help-dlg')).close();
    const fresh = store();
    expect(showWhatsNew({ md: MD, running: '2.3.0', storage: fresh })).toBe(false);
    expect(fresh.m.get('nepos.seenVersion')).toBe('2.3.0');
  });

  it('shows nothing when the running version is not released yet (no date)', async () => {
    const { showWhatsNew } = await import('../../src/ui/help.js');
    expect(showWhatsNew({ md: '## 2.4.0 — not released yet\n\n- x\n' + MD, running: '2.4.0', storage: store({ 'nepos.seenVersion': '2.3.0' }) })).toBe(false);
  });
});

describe('Help → Delivery to Entur (user 2026-10-22)', () => {
  it('tells how to deliver: Entur partner, the codespace, missing organisations or stops, and the e-mail', async () => {
    const { showContact } = await import('../../src/ui/help.js');
    const { setLang, t } = await import('../../src/i18n/strings.js');
    setLang('no');
    showContact();
    const title = document.getElementById('help-title')?.textContent;
    const text = document.getElementById('help-body')?.textContent ?? '';
    expect(title).toBe('Levering til Entur');
    expect(t('helpContact')).toBe('Levering til Entur');
    expect(text).toContain('Rutetabeller');
    expect(document.querySelector('#help-body a[href="https://entur-partner.entur.org/"]')).not.toBeNull();
    expect(text).toContain('codespace');
    expect(text).toContain('organisasjonene');
    expect(text).toContain('kollektivdata@entur.org');
    setLang('en');
    showContact();
    expect(document.getElementById('help-title')?.textContent).toBe('Delivery to Entur');
    expect(document.getElementById('help-body')?.textContent).toContain('Timetables (Rutetabeller in Norwegian translation)');
    setLang('no');
  });
});
