# ERN import/export format

Version 2.0

## The file

A route is exported as many lines. The order in which the record types are described here is also the order in which they are written. The first field of a line says which record type the line is. Fields are separated by semicolons (`;`); a field never contains a semicolon or a line break. The text encoding is Windows-1252.

ERN keeps three kinds of data, each in its own files: **routes** (one file per route), **places** (stops and the areas they belong to) and **companies**.

A record or field marked **deprecated** is still part of the format, and files that use it are still valid. A record or field is deprecated when its information has moved to another place in the format, or when it only made sense for a use that no longer exists.

## Route information

### #LEV

Delivery record. Groups routes into a single delivery package. The first record in a route file; one per file.

| Field | Type | Description |
|---|---|---|
| 0 | text | Name of the delivery (the project). |
| 1 | text | Codespace: three letters A–Z. Every NeTEx ID made from the file starts with it. |

### #RUT

Route record. Holds the route heading. One per route.

| Field | Type | Description |
|---|---|---|
| 0 | text | Private code: the route's internal code. `-1` if none. |
| 1 | text | Route number: the line number shown to passengers (N54). Empty if none. |
| 2 | text | Route name. |
| 3 | text | Extra name. Deprecated and replaced by `#MRK`. |
| 4 | int | Transport type, from the table below. Deprecated and replaced by the Transmodel-based `#TRM`. |
| 5 | int | Priority: International = `4`, National = `3`, Regional = `2`, Local = `1`, `0` = no priority. Deprecated: the Transmodel mode and submode in `#TRM` say this. |
| 6 | text | Return name. Empty if the return name is the same as the route name. |

The original ERN transport types (field 4), for classic ERN datasets; Nepos 2 uses `#TRM`:

| Code | Type | Code | Type |
|---|---|---|---|
| 1 | Bus | 11 | Airport train |
| 2 | Tram | 12 | Heritage railway |
| 3 | Train | 13 | Express bus |
| 4 | Airport | 14 | Shuttle bus |
| 5 | Express boat | 15 | Airport bus |
| 6 | Ship | 16 | Replacement bus |
| 7 | Ferry | 17 | Train bus |
| 8 | Metro | 18 | Combi boat |
| 9 | Helicopter | 19 | Taxi |
| 10 | Intercity train | | |

### #TRM

Transport mode record. The route's mode as Transmodel (NeTEx) values. One per route, after `#RUT`.

| Field | Type | Description |
|---|---|---|
| 0 | text | Transport mode (`bus`, `coach`, `rail`, `water`, …). |
| 1 | text | Transport submode (`expressBus`, `regionalRail`, …). Empty if none. |

A file without `#TRM` takes the mode from `#RUT` field 4.

### #MRK

Brand record. The name the route is known by (Valdresekspressen). At most one per route, after `#TRM`.

| Field | Type | Description |
|---|---|---|
| 0 | text | ID of the brand (a NeTEx Branding ID). |

### #EKS

Export record. Marks whether the route is to be included in or excluded from exports. One per route, after `#MRK`.

| Field | Type | Description |
|---|---|---|
| 0 | int | `1` = exported, `0` = not exported. |

A file without `#EKS` means `1`.

### #OFF

Public record. Whether the route is for public release. One per route, after `#EKS`.

| Field | Type | Description |
|---|---|---|
| 0 | int | `1` = public, `0` = delivered, but not for public release. |

A file without `#OFF` means `1`.

### #AVG

Departure–arrival record. Departure and arrival times at stops; one per stop. Deprecated: times are kept in the tables (`#TRC`).

| Field | Type | Description |
|---|---|---|
| 0 | text | Stop ID. `-1` if none. |
| 1 | text | Name of the stop. |
| 2 | int | Departure time in minutes. |
| 3 | int | Arrival time in minutes. |

### #SEK

Company record. The organisations responsible for the route and running it; one record per organisation, one after the other.

| Field | Type | Description |
|---|---|---|
| 0 | text | Organisation ID: a NeTEx ID (`RUT:Authority:1`, `INN:Operator:62`). `-1` if none. |
| 1 | text | Organisation name. May be empty when field 0 is given. |
| 2 | int | Responsible: flag (`0`/`1`), `1` = the organisation is responsible for the route (NeTEx Authority). |
| 3 | int | Operates: flag (`0`/`1`), `1` = the organisation runs the route (NeTEx Operator). |
| 4 | int | Percentage for invoicing. Deprecated. |
| 5 | int | Fare flag. Deprecated. |

When field 0 is a NeTEx ID, its middle part (`Authority`, `Operator`) gives the role, and fields 2 and 3 agree with it.

### #VAL

Currency record. The currency of the prices in `#TRL`. Kept for older datasets with prices. At most one per route, after the `#SEK` records. Without it, prices are in NOK.

| Field | Type | Description |
|---|---|---|
| 0 | text | Currency code (`NOK`, `EUR`, …). |
| 1 | decimal | Exchange rate against the dataset's base currency. |

### #DSS

Destination sign record. What the vehicle's own display shows (front and side). One per sign, defined once per route file and used by `#DSK` in any table.

| Field | Type | Description |
|---|---|---|
| 0 | text | ID of the sign. |
| 1 | text | Front text. |
| 2 | text | Side text. |
| 3 … | text | Via: the IDs of other `#DSS` records, in order. Any number. |

A via may not point to the record itself, directly or through other vias.

### #DST

Destination record. The destination a journey planner shows ("Line 1 towards Oslo"). It need not be a stop name. One per destination and language, defined once per route file and used by `#DSK` in any table; the records of one destination share its ID.

