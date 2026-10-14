# ERN Format Specification

ERN is a Norwegian timetable data format developed in the early 1990s, used by NRI/WinConsult (formerly DGBuss/DataGrafikk) for public transport schedule editing and publishing. The format stores timetable data as literal table grids — rows are stops, columns are departures — mirroring printed timetables.

**Maintenance rule:** Nepos is the only remaining user of ERN, and this document is the format's
reference. Any change to the format is written here first; Nepos then implements what this
document says. Sections marked *Nepos* describe extensions and deviations from the original NRI
layout.

ERN uses semicolon-delimited `.txt` files where each line is prefixed by a `#XXX` record type code. Files are encoded in **Windows-1252** (single-byte, Norwegian characters ø æ å Ø Æ Å are not UTF-8).

**Source:** Official NRI format documentation v1.8 (nri_format_norsk_v1.8.txt), cross-checked against real ERN file R100.TXT.

---

## File Structure

An ERN file contains one or more `#RUT` blocks. Each block follows this hierarchy:

```
#RUT          ← Line definition
  #SEK        ← Operator(s)
  #TRA        ← Route variant (one or more per RUT)
    #KOR      ← Connections between periods (optional)
    #PER      ← Validity period (one or more per TRA)
      #KOM    ← Comments / footnote definitions (Bokmål)
      #KON    ← Comments (Nynorsk)
      #KOE    ← Comments (English)
      #KOT    ← Comments (German)
      #KOS    ← Special comments (time window, fare, change, stretch, capacity)
      #FRE    ← Frequency time limits (for frequency routes)
      #PMK    ← PageMaker layout data (NRI-internal, ignore)
      #TAB    ← Table header (1–2 per PER: outbound and/or return)
        #TUR  ← Column / departure definition
          #HKP ← Accessibility (handicap) info per departure
        #TUT  ← Text-column (free text column, not timetable data)
        #TRL  ← Row / stop definition
          #TRC ← Cell data (passing times)
        #TTL  ← Info row (free-text row, not timetable data)
          #TTC ← Info row cell
        #FOT  ← Footnote per column or cell
        #UNT  ← Date-based exceptions per column or cell
        #DAG  ← Public holidays / special days
        #MCT  ← Minimum connection time between trips
        #RIR  ← Route-in-route (cross-reference)
#DAG          ← Public holidays (can also appear at file level)
```

---

## Record Types

### #RUT — Rute (Line)

```
#RUT;internal_id;public_code;name;extra_name;transport_mode;priority;return_name
```

| Pos | Field | Example | Description |
|-----|-------|---------|-------------|
| 0 | Internal ID | `2477` | Numeric identifier (-1 if unavailable) |
| 1 | Public code | `45-100` | Published route number |
| 2 | Name | `Bodø Lufthavn - Fauske jb.st.` | Route name |
| 3 | Extra name | *(empty)* | Subtitle or area description |
| 4 | Transport mode | `1` | See transport mode table below |
| 5 | Priority | `0` | International=4, National=3, Regional=2, Local=1, 0=none |
| 6 | Return route name | *(empty)* | If different from outbound name; empty if same |

**Transport modes (pos 4):**

| Code | Mode |
|------|------|
| 1 | Bus |
| 2 | Tram |
| 3 | Rail |
| 4 | Airport (Flyplass) |
| 5 | Fast-boat (Hurtigbåt) |
| 6 | Ship (Skip) |
| 7 | Ferry (Ferge) |
| 8 | Metro (T-bane) |
| 9 | Helicopter |
| 10 | Intercity train |
| 11 | Airport rail link |
| 12 | Heritage/museum rail |
| 13 | Express bus |
| 14 | Shuttle bus |
| 15 | Airport bus |
| 16 | Replacement bus |
| 17 | Train bus (Togbuss) |
| 18 | Combi-boat (Kombibåt) |
| 19 | Taxi |

### #SEK — Selskap (Operator)

Multiple SEK records per RUT are possible (one for the operating company, one for the responsible authority).

