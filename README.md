# emarox-poi-data

Truck and van places along European routes for the "Na trasie" tool of
[map.emarox.com](https://map.emarox.com): truck parking, rest areas, fuel stations,
hotels with parking, truck washes and truck service.

Rebuilt every Monday by GitHub Actions and published on GitHub Pages:
`https://r4ksoo.github.io/emarox-poi-data/v1/manifest.json` and `v1/t/<y>_<x>.json`
(0.5° × 0.5° cells, `y = floor(lat × 2)`, `x = floor(lng × 2)`).

## Sources

| Source | What it gives | Licence |
|---|---|---|
| [OpenStreetMap](https://www.openstreetmap.org/copyright) via [Geofabrik](https://download.geofabrik.de/) extracts | positions, outlines, names, facilities, fuel cards | ODbL 1.0 |
| [EU list of certified Safe and Secure Truck Parking Areas](https://eu-parkings.eu/sstpas/sstpas-map/) (Delegated Regulation (EU) 2022/1012) | certification level; showers, toilets, food and security are mandatory at every certified site | European Commission |
| [Autobahn GmbH des Bundes](https://verkehr.autobahn.de/o/autobahn/) open data | every truck rest area on German motorways with the official number of truck spaces | Datenlizenz Deutschland |

Rules: a fact is stored only when a source states it. Missing data stays missing; nothing is
inferred, except that a fuel station inside a motorway service area (`highway=services`) is
marked as reachable by trucks. Every attribute carries its source (`s`: `e` = EU list,
`d` = Autobahn GmbH, otherwise OpenStreetMap). Prices are stored only with an operator's
price list link and a check date.

## Licence

The data set is a derivative of OpenStreetMap and is published under the
[Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
© OpenStreetMap contributors.

## Layout

- `build/extract.py` — one Geofabrik `.osm.pbf` → candidate objects (pyosmium)
- `build/classify.mjs` — categories, TIR/BUS flags, deduplication, facilities
- `build/merge.mjs`, `build/sources/` — official lists
- `build/build.mjs` — tiles and manifest; `build/check.mjs` — refuses a build that lost data
- `measure/` — accuracy measurement on six test routes (`measure/results.md`)
- `test/` — unit tests (`node --test test/*.test.mjs`)
