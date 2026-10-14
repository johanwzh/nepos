# Nepos

Timetable editor that writes ERN files and exports NeTEx. Runs in Chrome or Edge on desktop and
works on a project folder on your own machine.

## Commands

```bash
npm run dev      # start Nepos locally, reloads on save
npm test         # run all checks
npm run build    # build the version that goes online
```

The ERN file format is documented in [docs/ern/ern-format.md](docs/ern/ern-format.md).

## Where things are documented

- Design (what Nepos 2 is and why): [docs/superpowers/specs/2026-10-13-nepos-2-foundation-design.md](docs/superpowers/specs/2026-10-13-nepos-2-foundation-design.md)
- How it was built, plan by plan: [docs/superpowers/plans/](docs/superpowers/plans/)
- What's next — open requests, design sessions and known small issues: [docs/backlog.md](docs/backlog.md)

## Status (2026-10-14)

All planned functionality for 2.0 is built and merged on `main`: projects and the project check,
organisations, timetable editing, NSR stops (search window, status marks), map panel, filling
times, and NeTEx export. Since then: organisations come from Entur's register (NOG), with two
export modes (plan 4a); line details with Transmodel modes and Entur icons, codes, brandings and
UUID IDs (plan 4b). The user is testing it with a real project; findings go into the backlog.
Not yet online: publishing to GitHub Pages waits for the user's go-ahead.

## Credits

Transport mode icons: Entur's icon set ([@entur/icons](https://www.npmjs.com/package/@entur/icons), EUPL-1.2), recoloured to follow the Nepos theme.