```
#SEK;operator_id;name;responsibility;driver;percent;fare_flag;offset
```

| Pos | Field | Example | Description |
|-----|-------|---------|-------------|
| 0 | Operator ID | `291` | Numeric identifier (-1 if unavailable) |
| 1 | Name | `Nordland fylkeskommune` | Organisation name |
| 2 | Responsibility | `1` | Flag (0/1): has operational responsibility → **NeTEx Authority** |
| 3 | Driver | `1` | Flag (0/1): operates/drives the route → **NeTEx Operator** |
| 4 | Percent | `100` | Billing percentage |
| 5 | Fare flag | `0` | How fare should be applied |
| 6 | Offset | `-1` | Internal (observed in real files; not in v1.8 spec) |

### #TRA — Trasé (Route variant)

```
#TRA;local_route_number
```

| Pos | Field | Example | Description |
|-----|-------|---------|-------------|
| 0 | Local route number | `100` | Also called "Lokalt rutenummer". Can be empty |

### #PER — Periode (Validity period)

```
#PER;name;start1;end1;start2;end2;ref_date
```

| Pos | Field | Example | Description |
|-----|-------|---------|-------------|
| 0 | Name | `Periode 1` | Period name |
| 1 | Start date 1 | `20120622` | YYYYMMDD |
| 2 | End date 1 | `20121104` | YYYYMMDD |
| 3 | Start date 2 | `0` | Second range start (0 = none) |
| 4 | End date 2 | `0` | Second range end (0 = none) |
| 5 | Reference date | `20120905` | Date of last update |

### #KOM — Kommentar (Comments, Bokmål)

```
#KOM;text
```

Two uses:
- **Plain text**: General information displayed with the timetable.
- **Letter-prefixed**: Defines a footnote. E.g. `f. Sørlandsruta med korrespondanse i Lyngdal.` defines footnote letter "f".

An empty `#KOM;` is a blank separator line. Note: `#KOM` is also used in the stop file with a completely different meaning (Municipality record).

### #KON / #KOE / #KOT

Same structure as `#KOM` but for Nynorsk, English, and German respectively.

### #KOS — Spesiell kommentar (Special comment)

```
#KOS;type;text;language
```

| Pos | Field | Description |
|-----|-------|-------------|
| 0 | Type | 4=Change, 8=Time window, 16=Stretch, 32=Fare, 64=Capacity |
| 1 | Text | Comment text |
| 2 | Language | 0=Norwegian, 1=English |

### #FRE — Frekvenstid (Frequency time limits)

For frequency-based routes only. Defines time windows for day/evening/rush periods.

```
#FRE;day_from;day_to;evening_from;evening_to;rush1_from;rush1_to;rush2_from;rush2_to
```

All values are times in minutes.

---

## Table Records

### #TAB — Tabell (Table header)

```
#TAB;direction;km_header;zone_header;price_header
```

| Pos | Field | Example | Description |
|-----|-------|---------|-------------|
| 0 | Direction | `0` or `1` | 0 = Tur (outbound), 1 = Retur (return) |
| 1 | Km header | `Km` | Label for km column |
| 2 | Zone header | `Sone` | Label for zone column |
| 3 | Price header | `Kr` | Label for price column |

### #TUR — Tur (Column / Departure)

```
#TUR;column_index;day_code;on_demand;co2_per_km;comfort;replacement_mode
```

| Pos | Field | Example | Description |
|-----|-------|---------|-------------|
| 0 | Column index | `0`, `1`, `2`... | Sequential left to right |
| 1 | Day code | `DX67`, `S`, `6`, `135` | When this departure runs (see day codes) |
| 2 | On-demand | `0` | Flag (0/1): this is a demand-responsive route |
| 3 | CO2 per km | `0` | CO2 output per km |
| 4 | Comfort | `0` | Abstract comfort factor |
| 5 | Replacement mode | *(optional)* | Transport mode if this is a replacement service |

All fields beyond field 1 are typically `0` for standard timetables (confirmed in R100.TXT).

