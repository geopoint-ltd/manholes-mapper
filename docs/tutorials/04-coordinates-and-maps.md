# Tutorial 4 — Coordinates & Map Layers

Sketches start as schematic drawings — nodes positioned by hand. Adding real
coordinates (Israel TM Grid, EPSG:2039) geo-references the network: distances
become real meters, background maps align, and exports drop straight into GIS.

## Ways to get coordinates in

1. **Survey hardware** — TSC3 shots and GNSS captures write coordinates
   directly to nodes ([Tutorial 5](05-survey-mode.md)). This is the primary
   field workflow.
2. **CSV import** — measured points from any instrument:
   - Format: `point_id,x,y,z` (ITM easting/northing/elevation), one per line.
   - Menu → **Import coordinates**, pick the file.
   - Points whose `point_id` matches a node ID are applied to those nodes;
     unmatched nodes are repositioned by network adjacency (BFS propagation)
     so the whole sketch lands in the right place.
3. **Manual placement on the map** — with the map layer on, canvas positions
   are converted through the current reference point.

Nodes with survey-grade coordinates show a **green check badge**; the
schematic-view banner disappears once the sketch is geo-referenced.

> Valid ITM ranges: X 100,000–300,000 m, Y 350,000–800,000 m. Out-of-range
> values are rejected at import.

## Background map layers

Open the **layers panel** (map-stack button in the canvas toolbar):

- **Map tiles** — Esri World Imagery (orthophoto) or Esri World Street Map,
  plus the GovMap Israeli government orthophoto. Tiles align to your ITM
  coordinates with survey-grade proj4 transforms (<1 m).
- **Reference layers** — project GIS overlays uploaded by your admin:
  sections, existing survey manholes and pipes (with flow arrows), streets,
  and addresses. Toggle each independently.
- **Annotations** — draw zones, polygons, and notes on the map with the
  Geoman toolbar; annotations autosave locally and persist across sessions.

## Your location

The **My location** button (bottom toolbar) shows your device position as a
blue dot with an accuracy circle — no survey hardware needed, useful for
orienting yourself on large sites. The first fix asks for browser location
permission; continuous tracking follows you as you walk.

## Street View

Drag the **pegman** widget onto the canvas to open Google Street View at that
map location — handy for checking cover locations from the office.

## Related deep-dives

- [docs/MAP_COORDINATES.md](../MAP_COORDINATES.md) — the full coordinate
  system guide.
- [docs/LEGACY_IMPORT_GUIDE.md](../LEGACY_IMPORT_GUIDE.md) — migrating
  pre-coordinates-era sketches ([Tutorial 8](08-export-import.md) covers the
  wizard).

**Next:** [Tutorial 5 — Survey mode](05-survey-mode.md)