| Field | Type | Description |
|---|---|---|
| 0 | text | ID of the destination. |
| 1 | text | Destination text. |
| 2 | text | Language, as a three-letter ISO 639 code. Empty means `nob`. |
| 3 … | text | Via: the IDs of other `#DST` records, in order. Any number. |

A via may not point to the record itself, directly or through other vias.

The sign and the destination are kept apart on purpose: what a vehicle shows ("EKSPRESSEN") is not always what a traveller should be told it goes to.

### #TRA

Route pattern record. One per route pattern: a named set of tables, such as Bergen–Oslo and Oslo–Bergen.

| Field | Type | Description |
|---|---|---|
| 0 | text | Name of the route pattern. |

### #UID

Stable ID record. Gives the record directly before it (`#TRA` or `#TUR`) an ID that never changes and carries no data.

| Field | Type | Description |
|---|---|---|
| 0 | text | A UUID. |

### #KOR

Connection record. Links the periods of two routes that connect. One per link. Deprecated: advertised connections were for print; journey planners find connections themselves.

| Field | Type | Description |
|---|---|---|
| 0 | text | Stop ID of the connection. `-1` if none. |
| 1 | text | Name of the stop. |
| 2 | text | Route ID of the connecting route. `-1` if none. |
| 3 | text | Route number. |
| 4 | text | Stop ID for the connecting route's direction. `-1` if none. |
| 5 | text | Name of the stop. |

### #PER

Period record. One per period; a period belongs to the `#TRA` above it.

| Field | Type | Description |
|---|---|---|
| 0 | text | Name of the period. |
| 1 | text | From date of validity interval 1, as YYYYMMDD. |
| 2 | text | To date of validity interval 1, as YYYYMMDD. |
| 3 | text | From date of validity interval 2, as YYYYMMDD. |
| 4 | text | To date of validity interval 2, as YYYYMMDD. |
| 5 | text | Date the period was last updated, as YYYYMMDD. |

When `#KAL` records follow, they give the period's days, and fields 0–5 may be empty.

### #KAL

Calendar record. A calendar the period runs on. One per calendar, directly after its `#PER`; the period's days are the days of all its calendars.

| Field | Type | Description |
|---|---|---|
| 0 | text | ID of the calendar. |

### #FRE

Frequency time record. The time limits for frequency routes. One per time limit.

| Field | Type | Description |
|---|---|---|
| 0 | int | Day: from time. |
| 1 | int | Day: to time. |
| 2 | int | Evening: from time. |
| 3 | int | Evening: to time. |
| 4 | int | Rush 1: from time. |
| 5 | int | Rush 1: to time. |
| 6 | int | Rush 2: from time. |
| 7 | int | Rush 2: to time. |

### #KOS

Special comment record. Comments about a time span, fares, changes, a stretch of the route or capacity.

| Field | Type | Description |
|---|---|---|
| 0 | int | Kind: `4` = change, `8` = time span, `16` = stretch, `32` = fares, `64` = capacity. |
| 1 | text | The comment. |
| 2 | text | Language, as a three-letter ISO 639 code (`nob`, `eng`, …). Empty means `nob`. The old values `0` (Norwegian) and `1` (English) are deprecated. |

### #KOM

Comment record. A description of the period's table, in one language. Any number per period: one per language.

| Field | Type | Description |
|---|---|---|
| 0 | text | The description. |
| 1 | text | Language, as a three-letter ISO 639 code (`nob`, `nno`, `eng`, `deu`, `sme`, …). Empty means `nob`. |

### #KON

Comment record. A comment in Norwegian Nynorsk. Deprecated and replaced by `#KOM` with the language `nno`.

| Field | Type | Description |
|---|---|---|
| 0 | text | The comment. |

### #KOE

Comment record. A comment in English. Deprecated and replaced by `#KOM` with the language `eng`.

| Field | Type | Description |
|---|---|---|
| 0 | text | The comment. |

### #KOT

Comment record. A comment in German. Deprecated and replaced by `#KOM` with the language `deu`.

| Field | Type | Description |
|---|---|---|
| 0 | text | The comment. |

### #TAB

Table record. One per table; a table belongs to the `#PER` above it.

| Field | Type | Description |
|---|---|---|
| 0 | int | Return: flag (`0`/`1`), `1` = a return table. |
| 1 | text | Heading of the distance column (Kilometer, …). |
| 2 | text | Heading of the zone column (Zone, …). |
| 3 | text | Heading of the price column (Kr, …). |

Across the table, each column is either a trip (`#TUR`) or a text column (`#TUT`), described next.

### #TUR

Trip record. One per trip: a column in the table. A trip's `#UID` follows directly after it.

| Field | Type | Description |
|---|---|---|
| 0 | int | X position of the trip (its column, from 0). |
| 1 | text | Day code of the trip (`DX67`); see *Day codes*. |
| 2 | int | On demand: flag (`0`/`1`), `1` = the trip must be booked. |
| 3 | int | CO2 produced per km. Deprecated: emissions follow from vehicle data and distance. |
| 4 | int | An abstract comfort factor. |
| 5 | int | Replacement transport type, when the trip is a replacement service: `1` = bus, `5` = express boat, `7` = ferry, `18` = combi boat, `19` = taxi. Optional. |

### #TUT

Text column record. A column of text instead of times; one per text column and language.

| Field | Type | Description |
|---|---|---|
| 0 | int | X position of the text column. |
| 1 | text | Font name. |
| 2 | char | Font size (default 10). |
| 3 | text | The text. |
| 4 | text | Language, as a three-letter ISO 639 code. Empty means `nob`. |

### #HKP

Accessibility record. Accessibility of the trip above it; one per feature, after the trip. Deprecated: accessibility belongs to the vehicle, not the route.

