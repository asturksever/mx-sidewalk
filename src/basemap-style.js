// Custom "Día de Muertos" dark basemap over OpenFreeMap vector tiles
// (OpenMapTiles schema) + AWS open terrain + local sidewalks PMTiles.

const COLORS = {
  ground: '#0d0a1a',
  groundLow: '#0b0916', // low-zoom / globe ground
  water: '#0c3049',
  park: '#111a17',
  roadMinor: '#241c3a',
  roadMajor: '#2e2450',
  roadCasing: '#151024',
  building: '#1a1030',
  buildingTop: '#241745',
  boundary: '#4a3a7a',
  label: '#f5e9d6',
  labelHalo: '#0d0a1a',
  sidewalkYes: '#FFA800', // cempasúchil marigold — has sidewalk
  sidewalkNo: '#FF2E92', // rosa mexicano — missing sidewalk
  sidewalkOther: '#5a4d80', // no aplica / conjunto habitacional / no especificado
};

const MAIN_CLASSES = ['Dispone', 'No dispone'];

const sidewalkColor = [
  'match',
  ['get', 'BANQUETA_D'],
  'Dispone',
  COLORS.sidewalkYes,
  'No dispone',
  COLORS.sidewalkNo,
  COLORS.sidewalkOther,
];

const isMainClass = ['match', ['get', 'BANQUETA_D'], MAIN_CLASSES, true, false];

export function buildStyle(pmtilesUrl) {
  return {
    version: 8,
    name: 'Banquetas de México — Día de Muertos',
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
      terrain: {
        type: 'raster-dem',
        tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
        encoding: 'terrarium',
        tileSize: 256,
        maxzoom: 13,
        attribution: 'Terrain: Mapzen/AWS Open Data',
      },
      sidewalks: {
        type: 'vector',
        url: `pmtiles://${pmtilesUrl}`,
        attribution: 'Banquetas: INEGI Censo 2020',
      },
    },
    terrain: { source: 'terrain', exaggeration: 1.4 },
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
      {
        id: 'hillshade',
        type: 'hillshade',
        source: 'terrain',
        paint: {
          'hillshade-shadow-color': '#050310',
          'hillshade-highlight-color': '#2a2050',
          'hillshade-accent-color': '#1b1233',
          'hillshade-exaggeration': 0.35,
        },
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
      // --- sidewalks (the data!) — under 3D buildings, over roads ---
      {
        id: 'sidewalk-other',
        type: 'line',
        source: 'sidewalks',
        'source-layer': 'sidewalks',
        filter: ['!', isMainClass],
        paint: {
          'line-color': COLORS.sidewalkOther,
          'line-opacity': 0.4,
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.4, 13, 1, 16, 1.8],
        },
      },
      {
        id: 'sidewalk-glow',
        type: 'line',
        source: 'sidewalks',
        'source-layer': 'sidewalks',
        minzoom: 11,
        filter: isMainClass,
        layout: { 'line-cap': 'round' },
        paint: {
          'line-color': sidewalkColor,
          'line-width': ['interpolate', ['linear'], ['zoom'], 11, 3, 14, 7, 17, 14],
          'line-blur': ['interpolate', ['linear'], ['zoom'], 11, 3, 17, 8],
          'line-opacity': 0.35,
        },
      },
      {
        id: 'sidewalk-core',
        type: 'line',
        source: 'sidewalks',
        'source-layer': 'sidewalks',
        filter: isMainClass,
        layout: { 'line-cap': 'round' },
        paint: {
          'line-color': sidewalkColor,
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            4, 0.8,
            8, 1,
            11, 1,
            14, 1.8,
            17, 3.2,
          ],
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 4, 0.9, 11, 1],
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
