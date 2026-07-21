import * as THREE from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { TilesRenderer } from '3d-tiles-renderer';
import { GLTFCesiumRTCExtension } from '3d-tiles-renderer/plugins/index.js';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

// BVH-accelerated raycasting — used when picking our own moving objects.
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

const D2R = THREE.MathUtils.DEG2RAD, R2D = THREE.MathUtils.RAD2DEG;

// ===========================================================================
// Tokyo 4D — Shibuya in real time
// 3D: photoreal FY2025 LOD2 building mesh streamed from MLIT Project PLATEAU
//     (Shibuya + Minato wards), on real GSI terrain draped with PLATEAU aerial
// +1D: live city bikes (Docomo), live weather and the real sun on the Tokyo
//      clock; honest simulations of trains, cars and the Shibuya crowds.
// ===========================================================================

// PLATEAU FY2025 building tilesets (Draco-compressed b3dm, CORS-open).
const TILESETS = [
  { name: 'Shibuya', url: 'https://assets.cms.plateau.reearth.io/assets/16/b016d3-42ef-4428-ad99-d229310b39fd/13113_shibuya-ku_pref_2025_citygml_1_op_bldg_3dtiles_13113_shibuya-ku_lod2/tileset.json' },
  { name: 'Minato',  url: 'https://assets.cms.plateau.reearth.io/assets/b5/b5f79e-0c6c-4fc7-adde-6522014243a2/13103_minato-ku_pref_2025_citygml_1_op_bldg_3dtiles_13103_minato-ku_lod2/tileset.json' },
];
const SHINJUKU_TILESET = 'https://assets.cms.plateau.reearth.io/assets/00/bed0bd-f882-4cde-b942-21d0f8d2ddc2/13104_shinjuku-ku_pref_2025_citygml_1_op_bldg_3dtiles_13104_shinjuku-ku_lod2/tileset.json';

// Local origin: the Shibuya Scramble Crossing. Scene frame: X = north, Z = east, Y = up.
const ORIGIN = { lat: 35.6595, lon: 139.7005 };

// Camera / interest bounds, metres from origin (north, east). ~3.7 × 3.6 km.
const BOUNDS = { north: 1850, south: -1900, east: 1800, west: -1800, minY: 28, maxY: 2800 };

// Geo box for keeping/discarding live objects (a little wider than the camera box).
const GEO_BOX = { latMin: 35.638, latMax: 35.681, lonMin: 139.675, lonMax: 139.726 };

// PLATEAU aerial-photo tiles (2023, Tokyo 23 wards) and GSI elevation tiles.
const ORTHO_URL = (z, x, y) => `https://api.plateauview.mlit.go.jp/tiles/plateau-ortho-2023/${z}/${x}/${y}.png`;
const DEM_URL = (z, x, y) => `https://cyberjapandata.gsi.go.jp/xyz/dem/${z}/${x}/${y}.txt`;
const ORTHO_Z = 16, DEM_Z = 14;
// GSI DEM is orthometric (T.P.); add the Tokyo geoid height to reach the
// ellipsoidal datum the PLATEAU buildings are placed on. Tuned so building
// bases meet the ground (Tokyo geoid ≈ 36.7 m).
const GEOID = 36.7;
let SCENE_GROUND = 55;   // scene-Y of ground near origin; set once DEM loads

// Live city bikes — Docomo Bike Share Tokyo via the citybik.es mirror.
const BIKES_URL = 'https://api.citybik.es/v2/networks/docomo-cycle-tokyo?fields=stations';
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast?latitude=35.66&longitude=139.70'
  + '&current=temperature_2m,cloud_cover,weather_code,wind_speed_10m,is_day&timezone=UTC';

// OpenStreetMap Overpass — road & rail centrelines for the flow simulations.
const OVERPASS = 'https://overpass-api.de/api/interpreter';
const OVP_BBOX = `${GEO_BOX.latMin},${GEO_BOX.lonMin},${GEO_BOX.latMax},${GEO_BOX.lonMax}`;
const ROADS_Q = `[out:json][timeout:25];way["highway"~"^(trunk|primary|secondary|tertiary)$"]["area"!~"yes"](${OVP_BBOX});out geom;`;
const RAILS_Q = `[out:json][timeout:25];way["railway"="rail"](${OVP_BBOX});out geom;`;

// Tokyo palette
const PALETTE = {
  skyClear: new THREE.Color(0x8fb4d8),
  skyOvercast: new THREE.Color(0xb6bfc8),
  skyNight: new THREE.Color(0x0b1222),
  concrete: new THREE.Color(0xb9bcc0),
};

// Rail-line colours (official-ish). 山手線 / 山手貨物線 → JR yellow-green.
const RAIL_DEFAULT = 0xc8d0d8;
function railColor(name) {
  if (!name) return RAIL_DEFAULT;
  if (name.includes('山手')) return 0x9acd32;          // Yamanote
  if (name.includes('東横') || name.includes('東急東横')) return 0xe6004c; // Tokyu Toyoko
  if (name.includes('井の頭')) return 0x1d7fc4;         // Keio Inokashira
  if (name.includes('田園都市')) return 0x00a29a;        // Tokyu Den-en-toshi
  if (name.includes('中央') || name.includes('総武')) return 0xf15a22;      // Chuo / Sobu
  if (name.includes('京王')) return 0xdd0077;           // Keio
  return RAIL_DEFAULT;
}
function railShortName(name) {
  if (!name) return '';
  if (name.includes('山手')) return '山手';
  if (name.includes('東横')) return '東横';
  if (name.includes('井の頭')) return '井の頭';
  if (name.includes('田園都市')) return '田園都市';
  if (name.includes('中央') || name.includes('総武')) return '中央・総武';
  if (name.includes('京王')) return '京王';
  return name.replace(/線$/, '').slice(0, 4);
}

const layerVisible = {
  bike: true, train: true, cars: true, ped: true,
  ortho: true, rails: true, shinjuku: false,
};
let groundReady = false;

// ---------------------------------------------------------------------------
// Renderer / scene
// ---------------------------------------------------------------------------
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true });
} catch (e) {
  document.querySelector('#loading .jp').textContent = 'WebGL is not available in this browser';
  throw e;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('app').appendChild(renderer.domElement);
renderer.domElement.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  console.warn('WebGL context lost — waiting for restore');
});

const scene = new THREE.Scene();
scene.background = PALETTE.skyClear.clone();
scene.fog = new THREE.FogExp2(PALETTE.skyClear.clone(), 0.00009);

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 1, 40000);
camera.position.set(-780, 500, -520); // south-west of the crossing, looking NE

const hemi = new THREE.HemisphereLight(0xcfe4f5, 0x39424e, 1.05);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff3e0, 1.6);
sun.position.set(-600, 900, 700);
scene.add(sun);