| Field | Type | Description |
|---|---|---|
| 0 | int | Internal accessibility ID. `-1` if none. |
| 1 | int | Kind: `0` = universal design, `1` = step-free access, `2` = tactile markings, `3` = next-stop announcements, `4` = information display, `5` = wheelchair access, `6` = door width. |
| 2 | int | Door width category, only for kind `6`: less than 70 cm, less than 80 cm, less than 90 cm. |

Down the table, each row is either a trip row (`#TRL`) or a text row (`#TTL`), described next.

### #TRL

Trip row record. One per row of the table: a stop.

| Field | Type | Description |
|---|---|---|
| 0 | int | Y position of the row (from 0). |
| 1 | text | Stop ID: an NSR Quay ID (`NSR:Quay:12345`). `-1` if none. |
| 2 | text | Name of the stop. |
| 3 | int | Typography: a bitmask, see below. |
| 4 | decimal | Kilometres from the start. `-1` if none. |
| 5 | int | Zone. `-1` if none. |
| 6 | decimal | Price, in the currency of `#VAL`. `-1` if none. |
| 7 | int | Flags: a bitmask, see below. |
| 8 | text | Platform. `-1` if none. Deprecated: the Quay ID in field 1 gives the platform. |

A stop on two rows in a row (the same stop ID) is one stop with an arrival row and a departure row.

Flags (field 7):

- Bit 0: the row separates route patterns in routes with several patterns.
- Bit 8: the row marks a change of direction in round trips (the first stop in the new direction).
- Bit 9: the stop is a split stop: a converter makes two stops of it (A – B – C becomes A – B′B″ – C).

The other bits are reserved.

### #TTL

Text row record. A row of text instead of a stop; one per text row and language.

| Field | Type | Description |
|---|---|---|
| 0 | int | Y position of the row. `-1` = before the first row. |
| 1 | int | Typography: a bitmask, see below. |
| 2 | text | Font name. |
| 3 | char | Font size (default 10). |
| 4 | text | The text. |
| 5 | int | Flags. Reserved; written as `0`. |
| 6 | text | Language, as a three-letter ISO 639 code. Empty means `nob`. |

Typography, for both `#TRL` and `#TTL`:

- Bit 0: italic.
- Bit 1: bold.
- Bit 2: a line above.
- Bit 3: underline.

Each cell of the table is either a time cell (`#TRC`) or a text cell (`#TTC`), described next.

### #TRC

Time cell record. One per cell with a time.

| Field | Type | Description |
|---|---|---|
| 0 | int | X position of the cell (its column). |
| 1 | text | The time (`0800`). A pipe character (\|) = the trip passes without stopping. |
| 2 | int | Day counter: days after the day the trip starts. |
| 3 | int | Hour counter: hours after the trip starts (only for minute routes). |
| 4 | int | Interchange: the target cell's column, relative to this cell. |
| 5 | int | Interchange: the target cell's row, relative to this cell. |
| 6 | int | Mask: a bitmask, see below. |

Mask (field 6):

- Bit 0: alighting only.
- Bit 1: boarding only.
- Bit 2: a minute-time cell.
- Bit 3: a frequency cell (rush 1).
- Bit 4: a frequency cell (rush 2).
- Bit 5: a frequency cell (daytime).
- Bit 6: a frequency cell (evening).
- Bit 7: `-`: stops without a time given.
- Bit 8: `x`: stops on request.
- Bit 9: the time is calculated, not given by the operator.
- Bit 10: a guaranteed interchange to the cell given by fields 4 and 5.
- Bit 11: a stay-seated interchange to the cell given by fields 4 and 5.

### #TTC

Text cell record. One per text cell and language.

| Field | Type | Description |
|---|---|---|
| 0 | int | X position of the cell (its column). |
| 1 | text | Font name. |
| 2 | char | Font size (default 10). |
| 3 | text | The text. |
| 4 | int | Flags: a bitmask, see below. |
| 5 | text | Language, as a three-letter ISO 639 code. Empty means `nob`. |

Flags (field 4):

- Bit 0: italic.
- Bit 1: bold.
- Bit 2: a line above.
- Bit 3: underline.
- Bit 4: flight number.
- Bit 5: aircraft type.
- Bit 6: train number.
- Bit 7: trip number.

### #FOT

Footnote record. A note on the whole table, on a trip or on a time cell; one per note and language.

| Field | Type | Description |
|---|---|---|
| 0 | int | X position of the note (its column). `-1` = a note on the whole table. |
| 1 | int | Y position of the note (its row). `-1` = a note on the trip (`#TUR`), or on the whole table. |
| 2 | text | The note. |
| 3 | text | Language, as a three-letter ISO 639 code. Empty means `nob`. The old values `0` (Norwegian) and `1` (English) are deprecated. |

### #UNT

Exception record. Dates on which a trip or a time cell differs from its period; one per exception.

| Field | Type | Description |
|---|---|---|
| 0 | int | X position of the exception (its column). |
| 1 | int | Y position of the exception (its row). `-1` = an exception for the trip (`#TUR`). |
| 2 | text | From date, as YYYYMMDD. |
| 3 | int | From period mask, see below. |
| 4 | text | To date, as YYYYMMDD. |
| 5 | int | To period mask, see below. |
| 6 | int | Day mask, see below. |
| 7 | int | Deviation from the normal time, in minutes. |
| 8 | text | Name of the exception (a holiday name). |

The period runs from the from date to the to date, both included. A from or to date that is empty or `0` is not a date.

Period mask (fields 3 and 5):

