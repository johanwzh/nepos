---
name: nepos-dev
description: Use when working in the Nepos repository (johanwzh/nepos): building or changing a feature, adding tests or UI text, touching ERN line files or the NeTEx export, or preparing a pull request.
---

# Nepos developer handbook

Nepos is a browser-based timetable editor for Norwegian public transport. It edits ERN line files in a project folder on the user's own machine and exports NeTEx (Nordic profile) for Entur. No server, no login. Plain JavaScript with JSDoc types, Vite and Vitest. Every push to `main` deploys the live site, so only the maintainer pushes there and releases.

**Licence:** contributions come in under the repo's licence, EUPL-1.2.

**Browser:** Chrome or Edge on a desktop. Nepos needs the File System Access API (`showDirectoryPicker`); other browsers get a notice on the start screen.

**A project is a folder** the user picks:

| Folder | Holds |
|---|---|
| `data/` | the project: `nepos-project.json`, `routes/<code>.txt` (ERN line files), calendars, organisations, brandings, labels, vehicles, `links/`, `backups/` |
| `exports/` | NeTEx deliveries: `exports/<time>/<CS>_<time>.zip` |
| `private/` | settings and secrets. **Never read, print, copy or commit anything in it.** |
| `cache/` | downloads Nepos can fetch again |

## Getting started

1. Fork `johanwzh/nepos`, clone your fork, and add the original as a second remote: `git remote add upstream https://github.com/johanwzh/nepos.git`, then `git fetch upstream`.
2. `npm ci`, then `npm test`. It must be green before you change anything. If it is not, stop and say so.
3. Branch from the commit you were given, or from the latest `main`: `git switch -c <branch> <commit>`. If git does not know the commit, stop and ask: it has to be on GitHub.
4. Write the tests first, change only the files the work needs, and ask before touching anything else.

## Commands

Node 22 (what the deploy uses). From the repo root:

| Do | Command |
|---|---|
| Install | `npm ci` |
| Dev server | `npm run dev`, then http://localhost:5173 |
| Dev server with an in-memory sample project (no folder needed) | http://localhost:5173/?sample |
| Everything: tests, then type check | `npm test` (runs `vitest run && tsc -p .`) |
| One test file | `npx vitest run tests/core/netex/export.test.js` |
| Watch mode | `npm run test:watch` |
| Type check only | `npx tsc -p .` |
| Production build into `dist/` | `npm run build` |
| Check a NeTEx export zip | `npm run probe-export -- <export.zip> [project folder]` |
| Export of the sample project, to compare before and after | `node <handbook folder>/export-snapshot.mjs <folder>` |

The probe reads the XML back and checks it against the project it came from; it must end with `✓ No errors`. The snapshot comparison is in [conventions.md](conventions.md).

## Where things live

`src/core/` pure logic (no DOM, files or network) · `src/ui/` one module per screen or part · `src/project/` all reading and writing of the project folder · `src/i18n/strings.js` every UI text, English and Norwegian · `src/core/netex/` the NeTEx export · `src/core/export-check.js` the check before export · `src/routing/` routing of ServiceLinks · `src/services/` Entur's web services · `tests/` mirrors `src/`.

Shared state, refresh, `runAction`, flags: [architecture.md](architecture.md).

## Rules that decide whether a PR is merged

- **Test first** (Vitest). New logic goes in `src/core/` with a test; UI code stays thin.
- **JSDoc types**, checked by `tsc` (also over `tests/` and `tools/`): `npm test` ends with no type errors.
- **Every UI string in English and Norwegian**, English UI names, calm tone.
- **Writes to the project folder go through `runAction()`.** Shared state is `app`; a change redraws through `refreshAll()`.
- **A feature that should not reach production yet sits behind a flag** in `src/ui/features.js`.
- **ERN line files and project JSON files:** every older file must still open, through a tolerant reader or a format step with a test.
- **The normal Entur NeTEx export must not change** unless the work is about the export.
- **Made-up test data only.** The repo is public.
- **Write for a stranger.** Nepos is an open-source tool. Code, comments, test names, docs and commit messages say what the code does and why: no names of people, teams or customers, no ticket or item numbers, no dates of requests, nothing only insiders would understand. Older comments that do this are not a pattern to copy.
- No new dependencies. No changes to `.github/workflows/`, `package.json`, `package-lock.json` or `src/version.js` (the maintainer releases). The user guide is on hold: write no user-guide text.

All of it, with the reasons: [conventions.md](conventions.md).

## Finishing

Run `npm test` in full, check that only the files the work needs have changed, commit with your own identity, and fill in the PR description from [pr-checklist.md](pr-checklist.md). No automatic checks run on pull requests, so every check is yours.

## Don't

- Don't push to `main` of `johanwzh/nepos` (every push is a release). Open a pull request from your fork.
- Don't read, edit or commit anything in `private/`, any `.env`, or real timetable or personal data.
- Don't change files the work doesn't need, and don't change the normal export's output.
- Don't edit an existing folder under `tests/fixtures/projects/`.
- Don't run `npm run baseline`: a one-off maintainer tool that needs files from Nepos 1.x that are not in the repo.
- Don't edit ERN files through a shell heredoc (Windows-1252, CRLF line ends).
- Don't add or reorder the main tabs without agreeing it first.
