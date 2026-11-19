import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Protocol } from 'pmtiles';
import { buildStyle } from './basemap-style.js';

const protocol = new Protocol();
maplibregl.addProtocol('pmtiles', protocol.tile);

// The archive lives in R2. On www.opensidewalks.org/mx the Worker serves it under
// /mx/data/ (see worker.js); the build names the exact version with
// VITE_PMTILES_URL. Locally, drop a copy in public/data/.
const pmtilesUrl = new URL(
  import.meta.env.VITE_PMTILES_URL || `${import.meta.env.BASE_URL}data/mexico_sidewalks.pmtiles`,
  location.href,
).href;

const map = new maplibregl.Map({
  container: 'map',
  style: buildStyle(pmtilesUrl),
  center: [-100.5, 20.5], // tilted All Mexico globe view
  zoom: 4.2,
  pitch: 45,
  bearing: -8,
  hash: true,
  attributionControl: false,
});

map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');

// MapLibre re-adds 'maplibregl-compact-show' during load (resize event triggers
// _updateCompact). Force collapse until the user clicks ⓘ.
{
  const attribEl = document.querySelector('.maplibregl-ctrl-attrib');
  const summary = attribEl?.querySelector('summary');
  let userInteracted = false;
  const forceCollapse = () => {
    if (userInteracted) return;
    attribEl.classList.remove('maplibregl-compact-show');
    attribEl.setAttribute('open', '');
  };
  forceCollapse();
  const observer = new MutationObserver(() => {
    if (!userInteracted && attribEl.classList.contains('maplibregl-compact-show')) {
      forceCollapse();
    }
  });
  observer.observe(attribEl, { attributes: true, attributeFilter: ['class', 'open'] });
  summary?.addEventListener('click', () => {
    userInteracted = true;
    setTimeout(() => observer.disconnect(), 100);
  });
}

// --- Fly-to presets ---
const PLACES = [
  { name: 'Mexico City', center: [-99.1332, 19.4326], zoom: 14.5, pitch: 60, bearing: -17 },
  { name: 'Guadalajara', center: [-103.3496, 20.6767], zoom: 14.5, pitch: 60, bearing: 15 },
  { name: 'Monterrey', center: [-100.3161, 25.6866], zoom: 14.5, pitch: 60, bearing: -25 },
  { name: 'Puebla', center: [-98.2063, 19.0414], zoom: 14.5, pitch: 58, bearing: 0 },
  { name: 'Tijuana', center: [-117.0382, 32.5149], zoom: 14.3, pitch: 58, bearing: 10 },
  { name: 'León', center: [-101.6821, 21.123], zoom: 14.5, pitch: 58, bearing: 0 },
  { name: 'Ciudad Juárez', center: [-106.4245, 31.6904], zoom: 14.3, pitch: 55, bearing: 0 },
  { name: 'Querétaro', center: [-100.3899, 20.5888], zoom: 14.5, pitch: 58, bearing: -15 },
  { name: 'Mérida', center: [-89.6237, 20.9674], zoom: 14.5, pitch: 55, bearing: 0 },
  { name: 'Cancún', center: [-86.8515, 21.1619], zoom: 14.3, pitch: 55, bearing: 20 },
  { name: 'Toluca', center: [-99.6532, 19.2879], zoom: 14.5, pitch: 58, bearing: 0 },
  { name: 'Aguascalientes', center: [-102.2916, 21.8853], zoom: 14.5, pitch: 58, bearing: 0 },
  { name: 'San Luis Potosí', center: [-100.9855, 22.1565], zoom: 14.5, pitch: 58, bearing: 0 },
  { name: 'Hermosillo', center: [-110.9559, 29.0729], zoom: 14.3, pitch: 55, bearing: 0 },
  { name: 'Culiacán', center: [-107.394, 24.8069], zoom: 14.5, pitch: 55, bearing: 0 },
  { name: 'Veracruz', center: [-96.1342, 19.1738], zoom: 14.5, pitch: 55, bearing: 10 },
  { name: 'Oaxaca', center: [-96.7266, 17.0732], zoom: 14.8, pitch: 55, bearing: -10 },
  { name: '🇲🇽 All Mexico', center: [-100.5, 20.5], zoom: 4.2, pitch: 45, bearing: -8 },
];

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// --- City chip marquee ---
const nav = document.getElementById('places');
const track = nav.querySelector('.marquee-track');
const [mainSet, cloneSet] = nav.querySelectorAll('.marquee-set');

function makeChip(p, isClone) {
  const btn = document.createElement('button');
  btn.textContent = p.name;
  if (isClone) btn.tabIndex = -1; // clone set is aria-hidden; keep it out of tab order too
  btn.addEventListener('click', () => {
    map.flyTo({
      center: p.center,
      zoom: p.zoom,
      pitch: p.pitch,
      bearing: p.bearing,
      duration: prefersReducedMotion ? 0 : 2500,
    });
  });
  return btn;
}

for (const p of PLACES) mainSet.appendChild(makeChip(p, false));
for (const p of PLACES) cloneSet.appendChild(makeChip(p, true));

if (prefersReducedMotion) {
  nav.classList.add('reduced-motion'); // static, scrollable strip; clones hidden in CSS
  document.getElementById('marquee-toggle').hidden = true;
} else {
  // ~3.5s per chip per loop reads as a calm ticker; count-based so it needs no layout measurement
  track.style.setProperty('--marquee-duration', `${PLACES.length * 3.5}s`);
}