### #HKP — Handikap (Accessibility, per departure)

Follows a `#TUR` record. One record per accessibility attribute.

```
#HKP;id;type;door_width_category
```

| Pos | Field | Description |
|-----|-------|-------------|
| 0 | Internal ID | -1 if unavailable |
| 1 | Type | 0=Universal design, 1=No stairs, 2=Tactile marking, 3=Next-stop speaker, 4=Info board, 5=Wheelchair, 6=Door width |
| 2 | Door width category | Only for type 6: <70cm, <80cm, <90cm |

### #TUT — Tekst-tur (Text column)

A free-text column (not a departure). Used for headers, notes, etc.

```
#TUT;column_index;font_name;font_size;text
```

### #TRL — TurLinje (Row / Stop)

```
#TRL;row_index;stop_id;stop_name;typography;km;zone;price;flags;platform
```

| Pos | Field | Example | Description |
|-----|-------|---------|-------------|
| 0 | Row index | `0`, `1`, `2`... | Sequential top to bottom |
| 1 | Stop ID | `11268` | Numeric stop identifier (-1 if unavailable) |
| 2 | Stop name | `Bodø Lufthavn` | Display name |
| 3 | Typography | `0`, `2`, `10` | Bitmask (see below) |
| 4 | Km from start | `0.00` or `-1` | Distance (-1 = not specified) |
| 5 | Zone | `-1` | Zone reference (-1 = not specified) |
| 6 | Price | `-1` | Price in NOK (-1 = not specified) |
| 7 | Flags | `34` | Bitmask (see below) |
| 8 | Platform | `-1` | Platform info (-1 if unavailable) |

**Typography bitmask (pos 3):**

| Bit | Meaning |
|-----|---------|
| 0 | Italic |
| 1 | Bold (halvfet) |
| 2 | Strikethrough |
| 3 | Underline |

**Flags bitmask (pos 7):**

