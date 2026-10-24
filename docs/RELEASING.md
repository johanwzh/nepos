# Before every push to GitHub

Every push to `main` deploys the live site (GitHub Pages), so every push is a release. Go through this list
each time; nothing is pushed until every line is done or does not apply.

## 1. The code

- [ ] All work is merged into `main`; the working tree is clean (`git status`).
- [ ] Nothing private is tracked: `docs/superpowers/`, `docs/backlog.md`, `user-tests/`, `.superpowers/` stay out
      (`git ls-files` shows none of them).
- [ ] `git fetch` — `origin/main` has not moved since the last push (nothing to merge first).

## 2. The version

Rule: small fixes and tweaks = x.x.**+1**; new features = x.**+1**.0; major revamps and breaking changes = **+1**.0.0.
Pick the level from the biggest change since the last push.

**The local `main` always runs the version it will become (user 2026-10-24).** As soon as the first change of the next
version lands on local `main`, bump the three files below and open its changelog section as "not released yet", so the
app shows which version is being tested. If a later change raises the level (a fix version gets a new feature), bump
again. At release only the date goes into the changelog heading — check the version is still right.

- [ ] `package.json` → `"version"`
- [ ] `package-lock.json` → `"version"` (twice: the top and `packages[""]`)
- [ ] `src/version.js` → `VERSION` (shown in the app next to the logo)
- [ ] `CHANGELOG.md` → a section for the new version: what changed, in plain words, newest first, with the release
      date in its heading (`## 2.2.0 — 2026-10-19`, not "not released yet"). Help → Version history shows only dated
      sections up to the running version.

## 3. What users read

- [ ] UI texts exist in both languages (`src/i18n/strings.js`: English and Norwegian blocks).
- [ ] Keyboard shortcuts: the list in Help (`helpKeys` in `src/i18n/strings.js`, both languages) matches the app.
- [ ] User guide (`docs/user-guide.md`) describes new or changed features; old wording updated.
- [ ] Help menu content, when it exists, says the same as the guide.

## 4. The formats

- [ ] ERN format changed? `docs/ern/ern-standard.md` updated, the parser and writer agree with it, and the project
      check (`src/core/integrity/`) knows the new records or fields (round trip clean, older files "can be updated").
- [ ] NeTEx export changed? The files validate against Entur's NeTEx schema, every reference resolves, and a test
      export of a real project still looks right.

## 5. Tests

- [ ] `npm test` (Vitest and `tsc`) is green **after** the version bump — the smoke test compares
      `src/version.js` with `package.json`.

## 6. Push and check

- [ ] `git push origin main`.
- [ ] The "Deploy to GitHub Pages" run passes (`gh run watch`).
- [ ] The live site (https://johanwzh.github.io/nepos/) shows the new version.
- [ ] Tell the user the new version number and what is in it.
