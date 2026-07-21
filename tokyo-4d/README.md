# Tokyo 4D — Shibuya in real time

A live digital twin of central Tokyo in the browser, centred on the Shibuya
Scramble Crossing. The government's own **Project PLATEAU** FY2025 photoreal
building mesh is draped over real **GSI** terrain and the PLATEAU aerial photo,
then dressed with a live-time layer: real Docomo bike counts, live weather and
the real sun on the Tokyo clock, plus honestly-labelled simulations of the
crowds, cars and trains.

Zero build step, no server code, no API keys. One `index.html`, one `app.js`,
every dependency from a CDN and every data source keyless and CORS-open. Drag
the folder onto **Netlify Drop** and it is live.

```
python3 -m http.server 4179   # then open http://localhost:4179
```

Verify in a real, foreground browser tab — GPU-less/headless browsers choke on
the texture load and rAF is throttled in background tabs.

## What you are looking at

| Layer | Real? | Source | Transport |
|---|---|---|---|
| Buildings (LOD2, FY2025) | **real** | [Project PLATEAU](https://www.mlit.go.jp/plateau/) — Shibuya (13113) + Minato (13103), optional Shinjuku (13104) | 3D Tiles (Draco b3dm) from `assets.cms.plateau.reearth.io`, CORS `*` |
| Terrain (ground height) | **real** | GSI 地理院タイル DEM 10 m | `cyberjapandata.gsi.go.jp/xyz/dem/{z}/{x}/{y}.txt`, CORS `*` |
| Aerial ground photo | **real** | PLATEAU-Ortho 2023 (Tokyo 23 wards) | XYZ tiles `api.plateauview.mlit.go.jp/tiles/plateau-ortho-2023/{z}/{x}/{y}.png`, CORS `*` |
| City bikes | **live** | Docomo Bike Share Tokyo via citybik.es | `api.citybik.es/v2/networks/docomo-cycle-tokyo`, CORS `*` |
| Weather → sky/fog | **live** | Open-Meteo | `api.open-meteo.com`, CORS `*` |
| Sun position | **live/computed** | solar formula on the real Tokyo clock (`Asia/Tokyo`) | — |
| Trains · sim | simulation | alignments from OpenStreetMap (Overpass) | `overpass-api.de`, `railway=rail`, surface only |
| Cars · flow | simulation | street centrelines from OpenStreetMap (Overpass) | `overpass-api.de`, `highway=trunk/primary/secondary/tertiary` |
| People · sim | simulation | hour-of-day crowd model around Shibuya's anchors | — |

The three simulations carry a hollow dot in the legend and a `· sim` / `· flow`
label. They are not measurements — see `DESIGN.md`.

## How it is put together

- **Georeferencing.** The primary PLATEAU tileset defines a local ENU frame
  (`setLatLonToYUp`, X = north, Z = east, Y = up) at the Scramble Crossing. Every
  other object is placed through that frame.
- **CESIUM_RTC.** PLATEAU b3dm glTFs store their tile origin in the `CESIUM_RTC`
  extension; without registering `GLTFCesiumRTCExtension` on the glTF loader the
  buildings land at the centre of the Earth. This is the one non-obvious wiring
  step for PLATEAU data.
- **Buildings-only + real terrain.** PLATEAU ships buildings without ground, so
  the floor is built from GSI DEM tiles into a height-field, draped with the
  PLATEAU aerial photo. That same height-field doubles as an O(1) ground-height
  lookup for every walker, car and train — so there is **no per-frame mesh
  raycasting anywhere**, and none of the "flying pedestrian" failure modes.
  GSI heights are orthometric (T.P.); a constant Tokyo geoid offset (~36.7 m)
  lifts them onto the ellipsoidal datum the buildings sit on.
- **Draco.** PLATEAU b3dm is Draco-compressed; `DRACOLoader` is wired (KTX2 too,
  harmlessly, in case fine tiles ever use it).
- **Streaming that survives automation.** The tile download/parse queues are
  driven by a `MessageChannel` scheduler (rAF stalls in hidden tabs), and the
  LRU byte cap is raised so downtown reaches full detail before eviction starts.
- **Performance.** `tick()` runs ~0.3 ms on a laptop; crowds and cars are
  `InstancedMesh` (a few draw calls for 3000 people + hundreds of cars).

## What was evaluated and rejected

- **ODPT (Open Data for Public Transportation in Tokyo)** — the real live train
  and bus positions. Rejected: every endpoint requires a personal
  `acl:consumerKey`, which breaks the key-free drag-and-drop-deploy property.
  With a small proxy (or an embedded key, if you accept that) this becomes the
  marquee live layer; the `trains · sim` layer is the honest stand-in until then.
- **AIS ship traffic (Tokyo Bay)** — needs a keyed service (e.g. aisstream.io);
  also outside this inland Shibuya box.
- **Roadside traffic counts** — no keyless, CORS-open Japanese source found, so
  car density falls back to a Tokyo hour-of-day curve rather than live counts.
- **Aircraft (Haneda/Narita)** — OpenSky/adsb feeds block browser CORS.

## Attribution (open licences require it)

3D buildings & aerial photo © MLIT **Project PLATEAU** (CC BY 4.0) · elevation ©
**GSI** 地理院タイル · roads & rails © **OpenStreetMap** contributors (ODbL) ·
bikes © **Docomo Bike Share** / citybik.es · weather © **Open-Meteo**.

## Adapting to another city

Almost everything city-specific is in the constants block at the top of
`app.js`: the `TILESETS`, `ORIGIN`, `BOUNDS`, `GEO_BOX`, the ortho/DEM tile
URLs, the bike network id, the pedestrian anchors and the rail-line colour map.
The PLATEAU catalogue (`api.plateauview.mlit.go.jp/datacatalog/graphql`) lists
LOD2 building tilesets for every Japanese city that has been surveyed.
