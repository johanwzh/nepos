# Architecture

Where things live in `src/` and how a change travels from a click to a file on disk. Paths are relative to the repo root.

## The flow in one paragraph

The user picks a project folder. `src/project/` reads it into the shared `app` object (`src/ui/state.js`). UI modules in `src/ui/` draw from `app` and from route states, change them, and call `refreshAll()` (or `markDirty()`). Anything that writes to the folder runs inside `runAction()`. Logic that decides things (parsing ERN, the trip model, the NeTEx export, the checks) lives in `src/core/` as pure functions with tests.

## Folder map

| Path | What it holds |
|---|---|
| `index.html` | All page markup. One `<div id="page-<id>" class="page">` per main tab (`tasks`, `edit`, `lines`, `calendars`, `assets`, `export`, `home`); tabs carry `data-page`. Texts carry `data-lk="<string key>"` |
| `src/main.js` | Starts every UI part (`initXxx()`), in order |
| `src/core/` | Pure logic: no DOM, no file access, no network, no `import.meta.env`. Tested without a browser |
| `src/core/ern/` | The ERN line-file parser (`parse.js`), writer (`serialize.js`), `validate.js`, `win1252.js` (the encoding), modes and flags |
| `src/core/integrity/` | The check that runs when a project opens: `check.js` (status `ok`, `outdated` or `damaged` per line file) and `roundtrip.js` (finds records that would be lost on save) |
| `src/core/netex/` | The NeTEx export: `export.js` (`buildNeTExFiles`), `collect.js`, `shared.js`, `line.js`, `journeys.js`, `xml.js`, and more |
| `src/core/export-check.js` | The check before export. Errors block the export, warnings do not |
| `src/core/features.js` | The `ROUTING` switch |
| `src/project/` | Everything that reads or writes the project folder: `fs.js`, `layout.js`, `open.js`, `create.js`, `format.js`, `routes.js`, one `*-store.js` per JSON file, `export.js`, `settings.js` |
| `src/ui/` | One module per screen or part. `shell.js` is the frame, `state.js` the shared state, `features.js` the flags |
| `src/i18n/` | `strings.js` (all UI text) and `modes.js` |
| `src/routing/` | Routing of ServiceLinks per transport mode (graph, tiles, a worker). Leave alone unless your change is about routing |
| `src/services/` | Entur's web services: stop places, geocoder, organisation register |
| `tests/` | Mirrors `src/` (`core/`, `project/`, `ui/`, `routing/`, `services/`, `i18n/`), plus `docs/`, `tools/`, `fixtures/` and `smoke.test.js` |
| `tools/probe-export/` | The export probe (`npm run probe-export`) |
| `docs/ern/` | The ERN format documents |

## Shared state and refreshing

- `app` (`src/ui/state.js`) is the running app's state: the open folder (`fs`), `meta` (the project file), `settings`, `calendars`, `orgs`, `brandings`, `labels`, `vehicles`, `routes` (the line list with their check status), `activeRoute` and `routeState` (the open line, from `parseERN`), `dirty`, `drafts` (unsaved edits of lines that are not open), and more.
- A UI module changes `app` and then calls `refreshAll()`. It redraws the texts, status bar and tabs, then runs every function registered with `onRefresh(fn)`.
- Register your redraw function with `onRefresh(fn)` in your `initXxx()`. Never push into the listener lists yourself: registration is idempotent (`addOnce`) because parts are started again in tests, and a stacked copy would redraw twice on every keystroke (`tests/ui/listeners.test.js` pins this).
- Other hooks in `src/ui/shell.js`: `markDirty()` (the open line changed; refreshes once), `onLinesChanged(fn)` and `notifyLinesChanged()` (the lines pane redraws without a full refresh), `onPanelToggle`, `onBeforeViewChange`, `setBeforeLeave` and `beforeLeave(reason)` (ask before unsaved changes are lost), `setPage(id)`, `showMessage(text)`.

## Every write goes through runAction

```js
await runAction(async () => { await writeThing(app.fs, value); }, buttonElement);
```

`runAction(action, trigger)` in `src/ui/shell.js` disables the button while `action` runs (no double runs), shows a failure to the user in a dialog (text key `actionFailed`) instead of losing it, and returns `true` when the action succeeded. Use it for every write to the project folder, including settings. The few batch writers that save many lines in one go (`calendar-replace-ui.js`, `route-editor.js`) catch and report their own failures; follow them only for a batch.