| Bit | Meaning |
|-----|---------|
| 0 | Route variant separator (trasé-skille) in multi-variant routes |
| 8 | Direction change marker in round-trip routes (first stop on new direction) |
| 9 | Split stop — converter should generate 2 abstract stops (A–B–C → A–B'B''–C) |
| others | NRI-internal use |

Value `34` (bits 1+5) observed consistently in R100.TXT — these are NRI-internal bits.

A stop appearing **twice consecutively** (same stop ID, two TRL rows) represents a dwell/pause — arrival row followed by departure row. Confirmed in R100.TXT (stop 6650 Bodø sentrumsterminal appears at TRL;1 and TRL;2).

### #TRC — TurCelle (Cell / Passing time)

```
#TRC;column_index;time_value;day_offset;hour_offset;delta_x;delta_y;mask
```

| Pos | Field | Example | Description |
|-----|-------|---------|-------------|
| 0 | Column index | `6` | References a #TUR column |
| 1 | Time value | `0745` | HHMM format, or `\|` for pass-through |
| 2 | Day offset | `0` | Days elapsed since departure start (0=same day, 1=next day) |
| 3 | Hour offset | `0` | Hours offset (used for minute-based routes only) |
| 4 | Delta X | `0` | Internal interchange reference (X direction) |
| 5 | Delta Y | `0` | Internal interchange reference (Y direction) |
| 6 | Mask | `0` | Status bitmask (see below) |

**Mask bitmask (pos 6):**

| Bit | Meaning |
|-----|---------|
| 0 | Alight only (avstigningsbegrensning) — displayed as suffix `a` |
| 1 | Board only (påstigningsbegrensning) — displayed as suffix `p` |
| 2 | Minute-time cell |
| 3 | Frequency cell (rush period 1) |
| 4 | Frequency cell (rush period 2) |
| 5 | Frequency cell (daytime) |
| 6 | Frequency cell (evening) |
| 7 | `-` sign: stops but time unknown |
| 8 | `x` sign: request stop (stopper ved behov) |
| 9 | Calculated time (not provided by operator) |

**Missing TRC entries**: no TRC for a column at a given row means the departure does not serve this stop. Visual rendering:
- Before first served stop in column: `...`
- After last served stop in column: `...`
- Between two served stops: `|` (passes through)

The pipe value `|` in field 1 is an explicit pass-through marker.

### #TTL — TabellTekstLinje (Info row)

Free-text information row inserted into the table (connecting services, day markers, train numbers, etc.).

```
#TTL;row_index;typography;font_name;font_size;label;flags
```

| Pos | Field | Description |
|-----|-------|-------------|
| 0 | Row index | Position in table row sequence |
| 1 | Typography | Same bitmask as TRL field 3 |
| 2 | Font name | e.g. `NRI/WinConsult 8` |
| 3 | Font size | Default 10 |
| 4 | Label | Display text for row header |
| 5 | Flags | Reserved for future use; set to 0 |

### #TTC — TabellTekstCelle (Info row cell)

```
#TTC;column_index;font_name;font_size;value;flags
```

| Pos | Field | Description |
|-----|-------|-------------|
| 0 | Column index | References a #TUR column |
| 1 | Font name | e.g. `NRI/WinConsult 8` |
| 2 | Font size | Default 10 |
| 3 | Value | Cell content: time+footnote (`0905f`), train number, day number, `\|` |
| 4 | Flags | Bitmask: bit0=italic, bit1=bold, bit2=strikethrough, bit3=underline, bit4=flight number, bit5=flight type, bit6=train number, bit7=trip number |

---

## Supplementary Records

### #FOT — Fotnote (Footnote)

Can belong to a cell (TRC) or a column (TUR).

```
#FOT;column_index;row_index;text;language
```

| Pos | Field | Example | Description |
|-----|-------|---------|-------------|
| 0 | Column index | `1` | References a #TUR column |
| 1 | Row index | `2` | References a #TRL row; `-1` = column-level footnote (TUR) |
| 2 | Text | `Via Hamrebakkene.` | Footnote text |
| 3 | Language | `0` | 0=Norwegian, 1=English |

### #UNT — Unntak (Exception)

Date-based exception for a column or cell. Can belong to a TRC or a TUR (row_index = -1).

```
#UNT;column_index;row_index;from_date;from_pmu;to_date;to_pmu;day_mask;deviation_minutes;name
```

| Pos | Field | Description |
|-----|-------|-------------|
| 0 | Column index | References a #TUR column |
| 1 | Row index | References a #TRL row; `-1` = applies to whole TUR column |
| 2 | From date | YYYYMMDD |
| 3 | From PMU | Period mask (see below) |
| 4 | To date | YYYYMMDD |
| 5 | To PMU | Period mask (see below) |
| 6 | Day mask | Day bitmask (see below) |
| 7 | Deviation | Deviation from normal time in minutes |
| 8 | Name | Holiday/exception name |

**Period mask (PMU):**

| Bit | Meaning |
|-----|---------|
| 15 | Period is open-ended (either from–... or ...–to) |
| 14 | Period is NOT operated |
| 13 | Period IS operated |
| 3 | Holiday period |
| 2 | Boundary is approximate: ultimo |
| 1 | Boundary is approximate: medio |
| 0 | Boundary is approximate: primo |

**Day mask:**

| Bit | Meaning |
|-----|---------|
| 14 | Day NOT operated |
| 13 | Day IS operated |
| 12 | Adjacent day is a weekday |
| 11 | Adjacent day is a holiday |
| 10 | This day is the day AFTER a holiday/weekday |
| 9 | This day is the day BEFORE a holiday/weekday |
| 8 | School day |
| 7 | Holiday (helligdag) |
| 6 | Sunday |
| 5 | Saturday |
| 4 | Friday |
| 3 | Thursday |
| 2 | Wednesday |
| 1 | Tuesday |
| 0 | Monday |

### #DAG — Dag (Public holiday / special day)

```
#DAG;from_date;to_date;day;flag;description
```

| Pos | Field | Example | Description |
|-----|-------|---------|-------------|
| 1 | From date | `20020101` | YYYYMMDD |
| 2 | To date | *(empty)* | YYYYMMDD, empty if single day |
| 3 | Day | `0` | Day number |
| 4 | Flag | `1` | Status flag |
| 5 | Description | `1. Nyttårsdag` | Name of the holiday |

### #KOR — Korrespondanse (Connection between routes)

```
#KOR;stop_id;stop_name;route_id;route_number;return_stop_id;return_stop_name
```

Links two routes/periods that have guaranteed connections.

### #MCT — Minimum Connection Time

Minimum transfer time between two trips at a stop.

```
#MCT;stop_id;stop_name;column_x;connected_route_id;connected_route_number;connected_tra;connected_per;connected_direction;connected_column_x;mct_minutes
```

### #RIR — Rute i Rute (Route in route)

Cross-reference embedding one table's data within another.

---

## Day Codes

Day codes appear in `#TUR` field 1.

| Pattern | Example | Meaning |
|---------|---------|---------|
| `D` | `D` | Daily (all 7 days) |
| `DX` + digits | `DX67` | Daily except listed days (6=Sat, 7=Sun → weekdays only) |
| `S` | `S` | School days |
| `H` | `H` | Holidays (helligdager) |
| Single digit | `6` | One specific day (Saturday) |
| Combined digits | `135` | Multiple specific days (Mon+Wed+Fri) |

**Weekday numbering:** 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat, 7=Sun

**DX reversal rule:** When more than 3 days would be excepted, the code uses positive form instead. E.g. `567` (Fri+Sat+Sun) rather than `DX1234`.

---

## Stop File Records

Stops are stored in a separate file. Records are exported one type at a time (all FYL first, then all KOM, etc.).

### #FYL — Fylke (County)
```
#FYL;county_number;county_name;county_code
```

### #KOM — Kommune (Municipality)
Note: same code as timetable comments but different context.
```
#KOM;municipality_number;municipality_name;municipality_code
```

### #REG — Region
```
#REG;region_number;county_number;region_name;region_code
```

### #STE — Sted (Place/Area)
```
#STE;place_id;municipality_number;region_number;postal_code;place_name;timezone
```

### #HPL — Holdeplass (Stop)

```
#HPL;national_id;place_id;name;short_name;x;y;flags;local_number;stop_type;description
```

| Pos | Field | Example | Description |
|-----|-------|---------|-------------|
| 0 | National ID | `761000237` | Unique stop identifier (-1 if unavailable) |
| 1 | Place ID | `760000031` | Parent STE reference |
| 2 | Name | `Asak kirke` | Stop name |
| 3 | Short name | *(empty)* | Abbreviated name |
| 4 | X coordinate | `11,454446` | Longitude, decimal degrees (European comma notation) |
| 5 | Y coordinate | `59,142779` | Latitude, decimal degrees (European comma notation) |
| 6 | Flags | `0` | Interchange priority: 4=International, 3=National, 2=Regional, 1=Local, 0=none |
| 7 | Local number | `01016626` | Local stop register reference (optional) |
| 8 | Stop type | `1` | -1=Abstract, 0=Multi-modal, 1=Bus, 2=Rail, 3=Metro, 4=Tram, 5=Airport, 6=Ferry, 7=Taxi, 8=Address |
| 9 | Description | *(empty)* | Street or location description (optional) |

Stops with coordinates `0;0` have no valid position data.

### #STP — Stoppunkt (Stop point / Platform)

```
#STP;national_id;stop_id;name;locality;direction;x;y;local_number;description
```

**Locality values:** 1=Bus platform, 2=Rail platform, 3=Metro platform, 4=Tram platform, 5=Airport gate, 6=Ferry quay, 7=Taxi, 8=Address, 9=Street, 10=Position, 11=Parking, -1=Undefined

**Direction values:** 1=ToCity, 2=FromCity, 3=South, 4=West, 5=North, 6=East, -1=Undefined

**Note on stop IDs:** The short numeric IDs used in timetable `#TRL` records (e.g. `11268`) are **not** the same as the long-form national IDs in the stop file (e.g. `761xxxxxx`). A separate mapping is required.

### #GAN — Gangavstand (Walking distance)

Transfer link between two stops.

```
#GAN;from_stop_id;from_name;to_stop_id;to_name;minutes;meters;type;importance
```

**Type:** 0=Walking, 1=Driving distance

### #ALI — Alias (Alternative stop name)

```
#ALI;stop_id;alias_count;alias1;alias2;...
```

---

## Visual Rendering Rules

| Cell state | Display | Meaning |
|------------|---------|---------|
| TRC with HHMM | `07:45` | Stops here at this time |
| TRC mask bit 8 | `07:45x` | Request stop. The symbol is red. |
| TRC mask bit 0 | `07:45a` | Alight only. The symbol is red. |
| TRC mask bit 1 | `07:45p` | Board only. The symbol is red. |
| TRC mask bit 7 | `–` | Stops but time unknown |
| TRC value `\|` | `\|` | Passes through without stopping. The symbol is red. |
| No TRC, before first stop | `...` | Departure not yet started |
| No TRC, after last stop | `...` | Departure already ended |
| No TRC, between stops | `\|` | Passes through. The symbol is red. |

Double-listed stops (same stop ID, consecutive TRL rows) = dwell/pause. A separator line is drawn between the two rows.

---

## Verified Example (from R100.TXT)

```
#RUT;2477;45-100;Bodø Lufthavn - Fauske jb.st.;;1;0
#SEK;291;Nordland fylkeskommune;1;1;100;-1
#TRA;100
#PER;Periode 1;20120622;20121104;0;0;20120905
#TAB;0;Km;Sone;Kr
#TUR;0;DX67;0;0;0
#TUR;1;DX67;0;0;0
...
#TRL;0;11268;Bodø Lufthavn;2;0.00;-1;-1;34;-1
#TRC;0;0705;0;0;0;0;0
#TRC;1;0950;0;0;0;0;0
...
#TRL;1;6650;Bodø sentrumsterminal;0;2.00;-1;-1;34;-1   ← arrival
#TRL;2;6650;Bodø sentrumsterminal;0;2.00;-1;-1;34;-1   ← departure (dwell)
...
#TAB;1;Km;Sone;Kr    ← return table follows
```

Key observations from R100.TXT:
- `#SEK` has 7 fields (the 7th, offset=-1, is not in the v1.8 spec but appears in practice)
- `#TUR` fields 2–4 are `0;0;0` for standard routes (no on-demand, no CO2, no comfort data)
- `#TRL` flag value `34` (bits 1+5) is NRI-internal and appears consistently
- `#TRL` typography `2` = bold on first/key stops; `10` = bold+underline on certain return stops
- All `#TRC` mask values are `0` in this file (no request stops, no alight/board restrictions)
- File encoding is Windows-1252 (not UTF-8)

---

## Nepos Conventions and Deviations

Nepos reads and writes the records above with the following extensions and known deviations.

**Rule for Nepos additions (Nepos 2).** Nepos never reuses or extends an ERN field for another
purpose. Where ERN defines a field, Nepos uses it exactly as defined. Information ERN has no field
for gets a **new record**, documented here together with its NeTEx mapping.

### #RUT fields 0 and 1 — private and public code *Nepos 2*

Used as ERN defines them: field 0 is the line's private code (NeTEx `PrivateCode`; `-1` = none)
and field 1 its public code (NeTEx `PublicCode`; empty = none — many lines, e.g. boats, have no
line number). Field 4 keeps the nearest ERN mode code for the Transmodel mode in `#MOD` (`0` when
the mode has no ERN code), so the file stays readable as ERN.

### #MOD — transport mode *Nepos 2*

```
#MOD;mode;submode
```

Directly after `#RUT`. Transmodel values as Entur accepts them, e.g. `#MOD;bus;expressBus`;
`submode` is empty when not specified. NeTEx: `TransportMode` and `TransportSubmode` on the Line.
A file without `#MOD` gets the mode from `#RUT` field 4.

### #BRA — branding *Nepos 2*

```
#BRA;branding id
```

After `#MOD`, only when the line has a branding (its commonly used name, e.g. "Sørlandsekspressen").
The ID refers to `data/brandings.json`. NeTEx: `BrandingRef` on the Line, and the `Branding` in the
shared file's `ResourceFrame/typesOfValue`.

### #UID — stable ID *Nepos 2*

```
#UID;uuid
```

Gives the record directly before it a stable ID that never changes and carries no data. After a
`#TUR` it is the column's ID, and the NeTEx `ServiceJourney` ID is `<codespace>:ServiceJourney:<uuid>`.
A column without a valid, unique `#UID` gets a new UUID when the file is saved.

### #TRA — table set *Nepos 2*

```
#TRA;table set name
#UID;uuid
```

A route holds any number of table sets: master patterns the user navigates between, such as
"Bergen–Oslo", "Oslo–Bergen" or "Oslo–Bergen–Kristiansand–Oslo". The single ERN field holds the
name; `#UID` follows with the table set's stable ID. NeTEx: one `Route` per table set (Name = the
table set's name, ID from its UUID). JourneyPatterns are worked out from the trips: one per distinct
stop sequence in the table set, named `<table set name>-1`, `-2` … There is no fixed Tur/Retur
pair and no DirectionType.

### #PER and #KAL — period and calendars *Nepos 2*

```
#PER;;;;;;
#KAL;calendar id
#KAL;calendar id
#TAB;0;;;;
```

A period belongs to the `#TRA` above it. Nepos writes `#PER` with no name and no dates and ignores
them on read: the period's operating days are the union of the calendars named by the `#KAL`
records directly after it (calendars live in `data/calendars.json`; a range `[from, to]` includes
both days). Each period has exactly one `#TAB`, written `#TAB;0;;;;`; a second `#TAB` in the same
period, or a return table (`#TAB;1`), is reported as damaged by the integrity check.

### Day codes and operating days *Nepos 2*

A column's operating days are its period's days filtered by its day code. Allowed: `D`, `DX` with
1–3 weekday digits, 1–4 weekday digits, and the holiday forms `H` (Norwegian public holidays only),
`DXH` and `DX…H` (holidays excluded). Holidays are calculated (fixed dates and the Easter-based
days). `S` (school days) is not allowed. A trip after midnight (`+1`) belongs to the operating day
it starts on.

NeTEx: each trip is a `ServiceJourney` without day types, plus one `DatedServiceJourney` per
operating day (`ServiceJourneyRef` + `OperatingDayRef`), with derived UUID v5 IDs. The shared file's
`ServiceCalendarFrame` holds only `OperatingDay`s (`<cs>:OperatingDay:YYYY-MM-DD`). No `DayType`,
`DayTypeAssignment` or `OperatingPeriod` is written. Footnote date exceptions (`#UNT`) are kept in
the file but not exported.

### #LEV — Leveranse (Delivery) *Nepos*

Always the first record in a Nepos file.

```
#LEV;name;codespace
```

| Pos | Field | Description |
|-----|-------|-------------|
| 0 | Name | Project / delivery name |
| 1 | Codespace | NeTEx codespace, used as the prefix of every NeTEx ID |

Files written by Nepos 1.x have two more fields (creator name, creator email). Readers ignore
any fields after position 1; Nepos 2 no longer writes them.

### #CUR — Currency *Nepos*

```
#CUR;currency_id;rate
```

The currency the route's stop prices are expressed in. Prices are hidden in Nepos 2 but this
record and the `#TRL` price field are read and written back unchanged.

### #SEK field 0 — organisation ID *Nepos 2*

From Nepos 2, field 0 holds the organisation's ID as text, normally a full NeTEx ID such as
`RUT:Authority:1` or `INN:Operator:62`. The middle part of the ID gives the role, and Nepos
writes fields 2 (Responsibility) and 3 (Driver) to match it: `1;0` for an Authority, `0;1` for an
Operator. On read, the ID wins over the flags. For an ID without that form (older data), the
flags decide the role. `-1` or an empty field means "no organisation".

### #TUR field 6 — vehicle reference *Nepos 1.x only*

Nepos 1.x wrote a seventh `#TUR` field holding a vehicle reference. Nepos 2 ignores it on read
and no longer writes it.

### #TRL field layout *Nepos deviation*

Nepos writes the `#TRL` fields after the name in different positions from the NRI layout above:

| Pos | NRI meaning | What Nepos writes |
|-----|-------------|-------------------|
| 3 | Typography | always `34` |
| 4 | Km | Nepos display flags: bit 0 = bold, bit 1 = row separator line |
| 5 | Zone | Price (`-1` = none, otherwise a decimal with six places, e.g. `12.500000`) |
| 6 | Price | always `-1` |
| 7 | Flags | always `34` |
| 8 | Platform | always `-1` |

A file from another ERN source that uses the km or zone fields would be misread. Moving Nepos to
the NRI positions is a planned, not yet decided, change.

### #TRL stop ID *Nepos 2*

From Nepos 2 the stop ID field (pos 1) holds an NSR Quay ID such as `NSR:Quay:12345`, stored as
text. `:` is safe because the field delimiter is `;`.

### #TRC mask *Nepos*

| Value | Meaning in Nepos |
|-------|------------------|
| `1` (bit 0) | Alight only — suffix `a` (as NRI) |
| `2` (bit 1) | Board only — suffix `p` (as NRI) |
| `8` (bit 3) | Request stop — suffix `x`. *Deviation:* NRI defines request stop as bit 8 (value `256`) and bit 3 as a frequency cell. |
| `1024` (bit 10) | Guaranteed interchange *(extension)* |
| `2048` (bit 11) | Stay-seated interchange *(extension)* |

For bits 10 and 11, fields 4 and 5 (delta X / delta Y) give the target cell as a column and row
offset relative to this cell, within the same `#TAB`.

### #UNT period mask as used by Nepos

Nepos writes the same value in both PMU fields: `8192` (bit 13, "runs only" in this period) or
`16384` (bit 14, "does not run" in this period). A runs-only exception whose from and to dates
are equal is exported to NeTEx as a specific operating date.

---

## Norwegian Record Names

The record codes come from Norwegian words:

| Code | Norwegian | English |
|------|-----------|---------|
| LEV | Leveranse | Delivery |
| RUT | Rute | Route / line |
| SEK | Selskap | Company / organisation |
| TRA | Trasé | Route variant |
| KOR | Korrespondanse | Connection |
| PER | Periode | Period |
| KOM | Kommentar | Comment |
| KOS | Spesiell kommentar | Special comment |
| FRE | Frekvens | Frequency |
| TAB | Tabell | Table |
| TUR | Tur | Trip / departure (column) |
| HKP | Handikap | Accessibility |
| TUT | Tekst-tur | Text column |
| TRL | Tur-linje | Table row (stop) |
| TRC | Tur-rutecelle | Timetable cell |
| TTL | Tekst-linje | Text row |
| TTC | Tekstcelle | Text cell |
| FOT | Fotnote | Footnote |
| UNT | Unntak | Exception |
| DAG | Dag | Special day / holiday |
| MCT | Minste overgangstid | Minimum connection time |
| MOD | Modus | Transport mode (Nepos 2) |
| BRA | Branding | Branding (Nepos 2) |
| UID | Unik ID | Stable ID (Nepos 2) |
| KAL | Kalender | Calendar reference (Nepos 2) |
| RIR | Rute i rute | Route in route |
| FYL | Fylke | County |
| REG | Region | Region |
| STE | Sted | Place |
| HPL | Holdeplass | Stop |
| STP | Stoppunkt | Stop point / platform |
| GAN | Gangavstand | Walking distance |
| ALI | Alias | Alias |

---

*Based on the NRI ERN import/export format v1.8 (Norsk Reiseinformasjon AS, 2013). Maintained as part of Nepos; this document is the reference Nepos implements.*