- Bit 15: the period is not a closed interval (either from … or … to).
- Bit 14: the period is not run.
- Bit 13: the period is run.
- Bit 3: the period is a holiday period.
- Bit 2: the period boundary is not fixed, but is to be read as *ultimo*.
- Bit 1: the period boundary is not fixed, but is to be read as *medio*.
- Bit 0: the period boundary is not fixed, but is to be read as *primo*.

Day mask (field 6):

- Bit 14: the day is not run.
- Bit 13: the day is run.
- Bit 12: the day before or after is a weekday.
- Bit 11: the day before or after is a public holiday.
- Bit 10: the day is the day after a public holiday or weekday.
- Bit 9: the day is the day before a public holiday or weekday.
- Bit 8: the day is a school day.
- Bit 7: the day is a public holiday.
- Bit 6: the day is a Sunday.
- Bit 5: the day is a Saturday.
- Bit 4: the day is a Friday.
- Bit 3: the day is a Thursday.
- Bit 2: the day is a Wednesday.
- Bit 1: the day is a Tuesday.
- Bit 0: the day is a Monday.

### #BOD

Booking data record. How a trip, or a stop on a trip, can or must be booked; at most one per position. The fields follow NeTEx's booking arrangements.

| Field | Type | Description |
|---|---|---|
| 0 | int | X position (its column). `-1` = the whole table. |
| 1 | int | Y position (its row). `-1` = the whole trip (`#TUR`). |
| 2 | text | Contact person. |
| 3 | text | Phone. |
| 4 | text | E-mail. |
| 5 | text | URL. |
| 6 | text | Further details about the contact. |
| 7 | text | Booking access: `public`, `authorisedPublic` or `staff`. |
| 8 | text | Book when: `timeOfTravelOnly`, `dayOfTravelOnly`, `untilPreviousDay` or `advanceAndDayOfTravel`. |
| 9 | int | Booking methods: a bitmask, see below. |
| 10 | int | Buy when: a bitmask, see below. |
| 11 | text | Latest booking time, as hhmm. |
| 12 | text | Minimum booking period before departure, as an ISO 8601 duration (`PT5M`). |
| 13 | text | Maximum booking period before departure, as an ISO 8601 duration (`P14D`). |

An empty field is not given.

Booking methods (field 9):

- Bit 0: call the driver.
- Bit 1: call the office.
- Bit 2: online.
- Bit 3: phone at the stop.
- Bit 4: text message.

Buy when (field 10):

- Bit 0: on reservation.
- Bit 1: before boarding.
- Bit 2: after boarding.
- Bit 3: on checkout.
- Bit 4: no ticket is required.

### #BOF

Booking note record. A note on how to book; one per position and language. It belongs to the `#BOD` at the same position. Either record may stand without the other.

| Field | Type | Description |
|---|---|---|
| 0 | int | X position (its column). `-1` = the whole table. |
| 1 | int | Y position (its row). `-1` = the whole trip (`#TUR`). |
| 2 | text | The note. |
| 3 | text | Language, as a three-letter ISO 639 code. Empty means `nob`. |

### #DSK

Destination link record. From this cell on, the trip shows the given sign and/or goes to the given destination; one per cell where either changes.

| Field | Type | Description |
|---|---|---|
| 0 | int | X position (its column). |
| 1 | int | Y position (its row). |
| 2 | text | ID of the `#DSS` shown from this stop on. Empty = unchanged. |
| 3 | text | ID of the `#DST` from this stop on. Empty = unchanged. |

Rules:

- A trip has a `#DSK` on the first stop it serves, giving a sign, a destination or both.
- A sign or destination holds until the next `#DSK` in the same column that changes it. The two change independently.
- No `#DSK` on the last stop a trip serves.
- On a stop shown as two rows (arrival and departure), the `#DSK` goes on the departure row; one found on the arrival row is read as being on the departure row.
- A trip without a `#DSK` is incomplete: a file may hold such trips while it is being worked on, but every trip needs one before export.

### #DAG

Days record. A public holiday or special day to take into account in searches; one per day. Deprecated: no known use.

| Field | Type | Description |
|---|---|---|
| 0 | text | From date of the day(s), as YYYYMMDD. |
| 1 | text | To date of the day(s), as YYYYMMDD. Empty for a single day. |
| 2 | int | Day. |
| 3 | int | Flags. |
| 4 | text | Description of the day. |

### #MCT

Minimum connection time record. The time needed to change between a trip in this table and a trip in another table; one per link. Deprecated: journey planners work out connection times.

| Field | Type | Description |
|---|---|---|
| 0 | text | Stop ID. `-1` if none. |
| 1 | text | Name of the stop. |
| 2 | int | X position of the trip in this table. |
| 3 | text | Route ID of the other table. `-1` if none. |
| 4 | text | Route number of the other table. |
| 5 | text | Route pattern of the other table. |
| 6 | text | Period name of the other table. |
| 7 | int | Return flag (`0`/`1`) of the other table. |
| 8 | int | X position of the trip in the other table. |
| 9 | int | The minimum connection time. |

### #RIR

Route in route record. Places a part of another route's table inside this route; one per link. Deprecated: a print feature for nested tables.

| Field | Type | Description |
|---|---|---|
| 0 | text | Route ID of the other table. `-1` if none. |
| 1 | text | Route number of the other table. |
| 2 | text | Route pattern of the other table. |
| 3 | text | Period name of the other table. |
| 4 | int | Return flag (`0`/`1`) of the other table. |
| 5 | int | Original X position in the other table. |
| 6 | int | Original Y position in the other table. |
| 7 | int | Delta X from the original table position. |
| 8 | int | Delta Y from the original table position. |

### #PMK

Publication record: how the route is laid out in a printed publication. Deprecated: for NRI's internal use only.