const controls = new MapControls(camera, renderer.domElement);
controls.target.set(0, SCENE_GROUND, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 40;
controls.maxDistance = 3400;
controls.maxPolarAngle = Math.PI * 0.48;
controls.zoomToCursor = true;

// ---------------------------------------------------------------------------
// 3D Tiles — PLATEAU LOD2 building meshes (buildings only, no terrain)
// ---------------------------------------------------------------------------
const draco = new DRACOLoader().setDecoderPath(
  'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/gltf/');
const ktx2 = new KTX2Loader().setTranscoderPath(
  'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/basis/');
ktx2.detectSupport(renderer);

function mcScheduler(func) {
  const ch = new MessageChannel();
  ch.port1.onmessage = () => { ch.port1.close(); func(); };
  ch.port2.postMessage(null);
}

// Textured PLATEAU surfaces keep their photo (unlit); untextured facets are lit
// so the sun still gives them form.
const litConcrete = new THREE.MeshLambertMaterial({ color: PALETTE.concrete });
let firstModel = false;
function skinModel(model) {
  model.traverse((c) => {
    if (!c.isMesh || !c.material) return;
    const map = c.material.map || null;
    if (map) map.colorSpace = THREE.SRGBColorSpace;
    c.material.dispose?.();
    c.material = map ? new THREE.MeshBasicMaterial({ map }) : litConcrete;
  });
  if (!firstModel) {
    firstModel = true;
    document.getElementById('loading').classList.add('hide');
    setDot('dot-tiles', 'on');
  }
}

function makeTileset(url, { optional = false, cap = 620 } = {}) {
  const t = new TilesRenderer(url);
  const loader = new GLTFLoader(t.manager);
  loader.setDRACOLoader(draco);
  loader.setKTX2Loader(ktx2);
  // PLATEAU b3dm glTFs carry their tile origin in the CESIUM_RTC extension;
  // without this the geometry lands at the centre of the Earth.
  loader.register(() => new GLTFCesiumRTCExtension());
  t.manager.addHandler(/\.(gltf|glb)$/g, loader);
  t.setCamera(camera);
  t.setResolutionFromRenderer(camera, renderer);
  t.setLatLonToYUp(ORIGIN.lat * D2R, ORIGIN.lon * D2R);
  t.errorTarget = 10;
  t.lruCache.minSize = 500;
  t.lruCache.maxSize = 800;
  t.lruCache.minBytesSize = (cap - 180) * 1e6;
  t.lruCache.maxBytesSize = cap * 1e6;
  t.downloadQueue.schedulingCallback = mcScheduler;
  t.parseQueue.schedulingCallback = mcScheduler;
  t.addEventListener('load-model', ({ scene: m }) => skinModel(m));
  t.addEventListener('load-error', (e) => { console.warn('[tiles]', url.split('/').pop(), e.message || e); if (!firstModel) setDot('dot-tiles', 'err'); });
  t.optional = optional;
  scene.add(t.group);
  return t;
}

const tilesets = TILESETS.map((d) => makeTileset(d.url, { cap: 560 }));
const tiles = tilesets[0]; // reference frame for geo <-> scene
window.__dbg = { tiles, tilesets, camera, scene, controls, THREE };

// ---------------------------------------------------------------------------
// Geo helpers (all live objects are positioned through the primary tileset's frame)
// ---------------------------------------------------------------------------
const _ecef = new THREE.Vector3();
function geoToScene(latDeg, lonDeg, height, target) {
  tiles.ellipsoid.getCartographicToPosition(latDeg * D2R, lonDeg * D2R, height, _ecef);
  return target.copy(_ecef).applyMatrix4(tiles.group.matrixWorld);
}
const _inv = new THREE.Matrix4();
const _cc = new THREE.Vector3();
function sceneToGeo(x, z) {
  _inv.copy(tiles.group.matrixWorld).invert();
  _cc.set(x, SCENE_GROUND, z).applyMatrix4(_inv);
  const r = {};
  tiles.ellipsoid.getPositionToCartographic(_cc, r);
  return { lat: r.lat * R2D, lon: r.lon * R2D };
}

// ---------------------------------------------------------------------------
// Ground — real GSI terrain (DEM heightfield) draped with the PLATEAU aerial
// photo. This is the entire floor (PLATEAU ships buildings only), and it also
// serves as the cheap ground-height lookup for every walker, car and train —
// no per-frame mesh raycasting anywhere.
// ---------------------------------------------------------------------------
function lon2t(lon, z) { return (lon + 180) / 360 * 2 ** z; }
function lat2t(lat, z) { const s = Math.sin(lat * D2R); return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 2 ** z; }

const GROUND = {
  xMin: BOUNDS.south - 250, xMax: BOUNDS.north + 250,
  zMin: BOUNDS.west - 250, zMax: BOUNDS.east + 250,
  seg: 168,
};
const NG = GROUND.seg + 1;
const HZG = new Float32Array(NG * NG).fill(NaN); // scene-Y at grid nodes
let groundMesh = null;

async function fetchDemTiles(box) {
  const x0 = Math.floor(lon2t(box.lonMin, DEM_Z)), x1 = Math.floor(lon2t(box.lonMax, DEM_Z));
  const y0 = Math.floor(lat2t(box.latMax, DEM_Z)), y1 = Math.floor(lat2t(box.latMin, DEM_Z));
  const grids = new Map();
  const jobs = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
    jobs.push((async () => {
      try {
        const r = await fetch(DEM_URL(DEM_Z, x, y));
        if (!r.ok) return;
        const txt = await r.text();
        const g = new Float32Array(256 * 256);
        const rows = txt.trim().split('\n');
        for (let i = 0; i < 256 && i < rows.length; i++) {
          const cols = rows[i].split(',');
          for (let j = 0; j < 256; j++) {
            const v = cols[j];
            g[i * 256 + j] = (v === undefined || v === 'e' || v === '') ? NaN : parseFloat(v);
          }
        }
        grids.set(x + '/' + y, g);
      } catch (e) { /* one missing DEM tile is fine */ }
    })());
  }
  await Promise.all(jobs);
  return grids;
}
function demElev(grids, lat, lon) {
  const fx = lon2t(lon, DEM_Z), fy = lat2t(lat, DEM_Z);
  const tx = Math.floor(fx), ty = Math.floor(fy);
  const g = grids.get(tx + '/' + ty);
  if (!g) return NaN;
  const px = Math.min(255, Math.max(0, Math.floor((fx - tx) * 256)));
  const py = Math.min(255, Math.max(0, Math.floor((fy - ty) * 256)));
  return g[py * 256 + px];
}

async function fetchOrthoCanvas(box) {
  const x0 = Math.floor(lon2t(box.lonMin, ORTHO_Z)), x1 = Math.floor(lon2t(box.lonMax, ORTHO_Z));
  const y0 = Math.floor(lat2t(box.latMax, ORTHO_Z)), y1 = Math.floor(lat2t(box.latMin, ORTHO_Z));
  const nx = x1 - x0 + 1, ny = y1 - y0 + 1;
  const cv = document.createElement('canvas');
  cv.width = nx * 256; cv.height = ny * 256;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#3b4048'; ctx.fillRect(0, 0, cv.width, cv.height);
  const jobs = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
    jobs.push((async () => {
      try {
        const r = await fetch(ORTHO_URL(ORTHO_Z, x, y));
        if (!r.ok) return;
        const bmp = await createImageBitmap(await r.blob());
        ctx.drawImage(bmp, (x - x0) * 256, (y - y0) * 256, 256, 256);
      } catch (e) { /* one missing ortho tile is fine */ }
    })());
  }
  await Promise.all(jobs);
  return { cv, x0, y0, nx, ny };
}

