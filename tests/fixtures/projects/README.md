# Frozen test projects

One small, made-up project folder per Nepos project format, byte for byte as that Nepos version wrote it. The
test `tests/project/upgrade.test.js` opens every folder here with the current code, so a change that would break
or lose data in an older project fails there. Everything in these folders is made up (the repository is public).

**Never edit a folder after it is committed** (`.gitattributes` stops git from changing line ends or encoding in
them, so the bytes stay as they were). When a release changes a project file, add a **new** folder beside the old
ones and leave the old ones alone. A user may skip versions, so every old folder must keep opening.

| Folder | Written by | Holds |
|---|---|---|
| `format-1` | Nepos 2.6 (project format 1) | the project file, orgs, brandings, calendars, labels, vehicles, exports, one routed-links file, and four lines: `10` and `20` as 2.6 saves them, `30` in every older convention the project check knows (it can be updated) and `31` without a `#LEV` record |

Not kept: `private/` (settings and secrets), `cache/`, `exports/` and `data/backups/` (Nepos makes them again).

Naming: `format-<formatVersion>` for the first folder of a project format, `format-<formatVersion>-<Nepos version>`
for a later one that adds something the first lacks (for example a line in a convention a newer Nepos started
using). The test reads the format from `data/nepos-project.json`, not from the folder name.
