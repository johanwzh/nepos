# Changelog

Newest first. Version rule: fixes and tweaks x.x.+1, new features x.+1.0, major or breaking changes +1.0.0.

## 2.5.1 — not released yet

**Bug fixes**

- **The trip-number row's caption** lines up with Label and Vehicle above it.

## 2.5.0 — 2026-10-30

**New features**

- **Copy several stops or day codes:** with several stops selected, Ctrl+C copies all their Quay IDs as a list (a
  waiting stop once); pasting the list fills the rows down and adds rows as needed. With several columns selected in the
  day-code row, Ctrl+C copies their day codes, and Ctrl+V puts them in order from the selected column, adding columns as
  needed.
- **A stop's name is never free text:** Enter or F2 on a stop opens the stop search with its name (selected, so typing
  replaces it), instead of editing the name. The map stays open.
- **Modes from the Nordic profile only:** the mode menu (and the vehicles' modes) offer only what Entur's Nordic NeTEx
  profile allows — no lift, trolley bus, miniBus and the like. A line already set to something outside it still shows
  its setting.
- **Street View** beside NSR on the stop card, at the stop's position.
- **Linjer:** the Gyldig column is gone (the timeline under each row shows it), and the mode's icon sits before the
  line code instead of in a column of its own.
- **The map follows the stop column, or stays pinned:** unpinned, the map opens when the cursor is in the stop column
  and hides when it leaves. The pin in the map's header keeps it open; **Alt+M** opens and pins it, Alt+M again unpins
  and hides it; ✕ closes and unpins. A click or Shift+click on the map no longer moves the map back to the first stop
  place.
- **Stop picking 2:** typing a stop name in a stop cell opens a small **search window at the cell** (the map pane no
  longer takes the keyboard). The hits are a tree — each stop place with its platforms (platform and private code)
  under it — and only a platform is ever picked, so it can't be forgotten: arrows, Enter, and the cell flashes. On the
  map, **a click on a platform puts it on the selected stop row** at once; **Shift+click** adds a row below;
  right-click also has Add above (Alt+Shift switches keyboard layout on Windows). The platform marked in the window —
  with the arrows or the mouse — is marked on the map; a platform without codes has a dot. Platforms are **pins** (the tip is the place) and show one zoom
  step further out. **Registrer stopp** moved to Spesialverktøy (Alt+R), where a greyed **Optimalisering** shows where
  later tools will go. The stop card shows NSR's facts as symbols with a short word.
- **The speed strip reads better:** the dashed limit line is gone (the colour warns); a line marks **the trip's own
  average** (`⌀ 42 km/h`), so a section faster or slower than the rest stands out. Each arc has a faint **band for
  the speeds the minutes allow** — seconds are never typed, so a trip's first departure and a departure after a wait
  count from :00 and every other time can be anywhere in its minute; short sections get wide bands. Hovering an arc
  shows **just its km/h**; the status bar gives from–to, distance, minutes and the range. No tooltips on the arcs.
- **Switches on Linjer:** **Offentlig** and **Eksporteres** are switches on every row, saved at once (export settings,
  not edits of the line: only those two records of the file change, and no backup is made). Unsaved timetable edits
  stay unsaved and carry the new value. On a selected row, a switch sets every selected line. The dropdowns in
  Verktøy and the "Utkast" / "Lukket rute" tags are gone; a line not exported is still hatched.
- **Save / discard under the lists:** Linjer, Kalendere and Ressurser have a bar with **Save all in list** and
  **Discard changes in list**, for that list's own unsaved changes only.
- **Map layers:** a switch at the top right of the map: **Map** (OpenFreeMap, as before), **OpenStreetMap** (the
  standard map, darkened in dark mode) or **Aerial** (Esri imagery). Remembered in your personal settings; hidden when
  the project settings name a map style of their own.
- **Day offsets without +1 text:** a time on a later day than the day code is marked with a pale green band at the
  cell's right edge, 5 px wider for each day (+1 … +6); the note letters stay readable on it. The bar under the timetable
  says "2 days after the day code". **Time cells are narrower** (56 px, from 68), so more of a table fits on screen.
- **Interchanges as a chain:** a thin dashed line joins the source time to its target, from the empty space after the
  source's time to the space before the target's; the target is marked inside its cell (yellow: guaranteed, teal: stay
  seated).
- **Visual timetable (Marey chart):** **Alt+V** shows the open table as a chart in place of the timetable — the rows down
  the side (spaced by distance or evenly), time along the top, every trip a line through its times. A stop a trip passes
  is a straight dashed line to its next stop, with no marker; runs of trips with the same pattern share a coloured band, so the trips that differ
  stand out; interchanges and how long a trip waits are drawn. Day, week or month, with weekdays to highlight; click a
  trip to pick it out. Scroll to zoom in time, drag to move, double-click a trip to zoom to it. Alt+V again goes back.
- **An unnamed table set is red** (only a new line has one), like "No calendar".
- **+ and − step times a minute:** with times selected, **+** moves them a minute later and **−** a minute earlier, with a
  short flash (one colour each way); past midnight the day offset follows. Copy a time to the next row and press + a
  few times — a whole trip from copy/paste. + and − turn on the Tidsforskyver, and while it is on the cells stay
  editable (typing, paste, the cell menu), so the dial is for longer moves and + and − for single steps.

**Bug fixes**

- **Oversikt:** the Network section follows a change of language (it stayed in Norwegian).
- **Stops of the wrong mode are caught for every mode:** a cableway (or coach, funicular …) line was offered stops of
  any mode, and nothing warned — the filter used the old ERN code, which those modes lack. The search, the map and the
  export check now use the line's own mode, and a stop of another mode is an export error, as in Entur's validator.
- **Small fixes from the first look:** time cells never show "…" (a pipe cell and a cell being typed in did); the speed strip's average sits in the top right corner; the disabled tool's text follows
  the language.
- **The label, vehicle and trip-number rows** at the top of the timetable keep their bottom edge when the timetable
  scrolls.

## 2.4.0 — 2026-10-27

**Booking and request stops**

- **Request stop or booking on a time (the x):** select one or many times and press **F8** (or right-click → Request
  stop / booking…). One dialog: **None**, **Stops on request** or **Booking**, opening on what the time already has, so
  editing a booking is F8, change, Apply. x is never typed.
- **For a whole trip and for the line:** F8 on a day code (or right-click → Booking for the trip…), and the ☎ button at
  the end of the line's note. Each level is complete on its own; a new one starts as a copy of the level above.
- **The booking form goes top to bottom:** who can book, how (at least one way), the contact those ways need (a phone
  for calls and text messages, a web address for online), the deadline — **by a time** (when to book and the latest
  booking time) or **at least … before departure**, with **at most … before** above it — and a note. It checks one step
  at a time and Apply waits until the booking is right. Durations ("1 d 4 h") are set with a dial (Shift: hours) or
  typed. Only values Entur's validator accepts are offered.
- **a/p and x together** on one time. a and p only go on the stops in between: not on a trip's first or last stop.
- **Note letters:** a time's note and dates show as a letter beside it (b, c, d … skipping a, p and x), the same note the
  same letter, in place of the small triangle. The bar under the timetable shows the selected time's note, dates,
  boarding rule, request stop, booking and interchange wait in full; the timetable has no hover texts.
- **Copying carries everything:** Ctrl+C / Ctrl+V inside Nepos copies the whole cell. **Ctrl+Shift+V = paste special:**
  choose times, alighting/boarding, booking/request stop and/or note and dates (in the note row: note, dates, booking).
- In NeTEx: RequestStop and BookingArrangements on the stop point, FlexibleServiceProperties on the trip. The line's
  booking is written on every trip for now, until Entur says how a fixed line where every trip is booked is delivered.

**Power tools**

- **A toolbox at the bottom of the line panel** (Spesialverktøy / Power tools). Turning a tool on (Alt+J, Alt+I) changes
  what the mouse and keys do and locks the rest of the page (Save and Discard still work); Esc or ✕ turns it off.
- **Time shifter** (the jog, no longer on the right-click menu): a box above the calendar row with a dial that moves the
  selected times — drag down for later, Shift for ten minutes; its +N counts the current selection.
- **Virtual intervals:** drag a trip (or its day code) to the right to repeat it every 60, 30, 20, 15, 12 or 10 minutes,
  one more column per step, or further for every 6–1 minutes; drop at one step to type the interval and last
  departure. The table shows the first trip, one column per minute of the hour (`35`, `05`) with the first trip's marks,
  and the last trip, whose own dial moves the end by the interval. A block is at least an hour (two hours when hourly),
  follows its first trip in everything, is locked (also its destinations) and marked by a line in the day-code row;
  **Unpack block** turns it into ordinary columns. The export writes every trip in full. Copy at intervals stays for
  other intervals (40 minutes) and suggests the new tool when it fits.

**Checked before export, as Entur's validator (Antu) checks**

- Booking rules (deadline, contact for each way to book); times that go backwards and a/p that leaves a stop with no
  use are errors; problems say where they are and take you there.
- **Guaranteed interchanges wait up to 0–60 minutes** ("Waits up to…" on the right-click menu), exported as
  MaximumWaitTime; 0 or none is a warning.
- A warning when two trips run the same times at the same stops on a shared day (often a block over another column).
- Identical journey patterns are written once, also across table sets (seasons); the trips keep their IDs.

**The rest**

- **Oversikt, the project's first page:** what needs you today (lines ending within 30 days, lines with errors, lines
  changed since export), what is coming (Entur's 120 days, lines not exported for half a year, warnings), every line's
  validity against 30, 60, 90 and 120 days, and the network of all exported lines on one map. The tab right of Eksport,
  Alt+6. Exports are remembered (`data/exports.json`).
- **Problems grouped on the export page:** the same problem on many trips is one row with a count.
- **Delete several columns or rows at once:** select a run of day codes or stops (Shift+click or Shift+arrows), then the
  × on one of them, Delete, or right-click → Delete the selected columns / rows.
- **Save backups rotate:** `data/backups/` keeps the 10 newest backups of each line.
- **Right-click menus** regrouped; "Clear" is "Clear cell". Time cells keep one width, with the marks right after the time.
- **Help → Delivery to Entur:** where to upload, that the codespace must match, whom to ask when something is missing.
- **North up:** a compass button on the map; the map's buttons speak the app's language.
- The NeTEx files say "Created with Nepos 2.4.0".

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
