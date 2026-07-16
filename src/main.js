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
  attributionControl: { compact: true },
});

map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');

// --- Fly-to presets ---
const PLACES = [
  { name: 'Centro', center: [-99.1332, 19.4326], zoom: 14.5, pitch: 60, bearing: -17 },
  { name: 'Condesa', center: [-99.174, 19.4115], zoom: 14.8, pitch: 60, bearing: 20 },
  { name: 'Coyoacán', center: [-99.1617, 19.3467], zoom: 14.8, pitch: 55, bearing: 0 },
  { name: 'Iztapalapa', center: [-99.0553, 19.3574], zoom: 13.8, pitch: 55, bearing: -30 },
  { name: '🇲🇽 México', center: [-102.5, 23.8], zoom: 4.3, pitch: 0, bearing: 0 },
];

const nav = document.getElementById('places');
for (const p of PLACES) {
  const btn = document.createElement('button');
  btn.textContent = p.name;
  btn.addEventListener('click', () => {
    map.flyTo({ center: p.center, zoom: p.zoom, pitch: p.pitch, bearing: p.bearing, duration: 2500 });
  });
  nav.appendChild(btn);
}

// --- Hover info card ---
const STATUS_LABEL = {
  Dispone: { text: 'Con banqueta', color: '#FFA800' },
  'No dispone': { text: 'Sin banqueta', color: '#FF2E92' },
  'No aplica': { text: 'No aplica', color: '#5a4d80' },
  'Conjunto habitacional': { text: 'Conjunto habitacional', color: '#5a4d80' },
  'No especificado': { text: 'No especificado', color: '#5a4d80' },
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
  infoStreet.textContent = street || 'Vialidad sin nombre';
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
