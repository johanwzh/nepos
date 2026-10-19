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