async function buildGround() {
  tiles.group.updateMatrixWorld(true);
  // geo bbox of the ground plane (corners of the scene extent)
  const c = [
    sceneToGeo(GROUND.xMin, GROUND.zMin), sceneToGeo(GROUND.xMin, GROUND.zMax),
    sceneToGeo(GROUND.xMax, GROUND.zMin), sceneToGeo(GROUND.xMax, GROUND.zMax),
  ];
  const box = {
    latMin: Math.min(...c.map((p) => p.lat)) - 0.002, latMax: Math.max(...c.map((p) => p.lat)) + 0.002,
    lonMin: Math.min(...c.map((p) => p.lon)) - 0.002, lonMax: Math.max(...c.map((p) => p.lon)) + 0.002,
  };
  const [dem, ortho] = await Promise.all([fetchDemTiles(box), fetchOrthoCanvas(box)]);

  const g0 = demElev(dem, ORIGIN.lat, ORIGIN.lon);
  if (Number.isFinite(g0)) SCENE_GROUND = g0 + GEOID;

  const tex = new THREE.CanvasTexture(ortho.cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy?.() || 4;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;

  const { xMin, xMax, zMin, zMax, seg } = GROUND;
  const geom = new THREE.PlaneGeometry(1, 1, seg, seg);
  const pos = geom.attributes.position, uv = geom.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const u = uv.getX(i), v = uv.getY(i);
    const x = xMin + v * (xMax - xMin);     // north
    const z = zMin + u * (zMax - zMin);     // east
    const geo = sceneToGeo(x, z);
    const e = demElev(dem, geo.lat, geo.lon);
    const y = Number.isFinite(e) ? e + GEOID : SCENE_GROUND;
    pos.setXYZ(i, x, y, z);
    // ortho UV: fractional tile position mapped into the stitched canvas
    const ou = (lon2t(geo.lon, ORTHO_Z) - ortho.x0) / ortho.nx;
    const ov = (lat2t(geo.lat, ORTHO_Z) - ortho.y0) / ortho.ny;
    uv.setXY(i, ou, 1 - ov);
    // fill the height lookup (regular NG×NG grid; uv is regular)
    const gi = Math.round(v * seg), gj = Math.round(u * seg);
    HZG[gi * NG + gj] = y;
  }
  pos.needsUpdate = true; uv.needsUpdate = true;
  geom.computeVertexNormals();
  groundMesh = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ map: tex }));
  groundMesh.renderOrder = -1;
  groundMesh.visible = layerVisible.ortho;
  scene.add(groundMesh);

  // patch any NaN lookup nodes from neighbours so groundYAt is always finite
  for (let i = 0; i < HZG.length; i++) if (!Number.isFinite(HZG[i])) HZG[i] = SCENE_GROUND;

  SCENE_GROUND = groundYAt(0, 0);
  controls.target.set(0, SCENE_GROUND, 0);
  camera.position.y += SCENE_GROUND - 30;
  groundReady = true;
  console.log(`[ground] terrain + aerial ready · scene ground ≈ ${SCENE_GROUND.toFixed(1)} m`);
}

function groundYAt(x, z) {
  const fi = THREE.MathUtils.clamp((x - GROUND.xMin) / (GROUND.xMax - GROUND.xMin) * GROUND.seg, 0, GROUND.seg);
  const fj = THREE.MathUtils.clamp((z - GROUND.zMin) / (GROUND.zMax - GROUND.zMin) * GROUND.seg, 0, GROUND.seg);
  const i0 = Math.floor(fi), j0 = Math.floor(fj);
  const i1 = Math.min(i0 + 1, GROUND.seg), j1 = Math.min(j0 + 1, GROUND.seg);
  const ti = fi - i0, tj = fj - j0;
  const a = HZG[i0 * NG + j0], b = HZG[i0 * NG + j1];
  const cc = HZG[i1 * NG + j0], d = HZG[i1 * NG + j1];
  return (a * (1 - tj) + b * tj) * (1 - ti) + (cc * (1 - tj) + d * tj) * ti;
}
const _sp = new THREE.Vector3();
function groundYAtGeo(lat, lon) {
  geoToScene(lat, lon, 0, _sp);
  return groundYAt(_sp.x, _sp.z);
}

// ---------------------------------------------------------------------------
// Label sprites
// ---------------------------------------------------------------------------
function labelSprite(text, bg) {
  const pad = 8, fs = 26;
  const cv = document.createElement('canvas');
  let ctx = cv.getContext('2d');
  ctx.font = `bold ${fs}px -apple-system, "Hiragino Sans", sans-serif`;
  const w = Math.ceil(ctx.measureText(text).width) + pad * 2;
  cv.width = w; cv.height = fs + pad * 2 - 4;
  ctx = cv.getContext('2d');
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.roundRect(0, 0, cv.width, cv.height, 8); ctx.fill();
  ctx.font = `bold ${fs}px -apple-system, "Hiragino Sans", sans-serif`;
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, cv.width / 2, cv.height / 2 + 1);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  s.scale.set(cv.width * 0.32, cv.height * 0.32, 1);
  s.renderOrder = 10;
  return s;
}
function cssColor(hex) { return '#' + hex.toString(16).padStart(6, '0'); }

// ---------------------------------------------------------------------------
// Click-to-follow chase cam (works for trains and bike stations)
// ---------------------------------------------------------------------------
let tracked = null; // { obj, kind, radius }
const FOLLOW_DIST = 200;
const pickRay = new THREE.Raycaster();
const highlight = new THREE.Mesh(
  new THREE.RingGeometry(1, 1.18, 40),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthTest: false }));
highlight.rotation.x = -Math.PI / 2;
highlight.renderOrder = 9;
highlight.visible = false;
scene.add(highlight);

function startTracking(obj, kind, radius) {
  tracked = { obj, kind, radius };
  highlight.visible = true;
  document.getElementById('follow').classList.add('show');
}
function stopTracking() {
  tracked = null;
  highlight.visible = false;
  document.getElementById('follow').classList.remove('show');
}

function pick(clientX, clientY) {
  const r = renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  pickRay.setFromCamera(ndc, camera);
  const targets = [];
  if (layerVisible.train) for (const t of trains) targets.push(t.obj);
  if (layerVisible.bike) for (const st of bikeStations.values()) targets.push(st.group);
  const hits = pickRay.intersectObjects(targets, true);
  if (!hits.length) return false;
  let o = hits[0].object;
  while (o && !o.userData.pick) o = o.parent;
  if (!o) return false;
  const p = o.userData.pick;
  startTracking(o, p.kind, p.radius);
  return true;
}

let downPos = null, downTime = 0;
renderer.domElement.addEventListener('pointerdown', (e) => { downPos = { x: e.clientX, y: e.clientY }; downTime = performance.now(); });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downPos) return;
  const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
  const dt = performance.now() - downTime;
  downPos = null;
  if (moved < 6 && dt < 500) { if (!pick(e.clientX, e.clientY)) stopTracking(); }
  else if (tracked) stopTracking();
});
renderer.domElement.addEventListener('wheel', () => { if (tracked) stopTracking(); }, { passive: true });

