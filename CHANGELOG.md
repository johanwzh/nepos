# Changelog

Newest first. Version rule: fixes and tweaks x.x.+1, new features x.+1.0, major or breaking changes +1.0.0.

## 2.2.0 — not released yet

- **Direction of a table set:** an optional "Retning" (outbound, inbound, clockwise, anticlockwise) beside the
  calendars; saved in `#TRA` field 1 and exported as the Route's DirectionType.
- **Platform codes:** the NSR platform code (e.g. "A", "2") is shown beside the stop name; View → "Show stops'
  private codes" adds the NSR private code in a grey chip.
- **A missing submode** is an export error (modes without submodes excepted).
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
