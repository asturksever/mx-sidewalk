import STATS from './stats.json';
import './contact.js';
import { initUpdates } from './updates.js';

initUpdates();

// Before this page existed the site was the map itself, so old links carry a map position in the hash
// (#zoom/lat/lng): send them on to the map.
if (/^#\d+(\.\d+)?\/-?\d/.test(location.hash)) location.replace(`map/${location.search}${location.hash}`);

const LINKEDIN_URL = 'https://www.linkedin.com/in/asturksever/';
for (const a of document.querySelectorAll('a[data-linkedin]')) {
  a.href = LINKEDIN_URL;
  a.hidden = false;
}

const fmt = (v) => Math.round(v).toLocaleString('en-US');
// Headline figures are not validated yet, so they are shown to three figures: 328,000, 3.71 million.
const round = (v) => {
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)} million`;
  const mag = 10 ** Math.max(0, Math.floor(Math.log10(v)) - 2);
  return fmt(Math.round(v / mag) * mag);
};
const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);

// --- Headline figures ---
const { km, inegi, states } = STATS;
// Connectors are short stubs between drawn OpenStreetMap ways: counted with them.
const osmOnly = km.osm_only + km.connector;
const unified = km.both + km.inegi_only + osmOnly + km.synth_tagged;
const drawn = km.both + osmOnly;
const census = km.both + km.inegi_only;
const FIGURES = {
  'unified-km': round(unified),
  'inegi-total-km': round(census),
  'osm-total-km': round(drawn),
  'both-km': round(km.both),
  'inegi-km': round(km.inegi_only),
  'osm-km': round(osmOnly),
  'tagged-km': round(km.synth_tagged),
  times: Math.round(unified / drawn),
  'with-sides': round(inegi.with_sidewalk),
  'without-sides': round(inegi.without),
  'all-sides': round(inegi.with_sidewalk + inegi.without),
  'without-km': round(inegi.without_km),
  'without-pct': pct(inegi.without, inegi.with_sidewalk + inegi.without),
  // How much of what INEGI counted someone has also drawn in OpenStreetMap.
  'drawn-pct': pct(km.both, census),
};
for (const el of document.querySelectorAll('[data-stat]')) el.textContent = FIGURES[el.dataset.stat];

[km.both, km.inegi_only, osmOnly, km.synth_tagged].forEach((v, i) => {
  document.getElementById('national-stack').children[i].style.flexGrow = v / unified;
});

// --- States: the share of each state's surveyed block sides with no sidewalk, highest first ---
const rows = Object.values(states)
  .map((s) => ({ ...s, share: s.without / (s.with + s.without) }))
  .sort((a, b) => b.share - a.share);
Object.assign(FIGURES, {
  'max-pct': pct(rows[0].without, rows[0].with + rows[0].without),
  'max-state': rows[0].name,
  'min-pct': pct(rows.at(-1).without, rows.at(-1).with + rows.at(-1).without),
  'min-state': rows.at(-1).name,
});
for (const el of document.querySelectorAll('[data-stat]')) el.textContent = FIGURES[el.dataset.stat];
document.getElementById('state-rows').replaceChildren(
  ...rows.map((s) => {
    const li = document.createElement('li');
    li.innerHTML = '<span class="st-name"></span><span class="bar"><i></i></span><span class="st-pct"></span>';
    li.querySelector('.st-name').textContent = s.name;
    li.querySelector('i').style.width = `${(100 * s.share).toFixed(1)}%`;
    li.querySelector('.st-pct').textContent = `${Math.round(100 * s.share)}%`;
    li.title = `${fmt(s.without)} of ${fmt(s.with + s.without)} block sides without a sidewalk`;
    return li;
  }),
);

// --- Cities: straight into the map at that place. Kept in step with PLACES in src/main.js. ---
// The map keeps its view in the hash: #zoom/lat/lng/bearing/pitch.
const CITIES = [
  ['Mexico City', 'Ciudad de México', 14.5, 19.4326, -99.1332, -17, 60],
  ['Guadalajara', 'Jalisco', 14.5, 20.6767, -103.3496, 15, 60],
  ['Monterrey', 'Nuevo León', 14.5, 25.6866, -100.3161, -25, 60],
  ['Puebla', 'Puebla', 14.5, 19.0414, -98.2063, 0, 58],
  ['Tijuana', 'Baja California', 14.3, 32.5149, -117.0382, 10, 58],
  ['León', 'Guanajuato', 14.5, 21.123, -101.6821, 0, 58],
  ['Ciudad Juárez', 'Chihuahua', 14.3, 31.6904, -106.4245, 0, 55],
  ['Querétaro', 'Querétaro', 14.5, 20.5888, -100.3899, -15, 58],
  ['Mérida', 'Yucatán', 14.5, 20.9674, -89.6237, 0, 55],
  ['Cancún', 'Quintana Roo', 14.3, 21.1619, -86.8515, 20, 55],
  ['Toluca', 'Estado de México', 14.5, 19.2879, -99.6532, 0, 58],
  ['Oaxaca', 'Oaxaca', 14.8, 17.0732, -96.7266, -10, 55],
];
const cityHref = ([, , z, lat, lng, bearing, pitch]) => `map/#${z}/${lat}/${lng}/${bearing}/${pitch}`;

document.getElementById('city-doors').replaceChildren(
  ...CITIES.map((c) => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = cityHref(c);
    a.innerHTML = '<strong></strong><small></small>';
    a.querySelector('strong').textContent = c[0];
    a.querySelector('small').textContent = c[1];
    li.appendChild(a);
    return li;
  }),
);
// The hero offers the six largest as a row of small links under the buttons.
document.querySelector('.hero-cities').replaceChildren(
  ...CITIES.slice(0, 6).map((c) => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = cityHref(c);
    a.textContent = c[0];
    li.appendChild(a);
    return li;
  }),
);

// The hero map is decoration: load it once the page itself has settled.
const startHero = () => import('./hero-map.js').catch(() => {});
if ('requestIdleCallback' in window) requestIdleCallback(startHero, { timeout: 1500 });
else setTimeout(startHero, 300);
