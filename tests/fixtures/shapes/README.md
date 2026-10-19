# Vector tile fixtures (routing tests)

OpenFreeMap planet build `20261011_080001_pt` (OpenMapTiles schema, extent 4096), fetched 2026-10-19 from
`https://tiles.openfreemap.org/planet/20261011_080001_pt/{z}/{x}/{y}.pbf`. Map data © OpenStreetMap contributors.

| File | What |
| --- | --- |
| `14-8680..8682-4764..4766.pbf` | 3 × 3 block of z14 tiles around Oslo S: bus roads, tram, metro, rail |
| `11-1084-598.pbf`, `11-1084-601.pbf` | z11 over the Oslofjord: ferry lines (one merged feature per tile), trunk roads, rail |
| `12-2168-1182.pbf` | z12 at Roa on Gjøvikbanen: rural rail at z12 (`rail/rail`), trunk and secondary roads |
| `14-8434-4721.pbf` | z14 Bergen centre (Byparken): roads, rail and funicular in tunnel, a ferry; no tram feature here |

Quays used in tests: Jernbanetorget `NSR:Quay:7203` (10.7498, 59.9109), Oslo bussterminal `NSR:Quay:11972`
(10.7563, 59.9121) — approximate positions; tests that need exact ones take them from the test itself.
