# Nepos

A timetable editor for public transport that writes ERN files and exports NeTEx (Nordic profile) for
Entur. It runs in Chrome or Edge on a desktop and works on a project folder on your own machine:
no server, no login, nothing leaves your computer until you export.

Nepos 2 is a rewrite of Nepos 1.x for modern timetables built on NSR (the national stop register).

- **User guide (Norwegian):** [docs/user-guide.md](docs/user-guide.md)
- **ERN standard (version 2.0, being curated):** [docs/ern/ern-standard.md](docs/ern/ern-standard.md)

## What it does

- **Projects** on a local folder (File System Access API), with a project check that finds and
  repairs file problems when a project opens.
- **Lines** in one list (search, filter, sort, batch edits), each with Transmodel mode, codes,
  branding, authority and operator from Entur's organisation register (NOG).
- **Timetables** in a spreadsheet-like grid: table sets, project calendars, day codes, boarding marks,
  interchanges, notes and per-trip dates, trip and train numbers. Tools: interpolate times, copy a
  trip at an interval, shift times with a jog dial, sort columns, a day-code helper.
- **Stops** are NSR Quays, picked from search or the map (record a route by clicking platforms),
  with what NSR knows about each stop.
- **Checks** as you work (a speed profile per trip, line problems) and before export.
- **Export** to NeTEx: one file per line plus a shared file, DatedServiceJourneys per operating day.

## Commands

```bash
npm install      # once
npm run dev      # start Nepos locally, reloads on save
npm test         # all checks (Vitest + TypeScript type check of the JSDoc)
npm run build    # the static site, in dist/
```

## Status (2026-10-17)

Nepos 2 is in active development and user testing; it has not been released. Everything is plain
JavaScript with JSDoc types, Vite for the build and Vitest (jsdom) for the tests.

## Where things are documented

- Design: [docs/superpowers/specs/](docs/superpowers/specs/) — one document per feature area, newest last.
- How it was built, plan by plan: [docs/superpowers/plans/](docs/superpowers/plans/).
- What's next — open requests, ideas and known small issues: [docs/backlog.md](docs/backlog.md).

## Licence

Copyright © 2026 johanwzh. Licensed under the EUPL (European Union Public Licence) v. 1.2 — see
[LICENSE](LICENSE).

## Credits

Transport mode icons: Entur's icon set ([@entur/icons](https://www.npmjs.com/package/@entur/icons),
EUPL-1.2), recoloured to follow the Nepos theme. Map data © OpenStreetMap contributors.
