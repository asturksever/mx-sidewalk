// Custom "Día de Muertos" dark basemap over OpenFreeMap vector tiles
// (OpenMapTiles schema) + optional satellite + local sidewalks PMTiles.

const COLORS = {
  ground: '#0d0a1a',
  groundLow: '#0b0916', // low-zoom / globe ground
  water: '#0c3049',
  park: '#111a17',
  roadMinor: '#241c3a',
  roadMajor: '#2e2450',
  roadCasing: '#151024',
  building: '#453567',
  buildingTop: '#8b6fd8',
  boundary: '#4a3a7a',
  label: '#f5e9d6',
  labelHalo: '#0d0a1a',
  // Where each sidewalk comes from (the archive's `provenance`), plus INEGI's
  // block sides that have none (the `gaps` layer).
  inegi: '#FFA800', // cempasúchil marigold — INEGI 2020 census only
  both: '#2EE6D6', // turquesa — INEGI and an OSM-drawn sidewalk agree
  osm: '#B98CFF', // violeta — drawn in OSM, not in INEGI
  tagged: '#F5E9D6', // papel — offset from OSM road tags (sidewalk=both/left/right)
  gap: '#FF2E92', // rosa mexicano — INEGI: this block side has no sidewalk
  unified: '#F2EEFF', // the unified network: every source in one colour
};

// Drawn ways and the stubs that join them share a colour; connectors are short.
const SOLID = ['both', 'inegi_only', 'osm_only', 'connector'];

const sidewalkColor = [
  'match',
  ['get', 'provenance'],
  'both', COLORS.both,
  'inegi_only', COLORS.inegi,
  'synth_tagged', COLORS.tagged,
  COLORS.osm, // osm_only, connector
];

const isSolid = ['match', ['get', 'provenance'], SOLID, true, false];

// Wider when zoomed out: at country scale a 1 px line all but disappears on the dark ground.
const coreWidth = ['interpolate', ['linear'], ['zoom'], 4, 1.6, 8, 1.4, 11, 1.2, 14, 1.8, 17, 3.2];
const glowWidth = ['interpolate', ['linear'], ['zoom'], 11, 3, 14, 7, 17, 14];
const glowBlur = ['interpolate', ['linear'], ['zoom'], 11, 3, 17, 8];

