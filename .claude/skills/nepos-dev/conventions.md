# Conventions

What a Nepos change has to look like, and why. Paths are relative to the repo root.

## Code

- Vanilla JavaScript as ES modules (`"type": "module"`). No framework, no TypeScript source files.
- Types are JSDoc, checked by `npx tsc -p .` (`allowJs`, `checkJs`, not `strict`) over `src/`, `tests/` and `tools/`. Document exported functions with `@param` and `@returns`, name shared shapes with `@typedef`, cast with `/** @type {any} */ (x)`, import a type with `import('../project/fs.js').ProjectFs`.
- Match the file you edit: naming, indentation, comment style. Some older files (the ERN parser and writer) are formatted differently; keep a file's own style. Comments say why, not what. Write for a stranger: Nepos is an open-source tool, so code, comments, test names, docs and commit messages never name people, teams or customers, ticket or item numbers, or dates of requests, and never rely on something only insiders know. Older comments that do this are not a pattern to copy.
- Put logic in `src/core/` as pure functions. Keep `src/ui/` to wiring and drawing.
- Text that comes from a project file or the network must not reach `innerHTML` unescaped. UI modules that build HTML define a small local `esc()` (see `src/ui/booking-form.js`); prefer `textContent`.
- Pass time and ids in so tests are stable: `buildNeTExFiles({ ..., timestamp })`, `writeExport(fs, files, { codespace, asZip, now })`.
- No new dependency, in `dependencies` or `devDependencies`. The one runtime dependency is `maplibre-gl` (the map).
- No version bump: `package.json`, `package-lock.json` and `src/version.js` stay as they are (a smoke test pins `src/version.js` to `package.json`). The maintainer releases; `docs/RELEASING.md` is the maintainer's release checklist, not a task for you.
- No change to `.github/workflows/`.

## Tests

- **Test first.** Write the test, watch it fail for the right reason, make it pass, then run the whole suite.
- Vitest runs `tests/**/*.test.js`; the folders mirror `src/`. The default environment is node.
- A UI test starts with `// @vitest-environment jsdom` and calls `loadAppMarkup()` from `tests/ui/dom-setup.js`, which loads the real `index.html`. `fetch` throws there: tests never use the network. `flush()` lets pending promise callbacks (file writes) finish.
- Project I/O tests use `createMemoryFs({ path: text })` from `src/project/fs.js`, or a fake folder handle wrapped as `createHandleFs(new FakeDir('name'))` (`FakeDir` is in `tests/project/fake-handle.js`; `tests/project/upgrade.test.js` shows it).
- Fixtures are in `tests/fixtures/`: `sample-project.js` (made-up line files), `mini-line.js` (`miniErn()` builds a small line, `buildLine()` its NeTEx), `orgs.js`, `links.js`, and recorded service responses in `nsr/`, `geocoder/` and `orgs/`. Line files in tests are strings joined with `'\r\n'`.
- A bug fix gets a test that fails before the fix.

## Tests of output (expected-file tests)

For anything the app writes (NeTEx XML, ERN text, JSON), compare the output with an expected file. The repo has no snapshot machinery; write the test by hand:

- Build the output in the test from a small made-up input, and compare the **whole text** with the expected file (`expect(actual).toBe(expected)`, so a failure shows a diff). Keep expected files under `tests/fixtures/<topic>/`.
- Make everything that varies a parameter (`timestamp`, `now`, ids) and nothing else. If something cannot be made stable, say so in the PR; don't normalise it away.
- Read each expected file in its own encoding. NeTEx XML is UTF-8. ERN files are Windows-1252 with CRLF line ends: read the bytes and decode with `decodeWin1252` from `src/core/ern/win1252.js`.
- Two traps: `.gitattributes` sets `* text=auto eol=lf`, which would rewrite the line ends of a CRLF expected file (the frozen projects are protected with a `-text` rule for their folder, `tests/fixtures/projects/**`), and `.gitignore` ignores `*.zip` (keep expected files as plain files). If you need a `.gitattributes` rule, say so in the PR.
- Never generate an expected file with the code under test and commit it as the expectation, and never edit one to make a test pass.

## UI text

- Every visible text is a key in **both** `STRINGS.en` and `STRINGS.no` in `src/i18n/strings.js`, with the same kind of value (`tests/i18n/strings.test.js` fails otherwise). A text with values is a function: `(n) => n + ' lines'`.
- In `index.html` a text is `data-lk="key"` (tooltip: `data-lk-title="key"`); in code, `t('key', ...args)`.
- **English UI names.** English text (UI, comments, PR text, changelog) names screens by the English block of `strings.js`. Today the main tabs are **Tasks**, **Edit timetable**, **Manage lines**, **Calendars**, **Resources**, **Export** and **Analysis**; the tab layout may change, so look a name up before you write it.
- **Norwegian:** reuse the term the Norwegian block already uses for the same thing (search the English text, read the `no` entry). Technical terms such as "codespace" stay as they are.
- **Calm tone.** Plain statements of what is wrong and what to do; no exclamation marks, no blame ("Must be filled in", not "Required!").
- A new keyboard shortcut goes in `helpKeys` in both languages. A new export-check code needs its text `chk:<code>` in both.

## ERN line files

