// The landing page's framed map, free to pan and zoom. The page scrolls past it, so
// zooming takes Ctrl or ⌘ with the wheel and panning takes two fingers on a touch screen.
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Protocol } from 'pmtiles';
import { buildStyle } from './basemap-style.js';

maplibregl.addProtocol('pmtiles', new Protocol().tile);

// The same archive the map reads (see src/main.js).
const PMTILES_URL = new URL(
  import.meta.env.VITE_PMTILES_URL || `${import.meta.env.BASE_URL}data/mexico_sidewalks.pmtiles`,
  location.href,
).href;

const el = document.getElementById('hero-map');
const open = document.getElementById('hero-open');
// Centro Histórico, Mexico City: every kind of line and the gaps show at once.
const START = [[-99.1505, 19.4255], [-99.1225, 19.4405]];
const style = buildStyle(PMTILES_URL);
style.layers = style.layers.filter((l) => !['building-3d', 'satellite', 'place-suburb', 'unified', 'unified-glow'].includes(l.id));
delete style.sky;

const map = new maplibregl.Map({
  container: el,
  style,
  bounds: START,
  fitBoundsOptions: { padding: 16 },
  minZoom: 4,
  maxZoom: 17,
  cooperativeGestures: true,
  dragRotate: false,
  pitchWithRotate: false,
  attributionControl: false, // the page's footer credits the sources
});
map.touchZoomRotate.disableRotation();
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
// Fade in once the style is in, not on 'idle': a dense city view keeps fetching tiles for a while, and the frame
// would sit empty until the last one arrived.
map.once('load', () => el.classList.add('ready'));

// The link opens the full map where this one is looking.
map.on('moveend', () => {
  const { lng, lat } = map.getCenter();
  open.href = `map/#${map.getZoom().toFixed(2)}/${lat.toFixed(4)}/${lng.toFixed(4)}`;
});