const _chasePos = new THREE.Vector3();
const _chaseAim = new THREE.Vector3();
const _delta = new THREE.Vector3();
const _offset = new THREE.Vector3();
function updateTracking(dt, now) {
  if (!tracked) return;
  const obj = tracked.obj;
  if (!obj.parent) { stopTracking(); return; }
  if (tracked.kind === 'train') {
    const fx = Math.cos(obj.rotation.y), fz = -Math.sin(obj.rotation.y);
    _chasePos.set(obj.position.x - fx * 120, obj.position.y + 42, obj.position.z - fz * 120);
    _chaseAim.set(obj.position.x + fx * 30, obj.position.y + 6, obj.position.z + fz * 30);
    const k = 1 - Math.exp(-dt * 2.2);
    camera.position.lerp(_chasePos, k);
    controls.target.lerp(_chaseAim, k);
  } else {
    const k = 1 - Math.exp(-dt * 3.5);
    _delta.copy(obj.position).sub(controls.target).multiplyScalar(k);
    controls.target.add(_delta);
    camera.position.add(_delta);
    _offset.copy(camera.position).sub(controls.target);
    const nd = THREE.MathUtils.lerp(_offset.length(), FOLLOW_DIST, 1 - Math.exp(-dt * 2));
    camera.position.copy(controls.target).addScaledVector(_offset.normalize(), nd);
  }
  const s = tracked.radius * (1 + 0.18 * Math.sin(now / 180));
  highlight.scale.set(s, s, 1);
  highlight.position.copy(obj.position);
  highlight.position.y += 0.8;
  highlight.material.opacity = 0.55 + 0.3 * Math.sin(now / 180);
}

// ---------------------------------------------------------------------------
// Live city bikes — Docomo Bike Share Tokyo docking stations with live counts
// ---------------------------------------------------------------------------
const bikeStations = new Map(); // id -> { group, label, count }
const bikeGeom = new THREE.CylinderGeometry(2.0, 2.0, 3, 10);
bikeGeom.translate(0, 1.5, 0);
const bikeMat = new THREE.MeshLambertMaterial({ color: 0xe60012 });

async function pollBikes() {
  if (!groundReady) return;
  try {
    const r = await fetch(BIKES_URL);
    const stations = (await r.json()).network.stations;
    let total = 0;
    for (const s of stations) {
      if (s.latitude < GEO_BOX.latMin || s.latitude > GEO_BOX.latMax ||
          s.longitude < GEO_BOX.lonMin || s.longitude > GEO_BOX.lonMax) continue;
      const free = s.free_bikes ?? 0;
      total += free;
      let st = bikeStations.get(s.id);
      if (!st) {
        const group = new THREE.Group();
        group.add(new THREE.Mesh(bikeGeom, bikeMat));
        group.userData.pick = { kind: 'bike', radius: 7 };
        group.visible = layerVisible.bike;
        geoToScene(s.latitude, s.longitude, 0, group.position);
        group.position.y = groundYAt(group.position.x, group.position.z);
        st = { group, label: null, count: -1 };
        bikeStations.set(s.id, st);
        scene.add(group);
      }
      if (st.count !== free) {
        st.count = free;
        if (st.label) { st.label.material.map.dispose(); st.label.material.dispose(); st.group.remove(st.label); }
        st.label = labelSprite(String(free), '#e60012');
        st.label.position.y = 8;
        st.group.add(st.label);
      }
    }
    const el = document.getElementById('n-bike'); if (el) el.textContent = total;
    setDot('dot-bike', 'on');
  } catch (e) {
    console.warn('[bikes]', e.message);
    setDot('dot-bike', 'err');
  }
}

// ---------------------------------------------------------------------------
// Trains — honest simulation running along the real surface rail centrelines
// (OSM), coloured by line. Not a live feed: labelled "sim" in the legend.
// ---------------------------------------------------------------------------
const trains = [];            // { obj, rail, s, dir, speed }
const railLineGroup = new THREE.Group();
scene.add(railLineGroup);
const railNet = { rails: [], totalLen: 0, ready: false };
const TRAIN_MAX = 22;
const _yAxis = new THREE.Vector3(0, 1, 0);

function trainModel(color) {
  const g = new THREE.Group();
  const body = new THREE.MeshLambertMaterial({ color });
  const band = new THREE.MeshLambertMaterial({ color: 0xf2f4f7 });
  const nCars = 4, carLen = 19, gap = 1.2;
  const span = nCars * carLen + (nCars - 1) * gap;
  for (let i = 0; i < nCars; i++) {
    const cx = -span / 2 + carLen / 2 + i * (carLen + gap);
    const car = new THREE.Mesh(new THREE.BoxGeometry(carLen, 3.4, 2.9), body);
    car.position.set(cx, 2.5, 0);
    const win = new THREE.Mesh(new THREE.BoxGeometry(carLen * 0.86, 0.9, 2.94), band);
    win.position.set(cx, 3.1, 0);
    g.add(car, win);
  }
  return g;
}

async function buildRails() {
  let els;
  try {
    const r = await fetch(OVERPASS, { method: 'POST', body: new URLSearchParams({ data: RAILS_Q }) });
    els = (await r.json()).elements;
  } catch (e) { console.warn('[rails]', e.message); return; }
  const pt = new THREE.Vector3();
  for (const e of els) {
    if (!e.geometry || e.geometry.length < 2) continue;
    const tg = e.tags || {};
    if (tg.tunnel && tg.tunnel !== 'no') continue;
    if (tg.layer && Number(tg.layer) < 0) continue;
    const pts = [], cum = [0];
    for (const p of e.geometry) {
      geoToScene(p.lat, p.lon, 0, pt);
      pts.push(new THREE.Vector2(pt.x, pt.z));
    }
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
    const len = cum[cum.length - 1];
    if (len < 40) continue;
    const color = railColor(tg.name);
    const rail = { pts, cum, len, color, name: tg.name || '' };
    railNet.rails.push(rail);
    railNet.totalLen += len;
    // draw the track line
    const v3 = pts.map((p) => new THREE.Vector3(p.x, groundYAt(p.x, p.y) + 0.5, p.y));
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(v3),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.5 }));
    railLineGroup.add(line);
  }
  railLineGroup.visible = layerVisible.rails;
  railNet.ready = railNet.rails.length > 0;
  console.log(`[rails] ${railNet.rails.length} segments, ${Math.round(railNet.totalLen / 1000)} km`);
  for (let i = 0; i < TRAIN_MAX; i++) spawnTrain(makeTrain());
}

function makeTrain() {
  const t = { obj: null, rail: null, s: 0, dir: 1, speed: 0 };
  trains.push(t);
  return t;
}
function spawnTrain(t) {
  if (!railNet.ready) return;
  let pick = Math.random() * railNet.totalLen;
  let rail = railNet.rails[0];
  for (const r of railNet.rails) { pick -= r.len; if (pick <= 0) { rail = r; break; } }
  if (t.obj) scene.remove(t.obj);
  t.rail = rail;
  t.obj = trainModel(rail.color);
  t.obj.userData.pick = { kind: 'train', radius: 10 };
  t.obj.visible = layerVisible.train;
  const label = labelSprite(railShortName(rail.name) || 'JR', cssColor(rail.color));
  label.position.y = 9; t.obj.add(label);
  t.s = Math.random() * rail.len;
  t.dir = Math.random() < 0.5 ? 1 : -1;
  t.speed = 14 + Math.random() * 12; // 50–94 km/h
  scene.add(t.obj);
}

