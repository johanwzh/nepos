# Changelog

Newest first. Version rule: fixes and tweaks x.x.+1, new features x.+1.0, major or breaking changes +1.0.0.

## 2.6.1 — not released yet

**New features**

- **Routing:** **Ruting** (Alt+L, bus lines) is a view of its own in place of the timetable: the line's journey
  patterns as small pictures framed red (not routed), orange (to check: a stop moved in NSR, newer map data, another
  stop on a row) or green; the selected pattern's stops beside a large map with the stops' names; and an info pane
  for the table set, the pattern and the selected leg. The stop list shows every row of the table, each stop numbered
  as on the map and a passed one with **|**; each picture counts the pattern's trips; a legend explains the colours. Nothing routes and no saved distance changes without you:
  **Route** makes a proposal, drawn over the old route with the change in km and minutes; add or drag waypoints on a
  leg; **Accept** saves it in `data/links/<line>.json`, and **Keep** marks an orange pattern checked without changing a
  metre. At the bottom right, **Discard** drops the proposal, **Apply** accepts it, saves and closes, and **Close** leaves.
  The info pane shows the map data being fetched in a new area. An **Automatic routing** setting (View menu) adds **Update all**. The map data
  comes from Nepos's own road tiles (nepos-tiles, rebuilt monthly) and is kept in the project's `cache/`, so routing
  works offline where it has run before. A link no trip uses any more is not exported but kept until you remove it
  (**Remove unused**), so fixing a typo in the timetable brings the same route back.
- **Speed strip:** on a bus line a routed leg is measured along the road (the status bar says "langs veien" or
  "luftlinje"); the colours still follow the straight line, as the speed limits and the export check do.
- **Map:** on a bus line the selected trip's legs have Ruting's colours: along the routed road, orange where a stop has
  moved, red dashed where there is no route, and a stop on a leg without a route is a red dot. While you pick a stop,
  a note says how close to zoom before stops (and then their platforms) show.
- **Overview:** the network follows the routed roads, and shows only the main stops (bold in a timetable), as small dots.
- **Stops and modes:** every road vehicle (bus, coach, taxi) may use the road stops, and a car ferry any ferry or boat
  quay (and the other way round); other modes use their own stops.
- **Export:** each pattern whose legs are all routed gets its ServiceLinks (per line); legs not routed or out of date
  (a stop moved more than 5 m) are a warning in the check, never an error. The old routing (off since 2.3) is removed.
- **Lines:** a Ruting column shows how many of each bus line's journey patterns are routed, and how many to check.
- **Tabs:** **Oppgaver** (Tasks, Alt+1) is a tab of its own, the first one and where a project opens: what needs you
  today, as Oversikt's to-do part was. The other tabs move one up (Rediger rutetabell Alt+2 … Eksport Alt+6), and
  Oversikt is now **Analyse** (Alt+7) with two sub-tabs, **Statistikk** and **Nettverkskart**.
- **Analyse → Statistikk:** the plan's numbers as a receipt, for
  the whole project, an authority or an operator (a tree on the left). Scope per mode (lines, trips, departures,
  stops), the routed network per routing group, production planned / done / remaining with average speed, per fuel
  (km, hours, seat-km), accessibility (low floor by km, booking by departures, each its own bar), per day type, vehicles on the road at once (per 15 minutes) and
  production through the period. km counts only where every stretch is routed; missing data is a grey "Ukjent" row in
  the sum, never a warning. Pick a period, or everything planned. **Download as Excel** saves
  `analyse/<time> <name>.xlsx` in the project; **Copy as plain text** puts the figures on the clipboard.
- **Analyse → Nettverkskart:** the network for the level picked on Statistikk, with the trips moving on it at a date and time (a jog and a slider in 10-second steps, ▶ at a
  plan-minute per 0.6 s, ×5 or ×20 faster): a dot per trip gliding along the road, a ring while it waits. Switch back to Statistikk at any time; there is
  nothing to close.
- **Routing for every mode:** rail, tram, metro, boats and ferries, cableways, funiculars and lifts are routed along
  OpenStreetMap like buses (air is not): each network is its own map data set from nepos-tiles, cached in
  `cache/routing/<set>/`. Trains, trams and cableways never turn sharply at a switch; a ferry quay may lie further from
  the route (up to 500 m, flagged past 170 m). Ruting, Linjer's Ruting column, the map, the speed strip, Analyse's km
  and the export's ServiceLinks treat these lines as they treat bus lines. The routing address in the settings is now
  the nepos-tiles root (an old `…/road/` address still works).
- **Knutepunkt** (Alt+K, interchanges between lines): our trips can wait at a stop for a feeder from another line in the
  project. The tool takes over the timetable like Ruting: every stop of the table set with a switch; for a stop that is
  on, **what we wait for** (the stops for the transfer or a radius, a window before our departure, the maximum wait,
  the walk, and the feeder's authority, operator, mode, line number and earlier stops); a **timeline** at the stop
  where you pick our trips and see the feeders arrive; and **Forslag**, a proposal per trip (ny, uendret, endret,
  borte, velg én, ingen treff) that you approve with **Godkjenn**. Only approved links are exported, as guaranteed
  interchanges (our trip waits; the feeder never does). The hubs are saved in the line file (`#KNP`, `#KNL`); a
  trip in the timetable with an approved link has a small ⇄. The export check warns when a link has changed, the
  feeder's line is not exported, or the hub's stop has changed. Between lines of the same project only, for now.

**Bug fixes**

- **Routing a boat out and back** (A–B–A on the same quays): the boat had to leave a quay the way it came in, as a
  bus must, and went far round to turn. A boat now turns at the quay.
- **Routing a new area:** after the map data was downloaded, Nepos wrote every tile into the project's `cache/`
  and read it back before routing began, which took minutes in a OneDrive folder. It now routes from the downloaded
  data at once and fills the cache in the background; the info pane says "Routing…" once the download is done.
  Each Route fetches only the map data its own pattern needs (a short branch fetched the whole line's), and map data
  fetched once is kept while the page is open.
- **Registrer stopp:** the map was dimmed and locked like the rest of the page while the tool was on; it stays usable now.

## 2.5.1 — 2026-10-30

**Bug fixes**

- **The trip-number row's caption** lines up with Label and Vehicle above it.
- **Booking deadlines that contradict each other are caught:** "at most before" must be longer than "at least before"; the
  form marks both and holds Apply, and the export check reports it.

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