// --- Source filters (legend checkboxes) ---
// Each checkbox turns on a set of `provenance` values in the sidewalks layer;
// "No sidewalk" is the separate gaps layer.
const SOURCE_FILTERS = [
  { input: 'filter-both', values: ['both'] },
  { input: 'filter-inegi', values: ['inegi_only'] },
  { input: 'filter-osm', values: ['osm_only', 'connector'] },
];
const filterTagged = document.getElementById('filter-tagged');
const filterGaps = document.getElementById('filter-gaps');

function applySidewalkFilter() {
  if (!map.getLayer('sidewalk-core')) return;
  const enabled = SOURCE_FILTERS.filter((f) => document.getElementById(f.input).checked).flatMap((f) => f.values);
  const filter = ['match', ['get', 'provenance'], enabled.length ? enabled : ['__none__'], true, false];
  map.setFilter('sidewalk-core', filter);
  map.setFilter('sidewalk-glow', filter);
  map.setLayoutProperty('sidewalk-tagged', 'visibility', filterTagged.checked ? 'visible' : 'none');
  for (const id of ['gap-core', 'gap-glow']) map.setLayoutProperty(id, 'visibility', filterGaps.checked ? 'visible' : 'none');
}

for (const el of document.querySelectorAll('#legend input')) el.addEventListener('change', applySidewalkFilter);
map.on('load', applySidewalkFilter);

const marqueeToggle = document.getElementById('marquee-toggle');
marqueeToggle.addEventListener('click', () => {
  const paused = nav.classList.toggle('paused');
  marqueeToggle.setAttribute('aria-pressed', String(paused));
  marqueeToggle.setAttribute('aria-label', paused ? 'Play city ticker' : 'Pause city ticker');
  marqueeToggle.textContent = paused ? '▶' : '⏸';
});

// --- Layer toggles ---
const LAYER_TOGGLES = [
  { input: 'toggle-buildings', layer: 'building-3d' },
  { input: 'toggle-satellite', layer: 'satellite' },
];
for (const { input, layer } of LAYER_TOGGLES) {
  const checkbox = document.getElementById(input);
  const apply = () => {
    if (!map.getLayer(layer)) return;
    map.setLayoutProperty(layer, 'visibility', checkbox.checked ? 'visible' : 'none');
  };
  checkbox.addEventListener('change', apply);
  map.on('load', apply);
}

// --- Hover info card ---
const SOURCE_LABEL = {
  both: { text: 'Sidewalk — INEGI and OpenStreetMap', color: '#2EE6D6' },
  inegi_only: { text: 'Sidewalk — INEGI census', color: '#FFA800' },
  osm_only: { text: 'Sidewalk — drawn in OpenStreetMap', color: '#B98CFF' },
  connector: { text: 'Sidewalk link — joins OSM sidewalks', color: '#B98CFF' },
  synth_tagged: { text: 'Sidewalk — from OSM road tags', color: '#F5E9D6' },
};
const GAP_LABEL = { text: 'No sidewalk — INEGI census', color: '#FF2E92' };

const STATE_NAME = {
  AGS: 'Aguascalientes', BC: 'Baja California', BCS: 'Baja California Sur', CAMP: 'Campeche',
  COAH: 'Coahuila', COL: 'Colima', CHIS: 'Chiapas', CHIH: 'Chihuahua', CDMX: 'Ciudad de México',
  DGO: 'Durango', GTO: 'Guanajuato', GRO: 'Guerrero', HGO: 'Hidalgo', JAL: 'Jalisco',
  MEX: 'Estado de México', MICH: 'Michoacán', MOR: 'Morelos', NAY: 'Nayarit', NL: 'Nuevo León',
  OAX: 'Oaxaca', PUE: 'Puebla', QRO: 'Querétaro', QROO: 'Quintana Roo', SLP: 'San Luis Potosí',
  SIN: 'Sinaloa', SON: 'Sonora', TAB: 'Tabasco', TAMPS: 'Tamaulipas', TLAX: 'Tlaxcala',
  VER: 'Veracruz', YUC: 'Yucatán', ZAC: 'Zacatecas',
};
const RAMPS = { yes: 'kerb ramps', no: 'no kerb ramps' };

const info = document.getElementById('info');
const infoStreet = document.getElementById('info-street');
const infoStatus = document.getElementById('info-status');
const infoLoc = document.getElementById('info-loc');
const HOVER_LAYERS = ['sidewalk-core', 'sidewalk-tagged', 'gap-core'];

map.on('mousemove', (e) => {
  const features = map.queryRenderedFeatures(
    [
      [e.point.x - 4, e.point.y - 4],
      [e.point.x + 4, e.point.y + 4],
    ],
    { layers: HOVER_LAYERS.filter((l) => map.getLayer(l)) },
  );
  if (!features.length) {
    info.hidden = true;
    map.getCanvas().style.cursor = '';
    return;
  }
  // queryRenderedFeatures lists the topmost layer first, so sidewalks beat gaps.
  const feat = features[0];
  const f = feat.properties;
  const status = feat.sourceLayer === 'gaps'
    ? GAP_LABEL
    : SOURCE_LABEL[f.provenance] ?? { text: 'Sidewalk', color: '#B98CFF' };
  infoStreet.textContent = f.street || 'Unnamed street';
  infoStatus.textContent = status.text;
  infoStatus.style.color = status.color;
  infoLoc.textContent = [STATE_NAME[f.prov], RAMPS[f.ramps], f.osm_id].filter(Boolean).join(' · ');
  info.hidden = false;
  info.style.left = `${e.point.x + 14}px`;
  info.style.top = `${e.point.y + 14}px`;
  map.getCanvas().style.cursor = 'crosshair';
});

map.on('mouseout', () => {
  info.hidden = true;
});

map.on('error', (e) => console.warn('map error:', e.error?.message ?? e));

window.map = map; // debugging handle
