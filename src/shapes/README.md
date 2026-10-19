# The routing engine (src/shapes)

Routes ServiceLinks between Quays on the same vector tiles the map shows (Lasse's build spec,
`docs/superpowers/specs/2026-10-19-routing-spec-lasse.md`, as changed by
`docs/superpowers/specs/2026-10-19-maplibre-routing-design.md`). No MapLibre, no DOM: it runs in a Web Worker.

## What the tiles give us (checked 2026-10-19, OpenFreeMap build 20261011_080001_pt)

- Schema OpenMapTiles; layer `transportation`; extent 4096 in every tile checked.
- z14 Oslo S: `minor`, `service`, `trunk`, `primary`, `secondary`, `tertiary`, `path/*`, `bridge` (polygon-like),
  `*_construction`, `transit/tram`, `transit/subway` (tunnel), `rail/rail` (tunnel). Attributes `brunnel`, `layer`,
  `oneway`, `service`, `ramp`, `access` occur.
- z12 rural (Roa, Gjøvikbanen): `rail/rail` is kept; roads down to `minor`.
- z11 Oslofjord: one merged `ferry` feature per tile; `rail/rail` and trunk roads kept.
- z14 Bergen (Byparken): no `transit` feature for the Bybanen tram in that tile — check the tram profile on more
  Bergen tiles before trusting it (open).

## Assumptions

- Vertex identity = global integer coordinates at the link's zoom; lines are clipped to their own tile square, so
  a line cut at a tile edge meets its neighbour's at identical points.
- Zoom per link: < 20 km z14, 20–80 km z12, > 80 km and every ferry z11; metro always z14 (`profiles.js`).