- Documents: `docs/ern/ern-standard.md` (the ERN 2.0 standard) and `docs/ern/ern-format.md` (the format as Nepos uses it, with "Nepos Conventions and Deviations").
- Format: Windows-1252 (not UTF-8), CRLF line ends, fields separated by `;`, each line `#RECORD;field0;field1;…`. A field never contains `;` or a line break. Records are written in the order the standard describes them. Decode with `decodeWin1252`; never read or print a line file as UTF-8, and never edit one through a shell heredoc (it mangles `\r\n`). To look at one, from the repo root:
  ```bash
  node -e "import('./src/core/ern/win1252.js').then(m => process.stdout.write(m.decodeWin1252(new Uint8Array(require('fs').readFileSync(process.argv[1])))))" path/to/line.txt
  ```
  To write one, join the lines with `\r\n` and write the bytes of `encodeWin1252(text)`.
- **Rule:** Nepos never reuses or extends an existing field for another purpose. New information gets a **new record**, written into `docs/ern/ern-format.md` before it is implemented.
- A new record also needs: the parser (`src/core/ern/parse.js`) and writer (`serialize.js`) agreeing, so a save loses nothing (`findLostRecords` in `src/core/integrity/roundtrip.js` returns nothing); the record added to `KNOWN` in `src/core/integrity/check.js` (an unlisted record makes the file *damaged*, and a damaged file opens read-only); and a test in `tests/core/ern/`.
- Older files must still open. A convention that a newer Nepos rewrites on save is reported as *outdated* ("can be updated"); a new `outdated(...)` rule in `check.js` needs a line in that old convention in a frozen project (see below), and `tests/project/upgrade.test.js` fails without it.

## Project JSON files

These are the JSON files under `data/`: `nepos-project.json`, calendars, organisations, brandings, labels, vehicles, exports and `links/`. A user may skip versions, so an old project must open with nothing lost. When a change alters the shape of one, pick **one**:

1. **A tolerant reader** (the usual choice for a new optional field): the store's reader accepts every shape a released Nepos wrote, and keeps a field it does not know when it saves.
2. **A format step:** add `{ from: n, run }` to `MIGRATIONS` and raise `CURRENT_FORMAT_VERSION` in `src/project/format.js`. It runs when a project opens, after a full backup of `data/`.

Either way, add a test, and keep `tests/project/upgrade.test.js` green. It opens every **frozen project** in `tests/fixtures/projects/` with the current code. Frozen projects are made up, byte for byte as a Nepos version wrote them, and are **never edited** (`.gitattributes` keeps their bytes as they are). A change of shape needs a frozen project of the old shape: the existing `format-1` holds the shape of Nepos 2.6, and anything older or different is a **new** folder, `format-<n>` or `format-<n>-<Nepos version>` (`tests/fixtures/projects/README.md` says how). If you are unsure whether yours needs one, ask. `nepos-project.json` is read and written by `src/project/meta.js` rather than a `*-store.js`. The app itself reads `private/settings.json`; you and your tools do not.

## The normal NeTEx export

The export that users send to Entur must not change unless the work is about the export.

- The existing export tests (`tests/core/netex/`, `tests/core/export-round-1.test.js`, `tests/tools/probe-export.test.js`) pass unedited. A test that has to change means the export changed: stop and ask.
- A new output option is off by default. Core code takes it as a parameter (core never reads `import.meta.env`); the UI reads the feature flag and passes the option into `buildNeTExFiles`.
- If you touched `src/core/netex/`, `src/core/export-check.js` or `src/project/export.js`, compare the export of the made-up sample project before and after your change. Your work must be committed first; `<start-commit>` is the commit you branched from:
  ```bash
  cp <handbook folder>/export-snapshot.mjs ../export-snapshot.mjs
  node ../export-snapshot.mjs ../export-after          # on your branch, from the repo root
  git switch --detach <start-commit>
  node ../export-snapshot.mjs ../export-before
  git switch -                                         # back to your branch
  diff -r ../export-before ../export-after && echo "export unchanged"
  ```
  The script (`export-snapshot.mjs`, in the handbook folder) builds the NeTEx files of `tests/fixtures/sample-project.js` with a fixed timestamp. If your feature changes other output, add your own input to a test as well. Say in the PR what you found. To check a real export zip, use `npm run probe-export`.
- Element order follows the NeTEx schema (for example, `tests/core/export-round-1.test.js` pins note assignments before interchanges). The rules of Entur's validator that Nepos already checks are in `tests/core/netex/antu-rules.test.js` and `entur-import*.test.js`; a new rule's test goes beside them.
- A change that alters the export adds its check to `tools/probe-export/checks.js`, with a test in `tests/tools/probe-export.test.js`.

## Changelog

Only if you were asked to. `CHANGELOG.md` is newest first.

- Put the line under the unreleased section. Its heading is `## <version> — not released yet`; the maintainer tells you the version. If no such section exists, put the line in the PR description instead: the maintainer opens the section when the version changes.
- A section has a `**New features**` list, then `**Bug fixes**`. Bold labels, no `#` headings inside a section (the app's Help page skips them). Write plain words from the user's point of view, with English UI names. An indented line continues the item above it.
- A change to a project file adds a `**Your project files**` paragraph after the bug fixes: what changed, and whether the user must do anything.
- A feature behind a flag is not described as live; ask what to write.

```
- **Name of the feature:** what the user can now do, in a sentence or two, using the English UI names (**Edit timetable**, **Export**).
```

## Documents

`docs/ern/` is updated as described above. `docs/user-guide.md` is on hold: write no user-guide text and don't edit the file. Don't change `README.md` unless you were asked to.

## Commits

Use your own name and e-mail (`git config user.name`, `git config user.email`). Prefer a few focused commits; write the message as a plain sentence about what changed and why. Don't commit `node_modules/`, `dist/`, logs, or anything from `private/`.
