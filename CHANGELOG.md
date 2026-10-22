# Changelog

Newest first. Version rule: fixes and tweaks x.x.+1, new features x.+1.0, major or breaking changes +1.0.0.

## 2.4.0 — not released yet

- **Oversikt, the project's first page:** what needs you today, in plain sentences: a line that stops running within 30
  days, a line with errors (grouped by kind), lines changed since their last export. Under "Snart": lines ending within
  Entur's 120 days, lines not exported for half a year, warnings. Then every line's validity against the 30, 60, 90 and
  120-day marks, and the network of all exported lines on one map (each stretch once, thicker where more trips run,
  red where a line has errors). The tab right of Eksport, Alt+6.
- **Exports are remembered** (`data/exports.json`): when each line was last exported, and whether it changed since.
- **Problems grouped on the export page:** the same problem on many trips of a line is one row with a count, which
  opens to the single problems, so the export button stays within reach.
- **Help → Delivery to Entur** (was Contact): where to upload the exported files (Entur partner, Timetables), that
  the project's codespace must match the one Entur gave you, and whom to contact when organisations or stop places
  are missing.
- **North up:** the map has a compass button that turns a rotated or tilted map back to north and flat; the map's
  buttons speak the app's language.
- **The NeTEx files say where they come from:** the PublicationDelivery Description is "Created with Nepos <version>".

## 2.3.0 — 2026-10-20

- **Vehicles:** the project's own vehicles ("Buss 7") on Ressurser, and a vehicle row in the timetable (right-click a
  day code → Vis kjøretøy) to say which vehicle runs each trip; it works like the label row. A vehicle has a short code
  (shown in the timetable instead of the name), a transport mode (a vehicle of another mode than the line is an export
  error, and the timetable offers only matching vehicles), fuel (NeTEx's fuel types), low floor, seats, length, width
  and height in metres, a vehicle type ID made by Nepos, and a VehicleTypeRef after the fixed `NMR:VehicleType:`. Its
  colour only marks it in the timetable. Saved in `data/vehicles.json` and as a text row in the line file; not exported
  yet (later a vehicle will refer to Entur's vehicle register).
- **Several columns at once:** Shift+click or Shift+arrows in the day-code row select several columns; F7 (or
  right-click → note) puts one note on all of them, and Ctrl+V pastes a day code into all of them.
- **The note row can be selected:** click a cell in the row above the day codes (Shift+click for several); a
  double-click or Enter edits the note, Ctrl+C / Ctrl+V copies a column's note and dates to other columns.
- **Ctrl+S on Ressurser** saves the open organisation alias, merkevare, label or vehicle (on the list: all unsaved ones).
- **What is new:** after an update, Nepos shows the changes since the version you used last, once (this window).
- **New map:** the map is MapLibre on OpenFreeMap's free vector tiles: Positron in light mode, Dark in dark mode. A
  custom raster tile address from before still works.
- **One marker at a time:** selecting a label or vehicle cell takes the marker off the timetable cell.
- **Fewer destination warnings:** the export check no longer warns that a destination or via is not one of the stops
  the trip goes on to (it repeated itself on every trip). The other destination checks stay.

## 2.2.0 — 2026-10-19

- **Direction of a table set:** an optional "Retning" (outbound, inbound, clockwise, anticlockwise) beside the
  calendars; saved in `#TRA` field 1 and exported as the Route's DirectionType.
- **Platform codes:** the NSR platform code (e.g. "A", "2") is shown beside the stop name; View → "Show stops'
  private codes" adds the NSR private code in a grey chip.
- **A missing submode** is an export error (modes without submodes excepted).
- **New project** asks for the language and light/dark from the start.
- **Big timetables are faster:** a redraw no longer searches the whole table for interchanges per cell, and the
  time jog changes only the moved cells while it turns; the rest follows when it rests.
- **Floating boxes stay on screen:** the date picker (and the other helper boxes) are placed by their full size and
  scroll inside when taller than the window.
- **Too fast is an export error:** a leg faster than the mode's speed limit (a red arc in the speed strip) stops the
  export, and the problems marker goes to its time. The limits can be changed per mode in Prosjektinnstillinger; a
  limit more than 1.5 × the default gives a warning that Entur may not accept such speeds.
- **A note on several times at once:** select times and press F7 (or right-click → note).
- **The grid follows the cursor:** the header rows (day codes, trip numbers) and the stop column stay frozen, and the
  selected cell never hides under them.
- **Reversing a table set** keeps the divider between the same two stops.
- **Times are aligned** in their column, with room for marks (a/p/x and the +1 day offset) to the right.
- **Help → Version history** shows this changelog; Help → GitHub links to the code.
- **Table-set tabs:** right-click for New / Duplicate / Edit / Delete; Edit (or double-click) sets the name and the
  direction, and the tab shows it ("Oslo–Bergen [Retur]"). Directions in Norwegian: Tur, Retur, Med klokka, Mot klokka.
- **Labels:** the planner's own labels for trips ("Normal", "Rush"), made on Resources with a colour, shown in a
  label row in the timetable; copy and paste between columns. Not exported.
- **Paste a list of stops:** every NSR Quay ID in pasted text, CSV or JSON fills the stop rows from the selected one
  down, adding rows as needed.
- **Pastes grow the table:** a block of times wider or taller than the table adds the columns and rows it needs (asks
  above 50).
- **Small fixes:** a blank table set starts as 3×3 like a new line; "New…" in a tab's menu copies that tab's stops;
  Ctrl+S never opens the browser's Save dialog; interpolating across midnight gives the later times their +1; a paste of
  non-times adds no rows or columns; a failed loose-file export leaves nothing behind; the export says where it is, from the project
  folder; a destination change on the last stop is warned about; pasting only a start
  keeps the changes below; a flagged destination change no longer cuts the line before it; the note bar sits above the
  speed profile.
- **Problems on the editor page:** "⚠ 2 feil · 1 advarsel"; a click goes to the next problem and marks the field.

## 2.1.0 — 2026-10-18

The first version tested against Entur's import (dev): it passes both the old and the new import.

- **Destinations** (destination displays): destination columns in the grid (Alt+D) with vias, changes along the trip,
  suggestions from bold and underlined stops, copy and paste, drag and shift+drag; `#DST`/`#DSK` in ERN, and
  DestinationDisplays with vias in NeTEx.
- **NeTEx for Entur's import:** notes on lines, trips and times as Notices; first stop departure only, last stop arrival
  only; no getting off at the first stop or on at the last; the Network carries an authority; NSR codespace declared;
  Routes cover all their patterns; no TransportMode on ServiceJourney; the ZIP named `<codespace>_<time>.zip`,
  compressed, with dates.
- **Dates on a single time:** a time can be switched off on some of the trip's days; the export splits the trip.
- **The line note** is saved as a note on the whole table (`#FOT -1;-1`); older `#KOM` files can be updated.
- **A new line takes its mode from its first stop.** Stop search: arrows/Tab and Enter pick a result.
- **Small fixes:** "+ New line" in the line navigator, copy and paste of day codes, day codes tidy themselves (DX76 →
  DX67), one-line notes, plain public/export flags ("Åpen rute / Lukket rute", "Eksporteres / Eksporteres ikke"),
  calendar chips by date, readable drop-down lists, bigger text in the export check, a warning for organisations
  without an export ID.

## 2.0.0 — 2026-10-17

Nepos 2: the web version of the ERN timetable editor, with ERN 2.0 files and NeTEx export.
