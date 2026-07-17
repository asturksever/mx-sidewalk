import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Protocol } from 'pmtiles';
import { buildStyle } from './basemap-style.js';

const protocol = new Protocol();
maplibregl.addProtocol('pmtiles', protocol.tile);

const pmtilesUrl = `${location.origin}/data/mexico_sidewalks.pmtiles`;

const map = new maplibregl.Map({
  container: 'map',
  style: buildStyle(pmtilesUrl),
  center: [-99.1332, 19.4326], // CDMX Centro Histórico
  zoom: 14.5,
  pitch: 60,
  bearing: -17,
  hash: true,
  attributionControl: false,
});

map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');

// MapLibre opens the compact attribution on load; start collapsed (ⓘ only)
const attribEl = document.querySelector('.maplibregl-ctrl-attrib');
attribEl.classList.remove('maplibregl-compact-show');
attribEl.removeAttribute('open');

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
  { name: '🇲🇽 All Mexico', center: [-102.5, 23.8], zoom: 4.3, pitch: 0, bearing: 0 },
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

// --- Sidewalk class filters (legend checkboxes) ---
const filterYes = document.getElementById('filter-yes');
const filterNo = document.getElementById('filter-no');
const filterOther = document.getElementById('filter-other');

function applySidewalkFilter() {
  if (!map.getLayer('sidewalk-core')) return;
  const enabled = [];
  if (filterYes.checked) enabled.push('Dispone');
  if (filterNo.checked) enabled.push('No dispone');
  const filter = enabled.length
    ? ['match', ['get', 'BANQUETA_D'], enabled, true, false]
    : ['==', ['get', 'BANQUETA_D'], '__none__'];
  map.setFilter('sidewalk-core', filter);
  map.setFilter('sidewalk-glow', filter);
  map.setLayoutProperty('sidewalk-other', 'visibility', filterOther.checked ? 'visible' : 'none');
}

for (const el of [filterYes, filterNo, filterOther]) el.addEventListener('change', applySidewalkFilter);
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
const STATUS_LABEL = {
  Dispone: { text: 'Has sidewalk', color: '#FFA800' },
  'No dispone': { text: 'No sidewalk', color: '#FF2E92' },
  'No aplica': { text: 'Not applicable', color: '#5a4d80' },
  'Conjunto habitacional': { text: 'Gated housing complex', color: '#5a4d80' },
  'No especificado': { text: 'Unspecified', color: '#5a4d80' },
};

const info = document.getElementById('info');
const infoStreet = document.getElementById('info-street');
const infoStatus = document.getElementById('info-status');
const infoLoc = document.getElementById('info-loc');
const SIDEWALK_LAYERS = ['sidewalk-core', 'sidewalk-other'];

map.on('mousemove', (e) => {
  const features = map.queryRenderedFeatures(
    [
      [e.point.x - 4, e.point.y - 4],
      [e.point.x + 4, e.point.y + 4],
    ],
    { layers: SIDEWALK_LAYERS.filter((l) => map.getLayer(l)) },
  );
  if (!features.length) {
    info.hidden = true;
    map.getCanvas().style.cursor = '';
    return;
  }
  const f = features[0].properties;
  const status = STATUS_LABEL[f.BANQUETA_D] ?? { text: f.BANQUETA_D ?? '—', color: '#5a4d80' };
  const street = [f.TIPOVIAL, f.NOMVIAL].filter((s) => s && s !== 'None').join(' ');
  infoStreet.textContent = street || 'Unnamed street';
  infoStatus.textContent = status.text;
  infoStatus.style.color = status.color;
  infoLoc.textContent = f._state_name ?? '';
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