| Field | Type | Description |
|---|---|---|
| 0 | int | Line number of the route's position in the route register. |
| 1 | int | Flags, see below. |
| 2 | int | Space in pixels between the text above and the table. |
| 3 | int | Space in pixels between the table and the text after it. |
| 5–9 | int | Start and stop positions in the comment text for the part shown above the table. |
| 10–14 | int | Start and stop positions in the comment text for the part shown below the table. |
| 15–214 | int | Which trips in the outbound table are shown: bitmasks of 8 trips each. |
| 214–413 | int | Which stops in the outbound table are shown: bitmasks of 8 stops each. |
| 413–612 | int | Which trips in the return table are shown: bitmasks of 8 trips each. |
| 612–811 | int | Which stops in the return table are shown: bitmasks of 8 stops each. |
| 812 | text | Name of the publication. |
| 813 | text | Name of the route. |
| 814 | text | Number of the route. |

Flags (field 1): `1` = standard table, `2` = period table, `3` = frequency table, `4` = up/down table, `5` = start time table, `6` = stop table, `7` = flight table, `8` = city table, `16` = print vertically, `32` = use the route name, `64` = use the extra name, `128` = use the local route number (pattern), `256` = use approximate times, `512` = fill empty cells with dots, `1024` = use restrictions, `2048` = use comments in Bokmål, `4096` = use comments in Nynorsk, `8192` = use comments in English, `16384` = use comments in German, `32768` = use fare information, `65536` = use km/zone information.

### #LAY

Layout record. The layout of a publication. Deprecated: for NRI's internal use only.

| Field | Type | Description |
|---|---|---|
| 0 | text | Name. |
| 1 | int | Flags. |
| 2 | int | Size X. |
| 3 | int | Size Y. |
| 4 | int | Top margin. |
| 5 | int | Bottom margin. |
| 6 | int | Inner margin. |
| 7 | int | Outer margin. |

### #STL

Style record. The styles of a layout. Deprecated: for NRI's internal use only.

| Field | Type | Description |
|---|---|---|
| 0 | text | Name. |
| 1 | int | Flags. |
| 2 | int | Height. |
| 3 | text | Font name. |
| 4 | int | Font flags. |
| 5 | int | Font height. |
| 6 | int | Font width. |
| 7 | int | Number of tab stops (at most 30). |
| 8 … | float | The tab stops, first to last. |

## Place information

The records are exported one type at a time: all country records first, then all county records, all municipality records, all region records, and so on.

### #LND

Country record.

| Field | Type | Description |
|---|---|---|
| 0 | text | Country code: a two-letter ISO 3166 code (`NO`, `SE`). |
| 1 | text | Country name. |

### #FYL

County record.

| Field | Type | Description |
|---|---|---|
| 0 | text | County number. `-1` if none. |
| 1 | text | County name. |
| 2 | text | County code: a two-letter code for the county. |
| 3 | text | Country code of the country the county is in. |

### #KOM

Municipality record.

| Field | Type | Description |
|---|---|---|
| 0 | text | Municipality number, as FFKK (county and municipality). `-1` if none. |
| 2 | text | Municipality name. |
| 3 | text | Municipality code: a two-letter code for the municipality. |

### #REG

Region record.

| Field | Type | Description |
|---|---|---|
| 0 | text | Region number. `-1` if none. |
| 1 | text | County number of the county the region belongs to. `-1` if none. |
| 2 | text | Region name. |
| 3 | text | Region code: a two-letter code for the region. |

### #STE

Place record.

| Field | Type | Description |
|---|---|---|
| 0 | text | Place number. `-1` if none. |
| 1 | text | Municipality number, as FFKK. `-1` if none. |
| 2 | text | Region number. `-1` if none. |
| 3 | text | Postcode. |
| 4 | text | Place name. |
| 5 | int | Time zone. |

### #PST

Postcode record.

| Field | Type | Description |
|---|---|---|
| 0 | text | Postcode, four digits. `-1` if none. |
| 1 | text | Name of the post town. |
| 2 | text | Name of the country the post town is in. |

### #HPL

Stop record. A stop belongs to a place (`#STE`). Where places and stops are not told apart, a place with the stop's name is still made and used as the stop's place.

| Field | Type | Description |
|---|---|---|
| 0 | text | National stop ID. `-1` if none. |
| 1 | text | Place number of the stop's place. `-1` if none. |
| 2 | text | Name of the stop. |
| 3 | text | Short name of the stop. |
| 4 | long | X coordinate. `0` if none. |
| 5 | long | Y coordinate. `0` if none. |
| 6 | char | Flags. Bits 0 and 1: hub priority: `4` = international, `3` = national, `2` = regional, `1` = local, `0` = not a hub. Bits 2–7 are not used. |
| 7 | text | Local stop number. Optional. |
| 8 | int | Stop type. Optional. `-1` = abstract stop (an area), `0` = used by several transport types, `1` = bus stop or bus terminal, `2` = railway station, `3` = metro station, `4` = tram stop, `5` = airport, `6` = ferry quay or boat terminal, `7` = taxi stand, `8` = address. |
| 9 | text | Description of the stop (the street it is on). Optional. |

### #HKP

Accessibility record. Accessibility at a stop; one per feature.

| Field | Type | Description |
|---|---|---|
| 0 | int | Internal accessibility ID. `-1` if none. |
| 1 | text | Stop ID of the stop it belongs to. `-1` if none. |
| 2 | int | Kind: `0` = universal design, `1` = step-free access, `2` = tactile markings, `3` = next-stop announcements, `4` = information display, `5` = wheelchair access. |

### #PAR

Park and ride record. A car park at a stop; one per car park.