## Reading and writing the project folder

- `src/project/fs.js` defines the `ProjectFs` interface: `readBytes(path)` (null if missing), `writeBytes`, `list(dir)`, `mkdir`, `remove`. Paths are `/`-separated and relative to the project folder. The app uses a folder handle (`createHandleFs`); tests use `createMemoryFs(files)`, or `createHandleFs(new FakeDir('name'))` with the fake handle in `tests/project/fake-handle.js`.
- Paths live in `src/project/layout.js` (`PROJECT_FILE`, `ROUTES_DIR`, `LINKS_DIR`, `EXPORTS_DIR` and others). Add a new path there, not inline.
- A project JSON file has a store in `src/project/<name>-store.js` with a reader and a writer (the exception is `nepos-project.json`, handled by `meta.js`). `writeJsonBackedUp` in `layout.js` keeps the 10 newest backups in `data/backups/`.
- `openProject(fs)` in `open.js` checks the format version, runs format steps (after a full backup of `data/`), reads every store and gives each line file its integrity status.
- A line file is read and written with `readRoute` / `writeRoute` in `routes.js`; saving keeps a backup of the old file.

## The NeTEx export

1. `checkForExport` (`src/core/export-check.js`) lists errors and warnings. Every code in `CHECK_CODES` has a text `chk:<code>` in both languages.
2. `buildNeTExFiles({ codespace, deliveryName, routes, orgs, ... })` (`src/core/netex/export.js`) takes route states from `parseERN` and returns `[{ name, xml }]`: first `_<CS>-shared.xml`, then one `<CS>-Line-<code>.xml` per line (`CS` is the codespace in upper case). Pass `timestamp` in tests so the output is stable.
3. `writeExport` (`src/project/export.js`) writes a zip or loose files into a new `exports/<time>/` folder and never overwrites an earlier export.

What counts as an exported trip is defined once, in `src/core/netex/journeys.js`; `collect.js`, `line.js`, `hub-interchanges.js` and the export check all use it so they cannot disagree. The probe (`tools/probe-export/`) reads the written XML back and checks it against the project.

## Feature flags

`src/ui/features.js` holds flags for features that are built but held back from the production release:

```js
/** One line saying what is held back and why. */
export const HUBS = Boolean(import.meta.env.DEV);
```

A dev build (`npm run dev`) has every such feature; a production build has it off. The flag hides or disables the entry points (a button, a menu item, a shortcut, a help row): `power-tools.js` greys out the button and `help.js` leaves out a help row for `HUBS`. Core code never reads the flag; the UI reads it and passes an option into core as a parameter. Name a new flag after the feature, in capitals, as `HUBS` is. `import.meta.env.DEV` is true in tests; to test production behaviour use `vi.stubEnv('DEV', false)`, `vi.resetModules()` and a dynamic `import()` (see `tests/ui/hub-hidden.test.js`).

`src/core/features.js` is a different kind of switch (`ROUTING = true`): a feature that is on, with one place to turn it off.

## UI text

Every visible text is a key in `STRINGS.en` and `STRINGS.no` in `src/i18n/strings.js`. In markup, `data-lk="key"` sets the text and `data-lk-title="key"` the tooltip (`applyLang()` in `shell.js`). In code, `t('key', ...args)`; a text that needs values is a function, for example `(n) => n + ' lines'`. `tests/i18n/strings.test.js` fails when the two languages differ in keys or kinds of value.

## Where new code goes

| You add | Put it in | Test in |
|---|---|---|
| A rule, a calculation, a generator | `src/core/<topic>.js` (pure) | `tests/core/<topic>.test.js` |
| A screen or part | `src/ui/<name>.js` with an exported `initName()`, called from `src/main.js`, redrawing through `onRefresh` | `tests/ui/<name>.test.js` (jsdom) |
| A stored project file | `src/project/<name>-store.js` and a path in `layout.js` | `tests/project/<name>-store.test.js`, and the format rule in [conventions.md](conventions.md) |
| A new ERN record | `src/core/ern/` plus the format document | the ERN rule in [conventions.md](conventions.md) |
| A new export check | a code in `CHECK_CODES` and its two texts | `tests/core/export-check.test.js` |
| A new text | both blocks of `strings.js` | covered by `strings.test.js` |
