# Routing regression fixtures

Real road tiles (NPT2, gzip) for `tests/routing/regression.test.js`, cut to small boxes around the stops the user
reviewed in the routing spike (2026-10-30). Built with nepos-tiles from Geofabrik's `ostlandet-261028.osm.pbf`
(OpenStreetMap data © OpenStreetMap contributors, ODbL 1.0):

```
python -m build ostlandet-261028.osm.pbf <nepos-online>/tests/fixtures/routing/<area> --bbox <box>
```

| Area | Box (minlon,minlat,maxlon,maxlat) | Cases |
|---|---|---|
| oslo-ost | 10.79,59.885,10.83,59.917 | Manglerud T (A) and (B) |
| ostfold | 10.945,59.26,11.117,59.336 | Kalnes, Sarpsborg (plain and with the waypoint), AMFI Borg |
| lysaker | 10.624,59.90,10.65,59.925 | Lysaker brygge |
| sonsveien | 10.706,59.495,10.747,59.535 | Sonsveien stasjon |

`--bbox` keeps every way with a node inside the box, whole. `cases.json` holds the NSR quay coordinates of each chain,
plus two opt-in chains run only when `NEPOS_TILES_DIR` points at a full tile folder (E6 via Vinterbro; line 23 under
one second).