| Field | Type | Description |
|---|---|---|
| 0 | int | Internal park and ride ID. `-1` if none. |
| 1 | text | Stop ID of the stop it belongs to. `-1` if none. |
| 2 | int | Kind: `1` = indoor parking, `2` = outdoor parking. |
| 3 | text | Name, if any. |
| 4 | long | X coordinate. `0` if none. |
| 5 | long | Y coordinate. `0` if none. |
| 6 | int | Flags: `1` = free parking, `2` = parking paid by the hour. |

### #STP

Stop point record. A stop point (platform, gate, quay) of a stop. A stop always has at least one stop point.

| Field | Type | Description |
|---|---|---|
| 0 | text | National stop point ID. `-1` if none. |
| 1 | text | Stop ID of the stop it belongs to. `-1` if none. |
| 2 | text | Name, if any (Exit 13, Platform 2, …). |
| 3 | int | Kind of location, see below. |
| 4 | int | Direction, see below. |
| 5 | long | X coordinate. `0` if none. |
| 6 | long | Y coordinate. `0` if none. |
| 7 | text | Local stop point number. Optional. |
| 8 | text | Description of the stop point (the street it is on). Optional. |

Kind of location (field 3): `1` = bus platform, `2` = railway platform, `3` = metro platform, `4` = tram platform, `5` = airport gate, `6` = ferry quay, `7` = taxi, `8` = address, `9` = street, `10` = position, `11` = parking, `-1` = undefined.

Direction (field 4): `1` = towards the centre, `2` = away from the centre, `3` = southbound, `4` = westbound, `5` = northbound, `6` = eastbound, `-1` = undefined.

### #GAN

Walking distance record. The distance between two stops. Deprecated: journey planners work out walking times and distances.

| Field | Type | Description |
|---|---|---|
| 0 | text | Stop ID of the stop it goes from. `-1` if none. |
| 1 | text | Name of the stop it goes from. |
| 2 | text | Stop ID of the stop it goes to. `-1` if none. |
| 3 | text | Name of the stop it goes to. |
| 4 | int | Time between the stops, in minutes. |
| 5 | int | Distance between the stops, in metres. |
| 6 | int | Kind: `0` = walking distance, `1` = driving distance. |
| 7 | int | Importance of the link: `0` = low, `1` = medium, `2` = high. `-1` if none. |

### #ALI

Alias record. Other names for a stop, in one language; one per stop and language.

| Field | Type | Description |
|---|---|---|
| 0 | text | Stop ID. `-1` if none. |
| 1 | int | Number of aliases (n). |
| 2 … n+1 | text | The aliases, one per field. |
| n+2 | text | Language, as a three-letter ISO 639 code. Empty means `nob`. |

## Company information

### #SEL

Company record. A transport company.

| Field | Type | Description |
|---|---|---|
| 0 | text | Company ID. `-1` if none. |
| 1 | text | Name. |
| 2 | text | Company address, line 1. |
| 3 | text | Company address, line 2. |
| 4 | text | Phone number. |
| 5 | text | Fax number. |
| 6 | text | Contact person. |
| 7 | text | Contact person's address, line 1. |
| 8 | text | Contact person's address, line 2. |
| 9 | text | Contact person's phone. |
| 10 | text | Contact person's fax. |
| 11 | text | Mailing address. |
| 12 | long | Timetable change 1. |
| 13 | long | Timetable change 2. |
| 14 | text | Company's postcode. |
| 15 | text | Contact person's postcode. |
| 16 | int | Company flags: how fares are applied. |
| 17 | text | ID of the group the company belongs to. `-1` if none. |
| 18 | text | E-mail address. |
| 19 | text | Website (URL). |
| 20 | text | Legal name: the company's registered name. |
| 21 | text | Company number (organisation number). |
| 22 | text | VAT number. |

## Fare information

All records in this section are deprecated: fares are out of scope for timetable data.

### #TXR

Fare scale record. The fare that follows is a fare scale. Deprecated.

| Field | Type | Description |
|---|---|---|
| 0 | text | Name of the fare. |
| 1 | text | Period 1 from date. |
| 2 | text | Period 1 to date. |
| 3 | text | Period 2 from date. |
| 4 | text | Period 2 to date. |
| 5 | float | Minimum price of the fare. |
| 6 | int | Flags. |

### #TXE

Single fare record. The fare that follows is a single fare. Deprecated.

| Field | Type | Description |
|---|---|---|
| 0 | text | Name of the fare. |
| 1 | text | Period 1 from date. |
| 2 | text | Period 1 to date. |
| 3 | text | Period 2 from date. |
| 4 | text | Period 2 to date. |
| 5 | float | Minimum price of the fare. |
| 6 | int | Flags. |

### #TXD

Other fare record. The fare that follows is an other (miscellaneous) fare. Deprecated.

| Field | Type | Description |
|---|---|---|
| 0 | text | Name of the fare. |
| 1 | text | Period 1 from date. |
| 2 | text | Period 1 to date. |
| 3 | text | Period 2 from date. |
| 4 | text | Period 2 to date. |
| 5 | float | Minimum price of the fare. |
| 6 | int | Flags. |

### #TCR

Fare link to a route. The fare is linked to a route. Deprecated.

| Field | Type | Description |
|---|---|---|
| 0 | text | Route ID. |
| 1 | text | Route number. |

### #TCS

Fare link to a company. The fare is linked to a company. Deprecated.

| Field | Type | Description |
|---|---|---|
| 0 | text | Company ID. |
| 1 | text | Company name. |

### #TCK

Fare link to a municipality. The fare is linked to a municipality. Deprecated.