const _tq = new THREE.Quaternion();
function railPose(rail, s, out) {
  const { pts, cum } = rail;
  let seg = 0;
  while (seg < cum.length - 2 && cum[seg + 1] < s) seg++;
  const t = (s - cum[seg]) / Math.max(cum[seg + 1] - cum[seg], 0.01);
  const x = THREE.MathUtils.lerp(pts[seg].x, pts[seg + 1].x, t);
  const z = THREE.MathUtils.lerp(pts[seg].y, pts[seg + 1].y, t);
  const dx = pts[seg + 1].x - pts[seg].x, dz = pts[seg + 1].y - pts[seg].y;
  out.set(x, groundYAt(x, z) + 1.4, z);
  return Math.atan2(-dz, dx);
}
const _trP = new THREE.Vector3();
function updateTrains(dt) {
  if (!railNet.ready) return;
  const hour = tokyoHour();
  const active = Math.round(TRAIN_MAX * (hour >= 5 && hour < 24 ? 1 : 0.25));
  let shown = 0;
  for (let i = 0; i < trains.length; i++) {
    const t = trains[i];
    if (!t.obj) continue;
    if (i >= active) { t.obj.visible = false; continue; }
    t.s += t.dir * t.speed * dt;
    if (t.s <= 0 || t.s >= t.rail.len) { t.dir *= -1; t.s = THREE.MathUtils.clamp(t.s, 0, t.rail.len); if (Math.random() < 0.4) { spawnTrain(t); continue; } }
    const yaw = railPose(t.rail, t.s, _trP);
    t.obj.position.copy(_trP);
    let d = yaw - t.obj.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    t.obj.rotation.y += d * Math.min(1, dt * 4);
    t.obj.visible = layerVisible.train;
    if (t.obj.visible) shown++;
  }
  const el = document.getElementById('n-train'); if (el) el.textContent = shown;
}

// ---------------------------------------------------------------------------
// Cars — flow simulation on the real main-street network (OSM centrelines,
// one-way respected). Density follows a Tokyo hour-of-day curve (no keyless
// live count feed exists). Labelled "cars · flow" in the legend.
// ---------------------------------------------------------------------------
const CAR_COLORS = [0xe9ecef, 0x1b1d21, 0x9aa1a8, 0x51606b, 0x7a2f2b,
  0x243a57, 0xcabfa8, 0x30465b, 0x555b60].map((c) => new THREE.Color(c));
const carGeom = new THREE.BoxGeometry(4.4, 1.5, 1.9);
carGeom.translate(0, 1.0, 0);
const carMesh = new THREE.InstancedMesh(carGeom, new THREE.MeshLambertMaterial(), 460);
carMesh.frustumCulled = false;
carMesh.count = 0;
scene.add(carMesh);
const CAR_MAX = 460;
const CAR_HOUR_CURVE = [
  .12, .08, .06, .05, .06, .12, .30, .55, .75, .80, .78, .80,
  .82, .80, .80, .85, .92, 1.0, .95, .82, .68, .52, .35, .20];
const carState = { roads: [], totalLen: 0, pool: [], target: 0, ready: false };
for (let i = 0; i < CAR_MAX; i++) {
  carState.pool.push({ active: false, road: null, s: 0, dir: 1, speed: 10, seg: 0 });
  carMesh.setColorAt(i, CAR_COLORS[(Math.random() * CAR_COLORS.length) | 0]);
}
if (carMesh.instanceColor) carMesh.instanceColor.needsUpdate = true;

async function buildRoads() {
  let els;
  try {
    const r = await fetch(OVERPASS, { method: 'POST', body: new URLSearchParams({ data: ROADS_Q }) });
    els = (await r.json()).elements;
  } catch (e) { console.warn('[cars]', e.message); return; }
  const pt = new THREE.Vector3();
  for (const e of els) {
    if (!e.geometry || e.geometry.length < 2) continue;
    const tg = e.tags || {};
    const pts = [], ys = [], cum = [0];
    for (const p of e.geometry) {
      geoToScene(p.lat, p.lon, 0, pt);
      pts.push(new THREE.Vector2(pt.x, pt.z));
      ys.push(groundYAt(pt.x, pt.z));
    }
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
    const len = cum[cum.length - 1];
    if (len < 25) continue;
    const oneWay = tg.oneway === 'yes' ? 1 : tg.oneway === '-1' ? -1 : 0;
    const road = { pts, ys, cum, len, oneWay };
    carState.roads.push(road);
    carState.totalLen += len;
  }
  carState.ready = carState.roads.length > 0;
  console.log(`[cars] ${carState.roads.length} main-street segments, ${Math.round(carState.totalLen / 1000)} km`);
  updateCarTarget();
}

function updateCarTarget() {
  const factor = CAR_HOUR_CURVE[tokyoHour()] ?? 0.5;
  carState.target = layerVisible.cars && carState.ready ? Math.round(CAR_MAX * factor) : 0;
}

function spawnCar(c) {
  let pick = Math.random() * carState.totalLen;
  let road = carState.roads[0];
  for (const r of carState.roads) { pick -= r.len; if (pick <= 0) { road = r; break; } }
  c.road = road;
  c.s = Math.random() * road.len;
  c.dir = road.oneWay !== 0 ? road.oneWay : (Math.random() < 0.5 ? 1 : -1);
  c.speed = 7 + Math.random() * 6;
  c.seg = 0;
  c.active = true;
}

const _carQ = new THREE.Quaternion();
const _carM = new THREE.Matrix4();
const _carP = new THREE.Vector3();
const _carS = new THREE.Vector3(1, 1, 1);
function updateCars(dt) {
  if (!carState.ready) return;
  let active = 0;
  for (const c of carState.pool) if (c.active) active++;
  if (active < carState.target) {
    for (const c of carState.pool) { if (active >= carState.target) break; if (!c.active) { spawnCar(c); active++; } }
  } else if (active > carState.target) {
    for (const c of carState.pool) { if (active <= carState.target) break; if (c.active) { c.active = false; active--; } }
  }
  let idx = 0;
  for (const c of carState.pool) {
    if (!c.active) continue;
    c.s += c.dir * c.speed * dt;
    const road = c.road;
    if (c.s <= 0 || c.s >= road.len) { spawnCar(c); }
    const { pts, ys, cum } = c.road;
    let seg = c.seg;
    while (seg < cum.length - 2 && cum[seg + 1] < c.s) seg++;
    while (seg > 0 && cum[seg] > c.s) seg--;
    c.seg = seg;
    const t = (c.s - cum[seg]) / Math.max(cum[seg + 1] - cum[seg], 0.01);
    const x = THREE.MathUtils.lerp(pts[seg].x, pts[seg + 1].x, t);
    const z = THREE.MathUtils.lerp(pts[seg].y, pts[seg + 1].y, t);
    const y = THREE.MathUtils.lerp(ys[seg], ys[seg + 1], t) + 0.2;
    const dx = (pts[seg + 1].x - pts[seg].x) * c.dir;
    const dz = (pts[seg + 1].y - pts[seg].y) * c.dir;
    _carP.set(x, y, z);
    _carQ.setFromAxisAngle(_yAxis, Math.atan2(-dz, dx));
    _carM.compose(_carP, _carQ, _carS);
    carMesh.setMatrixAt(idx++, _carM);
  }
  carMesh.count = idx;
  carMesh.instanceMatrix.needsUpdate = true;
  const el = document.getElementById('n-cars'); if (el) el.textContent = idx;
}

