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
      Split the section in two (user 2026-10-30): a `**New features**` paragraph, then `**Bug fixes**` (oversights
      and things that did not work as meant), each a list. Help shows both; `#` headings are skipped there.
      A release that changes a project file adds a third paragraph, `**Your project files**` (§4).

## 3. What users read

- [ ] UI texts exist in both languages (`src/i18n/strings.js`: English and Norwegian blocks).
- [ ] Keyboard shortcuts: the list in Help (`helpKeys` in `src/i18n/strings.js`, both languages) matches the app.
- [ ] User guide (`docs/user-guide.md`) describes new or changed features; old wording updated.
- [ ] Help menu content, when it exists, says the same as the guide.

## 4. The formats

- [ ] ERN format changed? `docs/ern/ern-standard.md` updated, the parser and writer agree with it, and the project
      check (`src/core/integrity/`) knows the new records or fields (round trip clean, older files "can be updated").
      A new "outdated" rule needs a line in the old convention in a new frozen project (next item).
- [ ] **A JSON project file changed shape (backlog 29)?** (`data/nepos-project.json` and the stores in `src/project/`:
      calendars, orgs, brandings, labels, vehicles, exports, links.) A user may skip versions and must arrive safely,
      with nothing lost. Either the store's reader still accepts every shape a released version wrote, and keeps a
      field it does not know (preferred, for an added optional field), or add a `MIGRATIONS` step and raise
      `CURRENT_FORMAT_VERSION` in `src/project/format.js` (it runs when the project opens, after a full backup of
      `data/`). Either way: add a frozen project of the old shape beside the others in `tests/fixtures/projects/`
      (never edit a folder there; its README says how) and keep `tests/project/upgrade.test.js`, which opens every
      folder with the new code, green.
- [ ] **Any project file changed (a JSON file as above, or the ERN line files)?** The release's `CHANGELOG.md` section
      gets a `**Your project files**` paragraph after the bug fixes: what changed, and whether the user must do
      anything ("nothing, Nepos updates it when you save", or "open the project and press **Update outdated
      files**"). The Project check dialog already shows the detail per file. Nothing changed: no paragraph.
- [ ] NeTEx export changed? The files validate against Entur's NeTEx schema, every reference resolves, and a test
      export of a real project still looks right.

- [ ] **Every release, whether the export changed or not (user 2026-10-30):** export the test project(s) from the
      app, then run the probe on the zip:
      `npm run probe-export -- "<project>/exports/<time>/<name>.zip"`
      It finds the project from the zip's place and checks the XML on its own (every reference resolves, no id twice,
      passing times follow their pattern and run forward, every trip runs on a day, interchanges call where they say)
      and against the project (every trip of every table, interval trips included: stops, times, day offsets, notes,
      operating days, interchanges) and its routed links (2.6, from `data/links/`: each ServiceLink starts and ends
      within 300 m of its stops (a far stop, spec §5), its Distance is the saved one, a pattern's links follow its stops; PRT keeps at least
      one routed bus line). It warns when a route file was saved after the export (re-export first). Must end
      with "No errors". A feature that changes the export adds its check to `tools/probe-export/checks.js` (with a test
      in `tests/tools/probe-export.test.js`). The test project is **PRT**
      (kept in the dev workspace's `data-dev/PRT`, every feature).
      PRT grows into the standard test set (backlog): add a case to it with each new feature.

## 5. Tests

- [ ] `npm test` (Vitest and `tsc`) is green **after** the version bump — the smoke test compares
      `src/version.js` with `package.json`.

## 6. Push and check

- [ ] `git push origin main`.
- [ ] The "Deploy to GitHub Pages" run passes (`gh run watch`).
- [ ] The live site (https://johanwzh.github.io/nepos/) shows the new version.
- [ ] Tell the user the new version number and what is in it.
