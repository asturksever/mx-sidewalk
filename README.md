# Banquetas de México 🇲🇽

A **Día de Muertos**-styled 3D web map visualizing sidewalk coverage across Mexico,
built from INEGI 2020 census block-front data (8.3M segments, all 32 states).
POC camera starts over Mexico City; the data and architecture are already national.

![stack](https://img.shields.io/badge/MapLibre%20GL%20JS-v5-blue) ![data](https://img.shields.io/badge/PMTiles-INEGI%202020-orange)

## How it works

- **MapLibre GL JS v5** renders everything in WebGL: dark custom basemap, 3D extruded
  buildings, real terrain, globe projection when zoomed out.
- **PMTiles** (`public/data/mexico_sidewalks.pmtiles`, 482MB, not in git) is read
  directly by the browser via HTTP range requests — no tile server.
- Sidewalk block-fronts are colored by INEGI's `BANQUETA_D` attribute:
  marigold `#FFA800` = has sidewalk, rosa mexicano `#FF2E92` = missing,
  dim purple = other/unspecified.
- Basemap tiles: [OpenFreeMap](https://openfreemap.org) (keyless).
  Terrain: AWS Open Data terrarium tiles (keyless).

## Run

```bash
# requires Node (this machine: ~/.local/node/bin)
export PATH="$HOME/.local/node/bin:$PATH"
npm install
# place the PMTiles file:
cp ~/Downloads/mexico_sidewalks_a1a77d20.pmtiles public/data/mexico_sidewalks.pmtiles
npm run dev   # http://localhost:5173
```

## Scaling beyond the POC

- **Hosting**: push the PMTiles to object storage with free/cheap egress
  (Cloudflare R2) and deploy the static app anywhere (Vercel) — zero servers,
  works for the entire country as-is.
- **Country-scale storytelling**: precompute coverage % per municipio/AGEB
  (DuckDB over the INEGI source GeoJSONs), emit a second small PMTiles, and add
  an extruded choropleth layer for low zooms.
- **More metrics**: the same features carry `RAMPAS` (wheelchair ramps),
  `ALUMPUB` (street lighting), `CICLOVIA` (bike lanes), `GUARNICI` (curbs),
  `PASOPEAT` (crossings) — each is just an alternate `match` expression + UI toggle.

## Data

INEGI, Censo de Población y Vivienda 2020 — Características del entorno urbano
(frentes de manzana). Tiled with tippecanoe (z4–z14, densest-dropped at low zooms).