export function buildStyle(pmtilesUrl) {
  return {
    version: 8,
    name: 'Sidewalks of Mexico — Día de Muertos',
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sky: {
      'sky-color': '#060312',
      'horizon-color': '#3a1f5e',
      'fog-color': '#0d0a1a',
      'sky-horizon-blend': 0.6,
      'horizon-fog-blend': 0.6,
      'fog-ground-blend': 0.85,
      'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 6, 1, 8, 0.2],
    },
    projection: { type: 'globe' },
    sources: {
      openfreemap: {
        type: 'vector',
        url: 'https://tiles.openfreemap.org/planet',
      },
      satellite: {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        ],
        tileSize: 256,
        maxzoom: 19,
        attribution: 'Imagery: Esri, Maxar, Earthstar Geographics',
      },
      sidewalks: {
        type: 'vector',
        url: `pmtiles://${pmtilesUrl}`,
        attribution: 'Banquetas: INEGI Inventario Nacional de Viviendas 2020; © OpenStreetMap contributors',
      },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': COLORS.ground } },
      {
        id: 'park',
        type: 'fill',
        source: 'openfreemap',
        'source-layer': 'park',
        paint: { 'fill-color': COLORS.park, 'fill-opacity': 0.8 },
      },
      {
        id: 'landuse-green',
        type: 'fill',
        source: 'openfreemap',
        'source-layer': 'landcover',
        filter: ['match', ['get', 'class'], ['wood', 'grass', 'forest'], true, false],
        paint: { 'fill-color': COLORS.park, 'fill-opacity': 0.5 },
      },
      {
        id: 'water',
        type: 'fill',
        source: 'openfreemap',
        'source-layer': 'water',
        paint: { 'fill-color': COLORS.water },
      },
      {
        id: 'waterway',
        type: 'line',
        source: 'openfreemap',
        'source-layer': 'waterway',
        paint: { 'line-color': COLORS.water, 'line-width': 1.2 },
      },
      // --- roads ---
      {
        id: 'road-minor',
        type: 'line',
        source: 'openfreemap',
        'source-layer': 'transportation',
        minzoom: 11,
        filter: [
          'match',
          ['get', 'class'],
          ['minor', 'service', 'track', 'path'],
          true,
          false,
        ],
        paint: {
          'line-color': COLORS.roadMinor,
          'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 11, 0.4, 14, 1.5, 18, 8],
        },
      },
      {
        id: 'road-major',
        type: 'line',
        source: 'openfreemap',
        'source-layer': 'transportation',
        minzoom: 5,
        filter: [
          'match',
          ['get', 'class'],
          ['motorway', 'trunk', 'primary', 'secondary', 'tertiary'],
          true,
          false,
        ],
        paint: {
          'line-color': COLORS.roadMajor,
          'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 5, 0.5, 10, 1.2, 14, 4, 18, 18],
        },
      },
      // --- admin boundaries ---
      {
        id: 'boundary-state',
        type: 'line',
        source: 'openfreemap',
        'source-layer': 'boundary',
        filter: ['all', ['<=', ['get', 'admin_level'], 4], ['!=', ['get', 'maritime'], 1]],
        paint: {
          'line-color': '#6a5aa8',
          'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.8, 8, 1.5],
          'line-dasharray': [3, 2],
          'line-opacity': 0.8,
        },
      },
      // --- satellite imagery (toggled from the UI; covers the dark ground) ---
      {
        id: 'satellite',
        type: 'raster',
        source: 'satellite',
        layout: { visibility: 'none' },
        paint: {
          'raster-brightness-max': 0.85,
          'raster-saturation': -0.25,
        },
      },
      // --- sidewalks (the data!) — under 3D buildings, over roads ---
      // Block sides with no sidewalk sit under the sidewalks, so a drawn way on a
      // block INEGI saw without one still shows.
      {
        id: 'gap-glow',
        type: 'line',
        source: 'sidewalks',
        'source-layer': 'gaps',
        minzoom: 11,
        layout: { 'line-cap': 'round' },
        paint: { 'line-color': COLORS.gap, 'line-width': glowWidth, 'line-blur': glowBlur, 'line-opacity': 0.3 },
      },
      {
        id: 'gap-core',
        type: 'line',
        source: 'sidewalks',
        'source-layer': 'gaps',
        // Not at country scale: the low-zoom tiles keep about twice as many gap lines as sidewalks, and the pink
        // buried the unified network. From zoom 9 they outline each city's fringe.
        minzoom: 9,
        layout: { 'line-cap': 'round' },
        paint: {
          'line-color': COLORS.gap,
          'line-width': coreWidth,
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 4, 0.75, 11, 0.9],
        },
      },
      // --- the unified network: every sidewalk from every source in one colour, on by default. The source
      // layers below draw over it in their own colours when their legend rows are ticked. ---
      {
        id: 'unified-glow',
        type: 'line',
        source: 'sidewalks',
        'source-layer': 'sidewalks',
        minzoom: 11,
        layout: { 'line-cap': 'round' },
        paint: { 'line-color': COLORS.unified, 'line-width': glowWidth, 'line-blur': glowBlur, 'line-opacity': 0.25 },
      },
      {
        id: 'unified',
        type: 'line',
        source: 'sidewalks',
        'source-layer': 'sidewalks',
        layout: { 'line-cap': 'round' },
        paint: {
          'line-color': COLORS.unified,
          'line-width': coreWidth,
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 4, 0.85, 11, 1],
        },
      },
      {
        id: 'sidewalk-glow',
        type: 'line',
        source: 'sidewalks',
        'source-layer': 'sidewalks',
        minzoom: 11,
        filter: isSolid,
        layout: { 'line-cap': 'round' },
        paint: { 'line-color': sidewalkColor, 'line-width': glowWidth, 'line-blur': glowBlur, 'line-opacity': 0.35 },
      },
      {
        id: 'sidewalk-core',
        type: 'line',
        source: 'sidewalks',
        'source-layer': 'sidewalks',
        filter: isSolid,
        layout: { 'line-cap': 'round' },
        paint: {
          'line-color': sidewalkColor,
          'line-width': coreWidth,
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 4, 0.9, 11, 1],
        },
      },
      // Inferred from road tags rather than drawn or surveyed: dashed, like the
      // US and Canada maps.
      {
        id: 'sidewalk-tagged',
        type: 'line',
        source: 'sidewalks',
        'source-layer': 'sidewalks',
        filter: ['==', ['get', 'provenance'], 'synth_tagged'],
        paint: {
          'line-color': COLORS.tagged,
          'line-width': coreWidth,
          'line-dasharray': [2, 1.5],
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 4, 0.7, 11, 0.9],
        },
      },
      // --- 3D buildings ---
      {
        id: 'building-3d',
        type: 'fill-extrusion',
        source: 'openfreemap',
        'source-layer': 'building',
        minzoom: 13.5,
        paint: {
          'fill-extrusion-color': [
            'interpolate',
            ['linear'],
            ['coalesce', ['get', 'render_height'], 5],
            0, COLORS.building,
            60, COLORS.buildingTop,
          ],
          'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 5],
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
          'fill-extrusion-opacity': 0.85,
        },
      },
      // --- labels ---
      {
        id: 'place-city',
        type: 'symbol',
        source: 'openfreemap',
        'source-layer': 'place',
        filter: ['match', ['get', 'class'], ['city', 'town'], true, false],
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Bold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 4, 11, 10, 16],
        },
        paint: {
          'text-color': COLORS.label,
          'text-halo-color': COLORS.labelHalo,
          'text-halo-width': 1.5,
        },
      },
      {
        id: 'place-suburb',
        type: 'symbol',
        source: 'openfreemap',
        'source-layer': 'place',
        minzoom: 11,
        filter: ['match', ['get', 'class'], ['suburb', 'neighbourhood', 'quarter'], true, false],
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 12,
        },
        paint: {
          'text-color': COLORS.label,
          'text-halo-color': COLORS.labelHalo,
          'text-halo-width': 1.2,
          'text-opacity': 0.8,
        },
      },
    ],
  };
}

export { COLORS };