| Field | Type | Description |
|---|---|---|
| 0 | text | Municipality ID. |
| 1 | text | Municipality name. |

### #TCF

Fare link to a county. The fare is linked to a county. Deprecated.

| Field | Type | Description |
|---|---|---|
| 0 | text | County ID. |
| 1 | text | County name. |

### #TRR

Route membership of a fare. Several routes can each belong to the fare link. Deprecated.

| Field | Type | Description |
|---|---|---|
| 0 | text | Route ID. |
| 1 | text | Route number. |

### #TRT

Fare scale head. The head of a fare scale; belongs to a fare link. Deprecated.

| Field | Type | Description |
|---|---|---|
| 0 | int | Flags: `1` = distance fare, `2` = zone fare, `3` = flat fare (one price for the whole journey). |

### #TRS

Fare scale cell. A cell of a fare scale; belongs to a fare scale. Deprecated.

| Field | Type | Description |
|---|---|---|
| 0 | float | From zone or kilometre. |
| 1 | float | To kilometre. |
| 2 | float | Price for this unit, kilometre or zone, in kroner. |

### #TEC

Single fare price. The price from stop X to stop Y; belongs to a fare link. Deprecated.

| Field | Type | Description |
|---|---|---|
| 0 | text | Stop ID of stop X. |
| 1 | text | Name of stop X. |
| 2 | text | Stop ID of stop Y. |
| 3 | text | Name of stop Y. |
| 4 | float | Price of the journey. |

### #TDC

Other fare price. A miscellaneous price. Deprecated.

| Field | Type | Description |
|---|---|---|
| 0 | text | Short description of the fare. |
| 1 | text | Long description of the fare. |
| 2 | float | Price of the journey. |
| 3 | int | Flags. |

### #MOD

Discount record. Deprecated.

| Field | Type | Description |
|---|---|---|
| 0 | text | Name of the discount. |
| 1 | int | Flags. |
| 2 | text | Stop ID of the from stop, if any. `-1` if none. |
| 3 | text | Name of the from stop. |
| 4 | text | Stop ID of the to stop, if any. `-1` if none. |
| 5 | text | Name of the to stop. |

### #MOR

Discount link to a route. The discount is linked to a route. Deprecated.

| Field | Type | Description |
|---|---|---|
| 0 | text | Route ID. |
| 1 | text | Route number. |

### #MOS

Discount link to a company. The discount is linked to a company. Deprecated.

| Field | Type | Description |
|---|---|---|
| 0 | text | Company ID. |
| 1 | text | Company name. |

### #MOK

Discount link to a municipality. The discount is linked to a municipality. Deprecated.

| Field | Type | Description |
|---|---|---|
| 0 | text | Municipality ID. |
| 1 | text | Municipality name. |

### #MOF

Discount link to a county. The discount is linked to a county. Deprecated.

| Field | Type | Description |
|---|---|---|
| 0 | text | County ID. |
| 1 | text | County name. |

### #MOL

Discount line. Deprecated.

| Field | Type | Description |
|---|---|---|
| 0 | text | Name of the discount line. |
| 1 | int | ID of the line within a branch. The root line has ID `0`. |
| 2 | int | ID of the parent line within the branch. `-1` if it has no parent. |
| 3 | text | Description of the discount line. |
| 4 | text | Valid from date. |
| 5 | text | Valid to date. |
| 6 | text | Valid from time. |
| 7 | text | Valid to time. |
| 8 | text | Day code it is valid on. |
| 9 | float | Discount in percent. |
| 10 | float | Discount as a price. |
| 11 | float | Minimum price of the discount. |
| 12 | float | Maximum price of the discount. |
| 13 | float | Minimum price of the journey. |
| 14 | float | Rounding price. |
| 15 | int | Rounding flags. |
| 16 | float | Distance from. |
| 17 | float | Distance to. |
| 18 | int | Distance flags. |
| 19 | int | Number. |
| 20 | int | Flags. |

### #TIT

Feeder line linked to a fare. Deprecated.

| Field | Type | Description |
|---|---|---|
| 0 | text | Name of the linked fare. |

### #TIM

Feeder line linked to a discount. Deprecated.

| Field | Type | Description |
|---|---|---|
| 0 | text | Name of the linked discount link. |
| 1 | text | Name of the linked discount line. |

### #TIL

Feeder line. Deprecated.

| Field | Type | Description |
|---|---|---|
| 0 | text | Name of the feeder line. |
| 1 | int | ID of the line within a branch. The root line has ID `0`. |
| 2 | int | ID of the parent line within the branch. `-1` if it has no parent. |
| 3 | text | Description of the feeder line. |
| 4 | text | Valid from date. |
| 5 | text | Valid to date. |
| 6 | text | Valid from time. |
| 7 | text | Valid to time. |
| 8 | text | Day code it is valid on. |
| 9 | float | Surcharge in percent. |
| 10 | float | Surcharge as a price. |
| 11 | int | Flags. |

### #TLT

Feeder line trip. Links a feeder line to a trip in a timetable; refers to the feeder line on the line before it in the file. Deprecated.

| Field | Type | Description |
|---|---|---|
| 0 | text | Route ID. `-1` if none. |
| 1 | text | Route number. |
| 2 | text | Name of the route pattern. |
| 3 | text | Name of the period. |
| 4 | int | Return: flag (`0`/`1`), `1` = a return table. |
| 5 | int | X position of the trip. |

### #OVM

Transfer discount. Deprecated.