// ---------------------------------------------------------------------------
// People — simulated walkers around Shibuya's crossings, stations and streets.
// Not a live feed (labelled "sim"): the crowd follows the real Tokyo clock, so
// it empties overnight and floods for the evening. Two InstancedMeshes.
// Shibuya-ku holds ~230k residents and 500k+ by day; the bounded downtown here
// is represented at very roughly 1:100 by MAX_PEDS walkers.
// ---------------------------------------------------------------------------
const PED_ANCHORS = [
  { name: 'Scramble Crossing', lat: 35.6595, lon: 139.7005, r: 42, w: 4.0 },
  { name: 'Hachiko Square',    lat: 35.6590, lon: 139.7006, r: 26, w: 2.2 },
  { name: 'Shibuya Station',   lat: 35.6580, lon: 139.7016, r: 55, w: 3.0 },
  { name: 'Scramble Square',   lat: 35.6580, lon: 139.7021, r: 30, w: 1.6 },
  { name: 'Miyashita Park',    lat: 35.6615, lon: 139.7017, r: 42, w: 1.4 },
  { name: 'Takeshita St',      a: [35.6702, 139.7027], b: [35.6708, 139.7050], r: 12, w: 2.6 },
  { name: 'Harajuku Station',  lat: 35.6702, lon: 139.7028, r: 40, w: 2.0 },
  { name: 'Omotesando',        a: [35.6668, 139.7055], b: [35.6652, 139.7124], r: 16, w: 2.6 },
  { name: 'Omotesando Xing',   lat: 35.6659, lon: 139.7124, r: 34, w: 1.5 },
  { name: 'Center Gai',        a: [35.6598, 139.6988], b: [35.6612, 139.6975], r: 12, w: 3.0 },
  { name: 'Dogenzaka',         a: [35.6575, 139.6975], b: [35.6560, 139.6960], r: 12, w: 2.0 },
  { name: 'Yoyogi Park gate',  lat: 35.6700, lon: 139.6955, r: 55, w: 1.3 },
  { name: 'Ebisu Station',     lat: 35.6467, lon: 139.7100, r: 45, w: 1.6 },
  { name: 'Daikanyama',        lat: 35.6485, lon: 139.7030, r: 30, w: 1.0 },
];
const MAX_PEDS = 3000;
const PED_HOUR_CURVE = [
  .06, .04, .03, .02, .03, .08, .20, .55, .85, .80, .75, .80,
  .85, .82, .80, .82, .90, 1.0, .98, .92, .85, .70, .45, .20];
const PED_COLORS = [0x1c1e20, 0x2b2f33, 0x2c3e5c, 0x4a5568, 0x55624c,
  0x6b4f3a, 0x7d4a3a, 0x3f5a75, 0xcfc4b0, 0xb08d3f, 0xd8d2c6].map((c) => new THREE.Color(c));