| Field | Type | Description |
|---|---|---|
| 0 | text | Name of company 1. |
| 1 | text | Name of company 2. |
| 2 | text | Name of the linked discount, if any. |
| 3 | text | Name of the linked discount line, if any. |
| 4 | text | Name of the linked fare link, if any. |
| 5 | text | Valid from date. |
| 6 | text | Valid to date. |
| 7 | text | Valid from time. |
| 8 | text | Valid to time. |
| 9 | text | Day code it is valid on. |
| 10 | int | Interval. |
| 11 | float | Price. |
| 12 | int | Flags. |

## Day codes

A day code (`#TUR` field 1, and the fare records) says on which days something runs. Weekdays are numbered `1` = Monday to `7` = Sunday.

| Code | Example | Meaning |
|---|---|---|
| `D` | `D` | Every day. |
| Digits | `135` | The listed weekdays (here Monday, Wednesday and Friday), 1 to 4 different digits. |
| `DX` + digits | `DX67` | Every day except the listed weekdays (here Saturday and Sunday), 1 to 3 different digits. |
| `H` | `H` | Public holidays only. |
| `DX` (+ digits) + `H` | `DXH`, `DX67H` | Every day (except the listed weekdays), but not on public holidays. |
| `S` | `S` | School days. |

A code with more than three weekdays left out is written the other way round: `567` (Friday to Sunday), not `DX1234`.

## Record names

ERN itself stands for *Elektronisk Rutebok for Norge* (Electronic Timetable Book for Norway).

What the record codes stand for, in alphabetical order. Most are Norwegian; a (?) marks an origin that is not certain.

| Record | Stands for | Meaning |
|---|---|---|
| `#ALI` | alias | Alias |
| `#AVG` | avgang | Departure–arrival |
| `#BOD` | bookingdata | Booking data |
| `#BOF` | bookingfotnote | Booking note |
| `#DAG` | dag | Days |
| `#DSK` | destinasjonskobling | Destination link |
| `#DSS` | destinasjonsskilt | Destination sign |
| `#DST` | destinasjon | Destination |
| `#EKS` | eksport | Export |
| `#FOT` | fotnote | Footnote |
| `#FRE` | frekvens | Frequency time |
| `#FYL` | fylke | County |
| `#GAN` | gangavstand | Walking distance |
| `#HKP` | handikap | Accessibility |
| `#HPL` | holdeplass | Stop |
| `#KAL` | kalender | Calendar |
| `#KOE` | kommentar, engelsk | Comment in English |
| `#KOM` | kommentar | Comment (route information) |
| `#KOM` | kommune | Municipality (place information) |
| `#KON` | kommentar, nynorsk | Comment in Nynorsk |
| `#KOR` | korrespondanse | Connection |
| `#KOS` | kommentar, spesiell | Special comment |
| `#KOT` | kommentar, tysk | Comment in German |
| `#LAY` | layout | Layout |
| `#LEV` | levering | Delivery |
| `#LND` | land | Country |
| `#MCT` | minimum connection time | Minimum connection time |
| `#MOD` | moderasjon | Discount |
| `#MOF` | moderasjon, fylke | Discount link to a county |
| `#MOK` | moderasjon, kommune | Discount link to a municipality |
| `#MOL` | moderasjon, linje | Discount line |
| `#MOR` | moderasjon, rute | Discount link to a route |
| `#MOS` | moderasjon, selskap | Discount link to a company |
| `#MRK` | merkevare | Brand |
| `#OFF` | offentlig | Public |
| `#OVM` | overgangsmoderasjon | Transfer discount |
| `#PAR` | parkering | Park and ride |
| `#PER` | periode | Period |
| `#PMK` | PageMaker | Publication |
| `#PST` | poststed | Postcode |
| `#REG` | region | Region |
| `#RIR` | rute i rute | Route in route |
| `#RUT` | rute | Route |
| `#SEK` | selskapskobling (?) | Company on the route: links a company to the route |
| `#SEL` | selskap | Company |
| `#STE` | sted | Place |
| `#STL` | stil | Style |
| `#STP` | stoppunkt | Stop point |
| `#TAB` | tabell | Table |
| `#TCF` | takstkobling, fylke (?) | Fare link to a county |
| `#TCK` | takstkobling, kommune (?) | Fare link to a municipality |
| `#TCR` | takstkobling, rute (?) | Fare link to a route |
| `#TCS` | takstkobling, selskap (?) | Fare link to a company |
| `#TDC` | takst, diverse, celle (?) | Other fare price |
| `#TEC` | takst, enkelt, celle (?) | Single fare price |
| `#TIL` | tilbringer, linje (?) | Feeder line |
| `#TIM` | tilbringer, moderasjon (?) | Feeder line linked to a discount |
| `#TIT` | tilbringer, takst (?) | Feeder line linked to a fare |
| `#TLT` | tilbringerlinje, tur (?) | Feeder line trip |
| `#TRA` | trasé | Route pattern |
| `#TRC` | turcelle | Time cell |
| `#TRL` | turlinje | Trip row |
| `#TRM` | transportmodus | Transport mode |
| `#TRR` | takstregulativ, rute (?) | Route membership of a fare |
| `#TRS` | takstregulativ, celle (?) | Fare scale cell |
| `#TRT` | takstregulativ, topp (?) | Fare scale head |
| `#TTC` | tekstcelle (?) | Text cell: a cell of free text |
| `#TTL` | tekstlinje | Text row: a row of free text instead of a stop |
| `#TUR` | tur | Trip |
| `#TUT` | tur-tekst | Text column: a trip column turned into free text |
| `#TXD` | takst, diverse | Other fare |
| `#TXE` | takst, enkelt | Single fare |
| `#TXR` | takst, regulativ (?) | Fare scale |
| `#UID` | unique ID | Stable ID |
| `#UNT` | unntak | Exception |
| `#VAL` | valuta | Currency |