function humanBodyGeometry() {
  const torso = new THREE.BoxGeometry(0.26, 0.62, 0.42); torso.translate(0, 1.16, 0);
  const legL = new THREE.BoxGeometry(0.17, 0.85, 0.15); legL.translate(0, 0.425, 0.10);
  const legR = legL.clone(); legR.translate(0, 0, -0.20);
  const armL = new THREE.BoxGeometry(0.12, 0.58, 0.10); armL.translate(0, 1.17, 0.27);
  const armR = armL.clone(); armR.translate(0, 0, -0.54);
  return mergeGeometries([torso, legL, legR, armL, armR]);
}
const pedBodyGeom = humanBodyGeometry();
const pedHeadGeom = new THREE.SphereGeometry(0.13, 6, 5); pedHeadGeom.translate(0, 1.62, 0);
const pedPhase = new Float32Array(MAX_PEDS);
for (let i = 0; i < MAX_PEDS; i++) pedPhase[i] = Math.random() * Math.PI * 2;
pedBodyGeom.setAttribute('aPhase', new THREE.InstancedBufferAttribute(pedPhase, 1));
const pedUniforms = { uTime: { value: 0 } };
const pedBodyMat = new THREE.MeshLambertMaterial();
pedBodyMat.onBeforeCompile = (shader) => {
  shader.uniforms.uTime = pedUniforms.uTime;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float aPhase;\nuniform float uTime;')
    .replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        float side = position.z > 0.0 ? 0.0 : 3.14159;
        float gait = uTime * 5.5 + aPhase;
        if (position.y < 0.9 && abs(position.z) > 0.02) {
          transformed.x += sin(gait + side) * (0.9 - position.y) * 0.5;
        } else if (abs(position.z) > 0.22) {
          transformed.x += sin(gait + side + 3.14159) * clamp(position.y - 0.85, 0.0, 0.6) * 0.45;
        }
      }`);
};
pedBodyMat.customProgramCacheKey = () => 'tokyo4d-ped';
const pedBodyMesh = new THREE.InstancedMesh(pedBodyGeom, pedBodyMat, MAX_PEDS);
const pedHeadMesh = new THREE.InstancedMesh(pedHeadGeom, new THREE.MeshLambertMaterial({ color: 0xe0bda6 }), MAX_PEDS);
pedBodyMesh.frustumCulled = pedHeadMesh.frustumCulled = false;
scene.add(pedBodyMesh, pedHeadMesh);

const peds = [];
const pedPending = [];
const _pedM = new THREE.Matrix4();
const _pedQ = new THREE.Quaternion();
const _pedP = new THREE.Vector3();
const _pedS = new THREE.Vector3();
const HIDDEN_M = new THREE.Matrix4().makeScale(0, 0, 0);

{
  const totalW = PED_ANCHORS.reduce((s, a) => s + a.w, 0);
  let i = 0;
  for (const a of PED_ANCHORS) {
    if (a.a) { a.lat = (a.a[0] + a.b[0]) / 2; a.lon = (a.a[1] + a.b[1]) / 2; }
    a.center = new THREE.Vector3();
    a.centered = false;
    a.capacity = Math.round((a.w / totalW) * MAX_PEDS);
    for (let n = 0; n < a.capacity && i < MAX_PEDS; n++, i++) {
      const scale = 0.85 + Math.random() * 0.28;
      peds.push({ anchor: a, active: false, x: 0, z: 0, y: NaN, tx: 0, tz: 0, ty: 0, yaw: 0, speed: 0.7 + Math.random() * 0.9, scale, phase: Math.random() * 7 });
      pedBodyMesh.setColorAt(i, PED_COLORS[(Math.random() * PED_COLORS.length) | 0]);
      pedBodyMesh.setMatrixAt(i, HIDDEN_M);
      pedHeadMesh.setMatrixAt(i, HIDDEN_M);
    }
  }
  if (pedBodyMesh.instanceColor) pedBodyMesh.instanceColor.needsUpdate = true;
}

const _ap = new THREE.Vector3();
function anchorPoint(a, out) {
  if (a.p1) {
    out.lerpVectors(a.p1, a.p2, Math.random());
    const ang = Math.random() * Math.PI * 2, rad = Math.random() * a.r;
    out.x += Math.cos(ang) * rad; out.z += Math.sin(ang) * rad;
  } else {
    const ang = Math.random() * Math.PI * 2, rad = Math.sqrt(Math.random()) * a.r;
    out.set(a.center.x + Math.cos(ang) * rad, 0, a.center.z + Math.sin(ang) * rad);
  }
  return out;
}
function pedRetarget(p) {
  anchorPoint(p.anchor, _ap);
  p.tx = _ap.x; p.tz = _ap.z; p.ty = groundYAt(p.tx, p.tz);
}
function updatePedCounts() {
  const factor = PED_HOUR_CURVE[tokyoHour()] ?? 0.3;
  for (const a of PED_ANCHORS) a.desired = Math.round(a.capacity * factor);
  const nA = new Map(PED_ANCHORS.map((a) => [a, 0]));
  for (const p of peds) if (p.active) nA.set(p.anchor, nA.get(p.anchor) + 1);
  peds.forEach((p, i) => {
    const n = nA.get(p.anchor);
    if (!p.active && n < p.anchor.desired && !pedPending.includes(i)) { pedPending.push(i); nA.set(p.anchor, n + 1); }
    else if (p.active && n > p.anchor.desired) { p.active = false; pedBodyMesh.setMatrixAt(i, HIDDEN_M); pedHeadMesh.setMatrixAt(i, HIDDEN_M); nA.set(p.anchor, n - 1); }
  });
  pedBodyMesh.instanceMatrix.needsUpdate = true;
  pedHeadMesh.instanceMatrix.needsUpdate = true;
  const el = document.getElementById('n-ped'); if (el) el.textContent = peds.filter((p) => p.active).length + pedPending.length;
}
function activatePendingPeds() {
  if (!groundReady) return;
  for (let n = 0; n < 12 && pedPending.length; n++) {
    const i = pedPending[0];
    const p = peds[i], a = p.anchor;
    if (!a.centered) {
      geoToScene(a.lat, a.lon, 0, a.center);
      a.center.y = groundYAt(a.center.x, a.center.z);
      if (a.a) { a.p1 = geoToScene(a.a[0], a.a[1], 0, new THREE.Vector3()); a.p2 = geoToScene(a.b[0], a.b[1], 0, new THREE.Vector3()); }
      a.centered = true;
    }
    pedPending.shift();
    anchorPoint(a, _ap);
    p.x = _ap.x; p.z = _ap.z; p.y = groundYAt(p.x, p.z);
    pedRetarget(p);
    p.active = true;
  }
}
function updatePeds(dt, now) {
  activatePendingPeds();
  if (!layerVisible.ped) return;
  pedUniforms.uTime.value = now / 1000;
  let dirty = false;
  for (let i = 0; i < peds.length; i++) {
    const p = peds[i];
    if (!p.active) continue;
    const dx = p.tx - p.x, dz = p.tz - p.z, dist = Math.hypot(dx, dz);
    if (dist < 0.8) pedRetarget(p);
    else {
      const step = Math.min(p.speed * dt, dist);
      p.x += (dx / dist) * step; p.z += (dz / dist) * step;
      p.y += (p.ty - p.y) * Math.min(1, dt * 2);
      p.yaw = Math.atan2(-dz, dx);
    }
    const bob = 1 + 0.012 * Math.sin(now / 90 + p.phase);
    _pedP.set(p.x, p.y, p.z);
    _pedQ.setFromAxisAngle(_yAxis, p.yaw);
    _pedS.set(p.scale, p.scale * bob, p.scale);
    _pedM.compose(_pedP, _pedQ, _pedS);
    pedBodyMesh.setMatrixAt(i, _pedM);
    pedHeadMesh.setMatrixAt(i, _pedM);
    dirty = true;
  }
  if (dirty) { pedBodyMesh.instanceMatrix.needsUpdate = true; pedHeadMesh.instanceMatrix.needsUpdate = true; }
}

// ---------------------------------------------------------------------------
// Weather (Open-Meteo) + the real sun on the Tokyo clock — the honest 4th D
// ---------------------------------------------------------------------------
let weather = null;
function tokyoHour() {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tokyo', hour: 'numeric', hour12: false }).format(new Date()));
}
function tokyoMonth() {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tokyo', month: 'numeric' }).format(new Date()));
}
function sunPosition(date, latDeg, lonDeg) {
  const rad = Math.PI / 180;
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  const doy = (date.getTime() - start) / 86400000 + 1;
  const decl = -23.44 * rad * Math.cos((2 * Math.PI / 365) * (doy + 10));
  const utcH = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const H = ((utcH + lonDeg / 15) - 12) * 15 * rad;
  const lat = latDeg * rad;
  const el = Math.asin(Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(H));
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(lat) - Math.tan(decl) * Math.cos(lat)) + Math.PI;
  return { az, el };
}
function applySky() {
  const cloud = weather ? weather.cloud_cover / 100 : 0.3;
  const { az, el } = sunPosition(new Date(), ORIGIN.lat, ORIGIN.lon);
  const cosEl = Math.cos(el);
  sun.position.set(cosEl * Math.cos(az), Math.sin(el), cosEl * Math.sin(az)).multiplyScalar(1500);
  const day = THREE.MathUtils.clamp(Math.sin(el) * 4, 0, 1);
  sun.intensity = (1.75 - 1.0 * cloud) * day;
  hemi.intensity = 0.32 + 0.85 * day * (1 - 0.35 * cloud);
  const skyDay = PALETTE.skyClear.clone().lerp(PALETTE.skyOvercast, cloud);
  const sky = PALETTE.skyNight.clone().lerp(skyDay, day);
  scene.background.copy(sky);
  scene.fog.color.copy(sky);
  scene.fog.density = 0.00009 * (1 + 1.6 * cloud);
}
async function pollWeather() {
  try {
    const r = await fetch(WEATHER_URL);
    weather = (await r.json()).current;
    const el = document.getElementById('wx');
    if (el) el.textContent = `${Math.round(weather.temperature_2m)}°C · ${Math.round(weather.wind_speed_10m)} m/s · cloud ${weather.cloud_cover}%`;
    setDot('dot-wx', 'on');
    applySky();
  } catch (e) { console.warn('[weather]', e.message); setDot('dot-wx', 'err'); }
}
function tickClock() {
  const el = document.getElementById('clock');
  if (el) el.textContent = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date());
}

// ---------------------------------------------------------------------------
// City sound — procedural, honest: traffic/crowd rumble that follows how much
// is moving near the camera, wind that grows with altitude, and a summer
// cicada shimmer that only sings in daytime (it is July in the demo clock).
// ---------------------------------------------------------------------------
const audio = { ctx: null, master: null, rumble: null, wind: null, cicada: null, muted: false, lastSet: 0 };
function noiseBuffer(ctx, brown) {
  const len = ctx.sampleRate * 4;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
  }
  return buf;
}
function initAudio() {
  if (audio.ctx) return;
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  audio.ctx = ctx;
  audio.master = ctx.createGain();
  audio.master.gain.value = 0.7;
  audio.master.connect(ctx.destination);
  const mkLoop = (brown, type, freq, q, gain0) => {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, brown); src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; if (q) f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = gain0;
    src.connect(f).connect(g).connect(audio.master); src.start();
    return g;
  };
  audio.rumble = mkLoop(true, 'lowpass', 230, 0, 0.0);
  audio.wind = mkLoop(false, 'bandpass', 1200, 0.7, 0.0);
  // cicada: narrow band-passed noise with a fast tremolo
  audio.cicada = mkLoop(false, 'bandpass', 4800, 8, 0.0);
  const lfo = ctx.createOscillator(); lfo.type = 'sawtooth'; lfo.frequency.value = 34;
  const lfoG = ctx.createGain(); lfoG.gain.value = 0.5;
  lfo.connect(lfoG).connect(audio.cicada.gain); lfo.start();
  updateAudioChip();
}
function updateAudio(dt, now) {
  if (!audio.ctx || audio.muted || now - audio.lastSet < 400) return;
  audio.lastSet = now;
  let activity = 0;
  const cx = camera.position.x, cz = camera.position.z;
  for (const t of trains) if (t.obj && t.obj.visible) { const dx = t.obj.position.x - cx, dz = t.obj.position.z - cz; if (dx * dx + dz * dz < 700 * 700) activity += 2; }
  activity += carMesh.count * 0.2;
  let pedNear = 0;
  for (let i = 0; i < peds.length; i += 7) { const p = peds[i]; if (p.active) { const dx = p.x - cx, dz = p.z - cz; if (dx * dx + dz * dz < 400 * 400) pedNear++; } }
  activity += pedNear * 0.5;
  const alt = camera.position.y - SCENE_GROUND;
  const altFactor = THREE.MathUtils.clamp(1 - (alt - 30) / 900, 0.12, 1);
  const t = audio.ctx.currentTime;
  audio.rumble.gain.setTargetAtTime(Math.min(0.05 + activity * 0.004, 0.24) * altFactor, t, 0.4);
  audio.wind.gain.setTargetAtTime(0.012 + THREE.MathUtils.clamp(alt / 2600, 0, 1) * 0.04, t, 0.6);
  const { el } = sunPosition(new Date(), ORIGIN.lat, ORIGIN.lon);
  const summer = tokyoMonth() >= 6 && tokyoMonth() <= 9;
  const cicadaOn = summer && el > 0.05 ? THREE.MathUtils.clamp(altFactor, 0.15, 1) : 0;
  audio.cicada.gain.setTargetAtTime(0.02 * cicadaOn, t, 1.2);
}
function updateAudioChip() {
  const el = document.getElementById('audiochip');
  if (!el) return;
  el.textContent = audio.ctx ? (audio.muted ? 'sound off' : 'sound on') : 'sound';
  el.classList.toggle('off', !audio.ctx || audio.muted);
}
document.getElementById('audiochip')?.addEventListener('click', (e) => {
  e.stopPropagation();
  initAudio(); audio.ctx.resume();
  audio.muted = !audio.muted;
  audio.master.gain.value = audio.muted ? 0 : 0.7;
  updateAudioChip();
});
addEventListener('pointerdown', () => { initAudio(); audio.ctx.resume(); }, { once: true });

// ---------------------------------------------------------------------------
// Legend / layer control
// ---------------------------------------------------------------------------
function setDot(id, state) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('on', 'err');
  if (state) el.classList.add(state);
}
let shinjukuTiles = null;
function applyLayerVisibility(kind) {
  const on = layerVisible[kind];
  if (kind === 'ped') { pedBodyMesh.visible = pedHeadMesh.visible = on; }
  else if (kind === 'cars') { carMesh.visible = on; updateCarTarget(); }
  else if (kind === 'bike') { for (const st of bikeStations.values()) st.group.visible = on; }
  else if (kind === 'train') { for (const t of trains) if (t.obj) t.obj.visible = on; }
  else if (kind === 'rails') { railLineGroup.visible = on; }
  else if (kind === 'ortho') { if (groundMesh) groundMesh.visible = on; }
  else if (kind === 'shinjuku') {
    if (on && !shinjukuTiles) { shinjukuTiles = makeTileset(SHINJUKU_TILESET, { optional: true, cap: 300 }); tilesets.push(shinjukuTiles); }
    if (shinjukuTiles) shinjukuTiles.group.visible = on;
  }
  if (!on && tracked && ((tracked.kind === 'train' && kind === 'train') || (tracked.kind === 'bike' && kind === 'bike'))) stopTracking();
}
document.getElementById('legend').addEventListener('click', (e) => {
  const hdr = e.target.closest('.ghdr');
  if (hdr) { hdr.parentElement.classList.toggle('collapsed'); updateGroupSums(); return; }
  const row = e.target.closest('[data-kind]');
  if (!row) return;
  const kind = row.dataset.kind;
  layerVisible[kind] = !layerVisible[kind];
  row.classList.toggle('off', !layerVisible[kind]);
  applyLayerVisibility(kind);
});
function updateGroupSums() {
  const num = (id) => Number(document.getElementById(id)?.textContent) || 0;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('sum-live', num('n-bike'));
  set('sum-move', num('n-train') + num('n-cars') + num('n-ped'));
  const mapOn = ['ortho', 'rails', 'shinjuku'].filter((k) => layerVisible[k]).length;
  set('sum-map', `${mapOn} on`);
}
setInterval(updateGroupSums, 2000);

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
function clampCamera() {
  const t = controls.target;
  t.x = THREE.MathUtils.clamp(t.x, BOUNDS.south, BOUNDS.north);
  t.z = THREE.MathUtils.clamp(t.z, BOUNDS.west, BOUNDS.east);
  t.y = THREE.MathUtils.clamp(t.y, SCENE_GROUND - 10, SCENE_GROUND + 320);
  const minY = SCENE_GROUND + (tracked && tracked.kind === 'train' ? 6 : BOUNDS.minY);
  camera.position.y = THREE.MathUtils.clamp(camera.position.y, minY, SCENE_GROUND + BOUNDS.maxY);
}

const clock = new THREE.Clock();
function tick() {
  const dt = Math.min(clock.getDelta(), 0.1);
  const now = performance.now();
  controls.update();
  updateTracking(dt, now);
  clampCamera();
  updateTrains(dt);
  updateCars(dt);
  updatePeds(dt, now);
  updateAudio(dt, now);
  camera.updateMatrixWorld();
  for (const t of tilesets) { if (!t.optional || layerVisible.shinjuku) t.update(); }
  renderer.render(scene, camera);
}
let lastRAF = 0;
function animate() { lastRAF = performance.now(); tick(); requestAnimationFrame(animate); }
animate();
setInterval(() => { if (performance.now() - lastRAF > 500) tick(); }, 250);
window.__dbg.tick = tick;
window.__dbg.groundYAt = groundYAt;

function applySize() {
  if (!innerWidth || !innerHeight) { requestAnimationFrame(applySize); return; }
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  for (const t of tilesets) t.setResolutionFromRenderer(camera, renderer);
}
addEventListener('resize', applySize);

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
buildGround().then(() => {
  buildRoads().catch((e) => console.warn('[cars]', e.message));
  buildRails().catch((e) => console.warn('[rails]', e.message));
  pollBikes();
}).catch((e) => console.error('[ground] failed', e));

setInterval(pollBikes, 60_000);
pollWeather();
setInterval(pollWeather, 600_000);
setInterval(applySky, 60_000);
tickClock();
setInterval(tickClock, 1000);
updatePedCounts();
setInterval(updatePedCounts, 60_000);
setInterval(updateCarTarget, 60_000);
applySize();
applySky();
