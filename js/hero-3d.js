/* Boring Bee Co. hero: the two jars in 3D.
   Loaded by js/hero-tier.js (which picks desktop / phone / older phone / photos). The photos in index.html are the
   first paint and the fallback; this fades in over them, then floats, flings, tumbles (tennis-racket flip), sloshes
   and drifts home. Colours come from the design tokens in css/styles.css (the --j3-* group and the palette). */
import * as THREE from './vendor/three.module.min.js';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';

// design tokens -> colours (raw colours live only in the token block of css/styles.css)
const TOKENS = getComputedStyle(document.documentElement);
const tok = (name) => TOKENS.getPropertyValue(name).trim();

// ---------- how much this device gets (the tier check is at the top of index.html) ----------
const BB = window.BB;
if (BB.tier === 'phone' && BB.lowBattery && !BB.forced) { BB.tier = 'lite'; BB.why.push('battery under 20%'); BB.updatePill(); }
let TIER = BB.tier;                                  // 'full' | 'phone' | 'lite'
const QUALITY = {
  full:  { dpr: 1.75, volStep: 0.12, substeps: 4, bubbles: 1.0,  label: 'images/label.webp',    halfRateIdle: false, halfRate: false },
  phone: { dpr: 1.5,  volStep: 0.15, substeps: 4, bubbles: 0.7,  label: 'images/label-sm.webp', halfRateIdle: true,  halfRate: false },
  lite:  { dpr: 1.25, volStep: 0.2,  substeps: 2, bubbles: 0.35, label: 'images/label-sm.webp', halfRateIdle: true,  halfRate: true },
};
let Q = QUALITY[TIER];
const TOUCHY = BB.touch || BB.emulateTouch;

const stage = document.getElementById('stage');
const canvas = document.getElementById('gl');
const jarSlot = document.getElementById('jarSlot');
const subEl = stage.querySelector('.sub');
const barEl = document.querySelector('.bar');
const toast = document.getElementById('toast');
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

const BG = new THREE.Color(tok('--cream'));
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: TIER === 'full' ? 'default' : 'low-power' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, Q.dpr));
renderer.setClearColor(BG, 1);
renderer.localClippingEnabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const FOV = 22;
const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 400);

function buildEnvironment() {
  const pmrem = new THREE.PMREMGenerator(renderer);
  let env;
  const room = new RoomEnvironment(renderer);
  env = pmrem.fromScene(room, 0.04).texture;
  room.dispose && room.dispose();
  pmrem.dispose();
  return env;
}
scene.environment = buildEnvironment();
// A product-photo studio, used only by the shiny parts (glass reflections, the cap), lit like the hero shots:
// one big soft box front-left (the broad streak down the left side), a weaker one front-right, a strip overhead
// (the line across the top of the shoulder) and a low fill so the cap stays white. Nothing behind the jars, so the
// glass no longer traces its own outline. Honey and label keep the softer room light, so their colours stay.
function buildStudio() {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const s = new THREE.Scene();
  const room = new THREE.Color(tok('--j3-studio-room')), light = new THREE.Color(tok('--j3-studio-light'));
  s.add(new THREE.Mesh(new THREE.BoxGeometry(24, 14, 24), new THREE.MeshBasicMaterial({ color: room, side: THREE.BackSide })));
  const softbox = (w, h, x, y, z, k) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: light.clone().multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); s.add(m);
  };
  softbox(3.4, 8, -5.4, 1.4, 6.0, 5.5); // big soft box front-left: the one broad streak
  softbox(2.4, 7, 5.8, 0.8, 5.2, 1.4);  // weaker front-right
  softbox(7, 2.2, 0, 6.6, 3.2, 3.0);    // strip overhead, toward the front: shoulder line, cap top
  softbox(6, 3, 0, -5, 7, 0.8);         // low front fill: keeps the cap white
  const env = pmrem.fromScene(s, 0.01).texture;
  pmrem.dispose();
  return env;
}
const studioEnv = buildStudio();
scene.add(new THREE.HemisphereLight(tok('--j3-light-sky'), tok('--j3-light-ground'), 0.35));
const key = new THREE.DirectionalLight(tok('--j3-light-key'), 1.0); key.position.set(-3, 4, 6); scene.add(key);
const rim = new THREE.DirectionalLight(tok('--j3-light-rim'), 0.55); rim.position.set(4, 3, -5); scene.add(rim);

// =================== the approved jar (same build as the jar demo) ===================
// Real Classic Queenline 16oz: 3 5/16" wide x 2 1/16" deep x 5 9/16" tall.
// Silhouette traced from the WebstaurantStore studio photo of the empty jar.
const A = 1.0;
// Approved shape (traced Queenline, a hair taller), with the clear neck under the lid cut down.
const H_TRACE = 2 * A / 0.545;
const SH0 = 0.61 * H_TRACE, SH1 = 0.865 * H_TRACE, LID0 = 0.922 * H_TRACE;
const SHOULDER_SQUASH = 1.0;    // shoulder exactly as traced (the approved shape)
const NECK_SHOW = 0.15;         // neck finish under the cap (~6mm): thread ridge, glass lip (bead), neck, then the shoulder
function squashY(y) {
  if (y <= SH0) return y;
  if (y <= SH1) return SH0 + (y - SH0) * SHOULDER_SQUASH;
  const s1 = SH0 + (SH1 - SH0) * SHOULDER_SQUASH;
  if (y <= LID0) return s1 + (y - SH1) * NECK_SHOW / (LID0 - SH1);
  return s1 + NECK_SHOW + (y - LID0);
}
const H = squashY(H_TRACE);
const yT = (tTrace) => squashY(tTrace * H_TRACE) / H;   // traced height fraction -> this jar's
const DEPTH_RATIO = 0.62;       // 2 1/16 / 3 5/16: flat, not chubby
const N_BODY = 3.0;             // rounded-rectangle cross-section (2 = plain oval)
const NECK_R = 0.66 * A;        // neck finish ~66% of the body width, as in the hero shots
const LID_R = 0.715 * A;        // cap band ~71% of the body width (the curl flares to ~74%)
const LID_Y0 = yT(0.922);       // lid wraps the neck, bottom edge here (~13mm tall cap)
const LID_TOP = 0.055;          // cap height ~0.24 of its width, as in the photos
const TOTAL_H = H + LID_TOP;
const GLASS_IN = 0.988;         // honey sits inside a thin glass wall

const PROFILE_TRACE = [
  [0.000, 0.55], [0.008, 0.68], [0.020, 0.76], [0.040, 0.81], [0.070, 0.85],
  [0.110, 0.885], [0.140, 0.915], [0.180, 0.94], [0.220, 0.97], [0.280, 0.99],
  [0.320, 1.00], [0.480, 1.00], [0.530, 0.98], [0.570, 0.96], [0.610, 0.935],
  [0.650, 0.90], [0.690, 0.85], [0.730, 0.81], [0.775, 0.745], [0.800, 0.728],
  [0.815, 0.715], [0.830, 0.701], [0.845, 0.688], [0.855, 0.678], [0.865, 0.670], [0.875, 0.664], [0.885, 0.666],
  [0.893, 0.676], [0.899, 0.703], [0.905, 0.712], [0.910, 0.702], [0.913, 0.684],   // glass lip (bead)
  [0.917, 0.696], [0.920, 0.690], [0.922, 0.684],                                    // thread ridge, just under the cap
  [0.940, 0.672], [0.960, 0.672], [0.975, 0.672], [0.990, 0.63], [1.000, 0.58]
];
const PROFILE = PROFILE_TRACE.map(([t, w]) => [yT(t), w]);
const profileFn = (() => {
  const xs = PROFILE.map(p => p[0]), ys = PROFILE.map(p => p[1]);
  const n = xs.length, d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); m[i] = k * a * d[i]; m[i + 1] = k * b * d[i]; }
  }
  return (t) => {
    t = Math.min(1, Math.max(0, t));
    let i = 0; while (i < n - 2 && t > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], s = (t - xs[i]) / h;
    const h00 = 2 * s ** 3 - 3 * s ** 2 + 1, h10 = s ** 3 - 2 * s ** 2 + s, h01 = -2 * s ** 3 + 3 * s ** 2, h11 = s ** 3 - s ** 2;
    return h00 * ys[i] + h10 * h * m[i] + h01 * ys[i + 1] + h11 * h * m[i + 1];
  };
})();
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp = THREE.MathUtils.clamp;

function section(t) {
  const hw = profileFn(t) * A;
  const flat = DEPTH_RATIO * hw;
  // above mid-body the narrow sides run nearly straight up into the round neck
  const capped = Math.min(hw, NECK_R);
  const k = 0.02;
  const smax = (flat + capped + Math.sqrt((flat - capped) ** 2 + k * k)) / 2;
  const hd = Math.min(hw, flat + (smax - flat) * smoothstep(yT(0.5), yT(0.62), t));
  const n = N_BODY - (N_BODY - 2) * smoothstep(yT(0.80), yT(0.865), t);
  return { hw, hd, n };
}
function superPoint(phi, hw, hd, n) {
  const c = Math.cos(phi), s = Math.sin(phi);
  const x = hw * Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
  const z = hd * Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
  let gx = Math.sign(x) * Math.pow(Math.abs(x / hw), n - 1) / hw;
  let gz = Math.sign(z) * Math.pow(Math.abs(z / hd), n - 1) / hd;
  const gl = Math.hypot(gx, gz) || 1;
  return { x, z, nx: gx / gl, nz: gz / gl };
}
const RIB_T0 = yT(0.08), RIB_T1 = yT(0.77), RIB_COUNT = 9, RIB_AMP = 0.017 * A;   // ~0.7x the old depth, as in the photos
function ribOffset(t, nx) {
  const band = smoothstep(RIB_T0, RIB_T0 + 0.04, t) * (1 - smoothstep(RIB_T1 - 0.04, RIB_T1, t));
  if (band <= 0) return 0;
  const side = smoothstep(0.6, 0.92, Math.abs(nx));
  if (side <= 0) return 0;
  const phase = (t - RIB_T0) / (RIB_T1 - RIB_T0) * RIB_COUNT;
  return RIB_AMP * Math.pow(Math.abs(Math.sin(Math.PI * phase)), 0.6) * band * side;
}

function buildRingSurface(rings, N, vs, seam = false) {
  const M = rings.length, C = seam ? N + 1 : N;   // seam: one extra column at u = 1 so a texture can wrap cleanly
  const pos = new Float32Array(M * C * 3);
  for (let j = 0; j < M; j++) for (let i = 0; i < C; i++) {
    const p = rings[j]((i / N) * Math.PI * 2);
    pos.set([p.x, p.y, p.z], (j * C + i) * 3);
  }
  const P = (i, j) => { i = (i + N) % N; j = Math.max(0, Math.min(M - 1, j)); const k = (j * C + i) * 3; return new THREE.Vector3(pos[k], pos[k + 1], pos[k + 2]); };
  const nor = new Float32Array(M * C * 3);
  const midY = (P(0, 0).y + P(0, M - 1).y) / 2;
  for (let j = 0; j < M; j++) for (let i = 0; i < C; i++) {
    const du = P(i + 1, j).sub(P(i - 1, j));
    const dv = P(i, j + 1).sub(P(i, j - 1));
    let nv = new THREE.Vector3().crossVectors(dv, du);
    if (du.lengthSq() < 1e-10 || nv.lengthSq() < 1e-12) nv.set(0, P(i, j).y < midY ? -1 : 1, 0);
    nv.normalize();
    nor.set([nv.x, nv.y, nv.z], (j * C + i) * 3);
  }
  const idx = [];
  for (let j = 0; j < M - 1; j++) for (let i = 0; i < N; i++) {
    const i1 = seam ? i + 1 : (i + 1) % N;
    const a = j * C + i, b = (j + 1) * C + i, c = j * C + i1, d = (j + 1) * C + i1;
    idx.push(a, b, c, c, b, d);
  }
  const uv = new Float32Array(M * C * 2);
  for (let j = 0; j < M; j++) for (let i = 0; i < C; i++) uv.set([i / N, vs ? vs[j] : j / (M - 1)], (j * C + i) * 2);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  return geo;
}
function jarRings({ t0 = 0, t1 = 1, inset = 1, yBottom = 0, steps = 130, dome = 0 }) {
  const rings = [];
  const ringAt = (t, scale, yOverride) => (phi) => {
    const { hw, hd, n } = section(t);
    const p = superPoint(phi, hw * inset, hd * inset, n);
    const r = scale === 1 ? ribOffset(t, p.nx) * inset : 0;
    return new THREE.Vector3((p.x * scale) + p.nx * r, yOverride ?? t * H, (p.z * scale) + p.nz * r);
  };
  // the base: centre pushed up into the jar by `dome`, easing down to a resting ring near the edge
  for (const [s, f] of [[0, 1], [0.3, 0.93], [0.52, 0.74], [0.7, 0.42], [0.82, 0.14], [0.89, 0.03], [0.95, 0]]) rings.push(ringAt(t0, s, yBottom + dome * f));
  const ts = [];
  for (let k = 0; k <= steps; k++) ts.push(t0 + (t1 - t0) * (k / steps));
  for (let t = yT(0.86); t < yT(0.93); t += 0.004 / H) if (t > t0 && t < t1) ts.push(t);   // the neck lip needs fine rings
  ts.sort((a, b) => a - b);
  ts.forEach((t, k) => { if (k === 0 || t - ts[k - 1] > 1e-6) rings.push(ringAt(t, 1, k === 0 ? yBottom : undefined)); });
  for (const s of [0.92, 0.6, 0.25, 0]) rings.push(ringAt(t1, s));
  return rings;
}

const LID_RIB = { v0: 0, v1: 0, count: 120 };   // where along the cap's profile the ribs run (filled in below)
function lidGeometry() {
  const y0 = LID_Y0 * H, y1 = H + LID_TOP, hc = y1 - y0;
  const key = [
    [NECK_R * 1.0, y0 + 0.05 * hc], [LID_R * 0.975, y0],                               // tucked under, onto the glass
    [LID_R * 1.028, y0 + 0.03 * hc], [LID_R * 1.035, y0 + 0.09 * hc],                 // rolled bottom curl, flared
    [LID_R * 1.012, y0 + 0.15 * hc], [LID_R * 1.0, y0 + 0.20 * hc],
    [LID_R * 1.006, y0 + 0.38 * hc], [LID_R * 0.996, y0 + 0.55 * hc],                // smooth band, gently barrelled
    [LID_R * 0.984, y0 + 0.60 * hc],                                                  // small waist
    [LID_R * 0.998, y0 + 0.64 * hc], [LID_R * 1.0, y0 + 0.89 * hc],                  // ribbed band (top third)
    [LID_R * 0.984, y0 + 0.955 * hc], [LID_R * 0.952, y0 + 0.99 * hc], [LID_R * 0.915, y1],   // soft rounded crown
    [LID_R * 0.885, y1 - 0.005], [LID_R * 0.866, y1 - 0.014],                         // down the inner wall
    [LID_R * 0.8, y1 - 0.02], [LID_R * 0.5, y1 - 0.025], [0, y1 - 0.028]              // dished top panel
  ];
  const RIB_K = 9;
  const pts = [], keyIdx = [];
  for (let k = 0; k < key.length - 1; k++) {
    const [r0, ya] = key[k], [r1, yb] = key[k + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(r1 - r0, yb - ya) / 0.008));
    keyIdx[k] = pts.length;
    for (let q = 0; q < n; q++) { const f = q / n; pts.push([r0 + (r1 - r0) * f, ya + (yb - ya) * f]); }
  }
  keyIdx[key.length - 1] = pts.length;
  pts.push(key[key.length - 1]);
  const vs = [0];
  for (let k = 1; k < pts.length; k++) vs.push(vs[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  const total = vs[vs.length - 1];
  LID_RIB.v0 = vs[keyIdx[RIB_K]] / total; LID_RIB.v1 = vs[keyIdx[RIB_K + 1]] / total;
  const rings = pts.map(([r, y]) => (phi) => new THREE.Vector3(Math.cos(phi) * r, y, Math.sin(phi) * r));
  return buildRingSurface(rings, 360, vs.map(v => v / total), true);
}

// label keeps its true proportions even though the jar got taller
const LABEL_X = 0.745, LABEL_H = 2 * 0.745 / 0.666, LABEL_TC = 0.41;  // label art is 0.666 wide:tall; ~6% bigger and lower, like the photos
const LABEL_T0 = LABEL_TC - LABEL_H / 2 / H, LABEL_T1 = LABEL_TC + LABEL_H / 2 / H;
function labelGeometry() {
  const nx = 40, ny = 60, pos = [], uv = [], idx = [];
  for (let j = 0; j <= ny; j++) {
    const v = j / ny, t = LABEL_T0 + (LABEL_T1 - LABEL_T0) * v;
    const { hw, hd, n } = section(t);
    for (let i = 0; i <= nx; i++) {
      const u = i / nx;
      const x = (u * 2 - 1) * LABEL_X * A;
      const xr = Math.min(Math.abs(x) / hw, 0.999);
      const z = hd * Math.pow(1 - Math.pow(xr, n), 1 / n);
      let gx = Math.sign(x) * Math.pow(xr, n - 1) / hw, gz = Math.pow(z / hd, n - 1) / hd;
      const gl = Math.hypot(gx, gz) || 1; gx /= gl; gz /= gl;
      const off = 0.012 * A;
      pos.push(x + gx * off, t * H, z + gz * off);
      uv.push(u, v);
    }
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + nx + 1;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// ---------- honeycomb: a big chunk cut to fit the jar, rough natural edges, cells at real size (~5mm) ----------
// As in the real comb jar: it fills most of the jar (shoulder to near the base, close to both side walls) and
// sits just behind the front glass, so its cells read crisply through a thin layer of honey.
const COMB_D = 0.24 * A, COMB_ZF = 0.40;              // thickness; its front face ~0.2 behind the front glass
const CELL = 0.1;                                     // flat-to-flat cell width (~4.2mm; the honey in front magnifies it to the photos' look)
const WAX = tok('--j3-wax'), WAX_DARK = tok('--j3-wax-dark');
const BUMP_HI = tok('--j3-white'), BUMP_LO = tok('--j3-black'), BUMP_CAP = tok('--j3-bump-cap'), BUMP_CELL = tok('--j3-bump-cell'), BUMP_CUT = tok('--j3-bump-cut');
const COMB = (() => {
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const yb = 0.11 * TOTAL_H, yt = yT(0.82) * H;
  const ph = [0, 1, 2, 3, 4, 5].map(() => rnd() * 6.28);
  const jag = (u, k) => 0.035 + 0.022 * Math.sin(u * 7.3 + ph[k]) + 0.012 * Math.sin(u * 19.1 + ph[k + 1]) + (rnd() < 0.08 ? 0.05 * rnd() : 0);
  const xmax = (y) => {                                 // widest the comb can be at this height, at its front face
    const { hw, hd, n } = section(y / H);
    const a = hw * GLASS_IN, b = hd * GLASS_IN;
    if (COMB_ZF >= b) return 0.05;
    return Math.min(0.86, a * Math.pow(1 - Math.pow(COMB_ZF / b, n), 1 / n) * 0.94 - 0.03);
  };
  const pts = [], NS = 34;
  for (let i = 0; i <= NS; i++) { const y = yb + (yt - yb) * i / NS; pts.push([xmax(y) - jag(y, 0), y]); }          // right edge, up
  const xr = pts[pts.length - 1][0], xl = -(xmax(yt) - jag(yt, 2));
  for (let i = 1; i < 14; i++) { const x = xr + (xl - xr) * i / 14; pts.push([x, yt - jag(x * 3, 2) - 0.02]); }     // ragged top
  for (let i = NS; i >= 0; i--) { const y = yb + (yt - yb) * i / NS; pts.push([-(xmax(y) - jag(y, 4)), y]); }       // left edge, down
  const xl0 = pts[pts.length - 1][0], xr0 = pts[0][0];
  for (let i = 1; i < 12; i++) { const x = xl0 + (xr0 - xl0) * i / 12; pts.push([x, yb + jag(x * 3, 1) * 0.8]); }    // ragged bottom
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const box = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  // a soft mask of the outline, so the honey knows where it is thin (in front of the comb)
  const mc = document.createElement('canvas'); mc.width = mc.height = 256;
  const mg = mc.getContext('2d'); mg.fillStyle = BUMP_LO; mg.fillRect(0, 0, 256, 256);
  mg.filter = 'blur(6px)'; mg.fillStyle = BUMP_HI; mg.beginPath();
  pts.forEach(([x, y], i) => { const u = (x - box.x0) / (box.x1 - box.x0) * 256, v = (1 - (y - box.y0) / (box.y1 - box.y0)) * 256; i ? mg.lineTo(u, v) : mg.moveTo(u, v); });
  mg.closePath(); mg.fill();
  const mask = new THREE.CanvasTexture(mc);
  return { pts, box, mask, boxV: new THREE.Vector4(box.x0, box.y0, box.x1, box.y1), zV: new THREE.Vector2(COMB_ZF, COMB_ZF - COMB_D) };
})();
function faceCanvas(wWorld, hWorld, pxPerWorld) {
  const c = document.createElement('canvas');
  c.width = Math.max(8, Math.round(wWorld * pxPerWorld)); c.height = Math.max(8, Math.round(hWorld * pxPerWorld));
  const b = document.createElement('canvas'); b.width = c.width; b.height = c.height;
  return { c, g: c.getContext('2d'), b, gb: b.getContext('2d') };
}
function texPair(f) {
  const map = new THREE.CanvasTexture(f.c); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
  const bump = new THREE.CanvasTexture(f.b);
  return { map, bump };
}
const PXW = TIER === 'full' ? 600 : 420;
function combFrontTex() {          // looking into the cells: pale wax walls, darker honey in the cells, a few capped
  const bw = COMB.box.x1 - COMB.box.x0, bh = COMB.box.y1 - COMB.box.y0;
  const f = faceCanvas(bw, bh, PXW), { g, gb } = f, W = f.c.width, Hh = f.c.height;
  g.fillStyle = WAX; g.fillRect(0, 0, W, Hh); gb.fillStyle = BUMP_HI; gb.fillRect(0, 0, W, Hh);
  const w = CELL * PXW, r = w / Math.sqrt(3), pitch = 1.5 * r, wall = w * 0.11;
  const hex = (ctx, cx, cy, rad) => { ctx.beginPath(); for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad); } ctx.closePath(); };
  for (let row = -1; row * pitch < Hh + r; row++) for (let col = -1; col * w < W + w; col++) {
    const cx = col * w + (row % 2 ? w / 2 : 0) + 0.3 * w, cy = row * pitch + 0.4 * r;
    const capped = cy < Hh * 0.12 ? Math.random() < 0.6 : Math.random() < 0.04;
    hex(g, cx, cy, r - wall);
    if (capped) {
      const cg = g.createRadialGradient(cx - r * 0.2, cy - r * 0.25, r * 0.1, cx, cy, r);
      cg.addColorStop(0, tok('--j3-cap-hi')); cg.addColorStop(1, tok('--j3-cap-lo'));
      g.fillStyle = cg; g.fill();
    } else {
      const cg = g.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
      cg.addColorStop(0, tok('--j3-cell-deep')); cg.addColorStop(0.7, tok('--j3-cell-mid')); cg.addColorStop(1, tok('--j3-cell-rim'));
      g.fillStyle = cg; g.fill();
      g.fillStyle = tok('--j3-cell-shine');            // glossy honey meniscus in each cell
      g.beginPath(); g.ellipse(cx - r * 0.28, cy - r * 0.3, r * 0.2, r * 0.1, -0.6, 0, Math.PI * 2); g.fill();
    }
    hex(gb, cx, cy, r - wall); gb.fillStyle = capped ? BUMP_CAP : BUMP_CELL; gb.fill();
  }
  return texPair(f);
}
function combSideTex() {           // a cut edge: the cells are tubes running front to back, with the midrib down the middle
  const f = faceCanvas(1, COMB_D, PXW), { g, gb } = f, W = f.c.width, Hh = f.c.height;
  g.fillStyle = tok('--j3-comb-cut'); g.fillRect(0, 0, W, Hh); gb.fillStyle = BUMP_CUT; gb.fillRect(0, 0, W, Hh);
  const step = 0.866 * CELL * PXW, n = Math.ceil(W / step) + 1;
  for (let i = 0; i < n; i++) {
    const p = i * step + step * 0.3, th = Math.max(2, step * 0.16);
    g.fillStyle = WAX; gb.fillStyle = BUMP_HI; g.fillRect(p, 0, th, Hh); gb.fillRect(p, 0, th, Hh);
  }
  g.fillStyle = WAX_DARK; gb.fillStyle = BUMP_HI; g.fillRect(0, Hh / 2 - 2, W, 4); gb.fillRect(0, Hh / 2 - 2, W, 4);
  const t = texPair(f);
  for (const k of ['map', 'bump']) { t[k].wrapS = THREE.RepeatWrapping; }
  return t;
}
function makeComb() {
  const { box } = COMB, bw = box.x1 - box.x0, bh = box.y1 - box.y0;
  const shape = new THREE.Shape(COMB.pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const V2 = THREE.Vector2;
  const uvGen = {
    generateTopUV(g, v, a, b, c) { const f = (i) => new V2((v[i * 3] - box.x0) / bw, (v[i * 3 + 1] - box.y0) / bh); return [f(a), f(b), f(c)]; },
    generateSideWallUV(g, v, a, b, c, d) {
      const P = (i) => [v[i * 3], v[i * 3 + 1], v[i * 3 + 2]];
      const [pa, pb, pc, pd] = [P(a), P(b), P(c), P(d)];
      const k = Math.abs(pa[1] - pb[1]) < Math.abs(pa[0] - pb[0]) ? 0 : 1;          // run along x or along y
      return [pa, pb, pc, pd].map(q => new V2(q[k], 1 - q[2] / COMB_D));
    },
  };
  const geo = new THREE.ExtrudeGeometry(shape, { depth: COMB_D, bevelEnabled: false, curveSegments: 1, UVGenerator: uvGen });
  const mk = (t) => new THREE.MeshStandardMaterial({ color: tok('--j3-comb-tint'), map: t.map, bumpMap: t.bump, bumpScale: 1.2, roughness: 0.42, metalness: 0, envMapIntensity: 0.5 });
  const mesh = new THREE.Mesh(geo, [mk(combFrontTex()), mk(combSideTex())]);
  mesh.position.z = COMB_ZF - COMB_D;
  return mesh;
}

// ---------- materials ----------
// Honey: real light transmission. The path through the honey is longest straight through the middle and falls
// to almost nothing at the outline, so the honey reads dense and deep in the middle with a thin warm glow at the
// edge, like the photos. In front of the comb only a thin layer of honey sits between it and the glass.
function combUniforms(sh, comb) {
  sh.uniforms.combMask = { value: comb ? COMB.mask : null };
  sh.uniforms.combBox = { value: comb ? COMB.boxV : new THREE.Vector4(0, 0, 1, 1) };
  sh.uniforms.combZ = { value: comb ? COMB.zV : new THREE.Vector2(9, 9) };
  sh.uniforms.hasComb = { value: comb ? 1 : 0 };
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLocal;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vLocal = transformed;');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>',
    '#include <common>\nvarying vec3 vLocal;\nuniform sampler2D combMask; uniform vec4 combBox; uniform vec2 combZ; uniform float hasComb;\n' +
    'float combAt(out float d) { d = 9.0; if (hasComb < 0.5) return 0.0;\n' +
    '  vec2 u = (vLocal.xy - combBox.xy) / (combBox.zw - combBox.xy);\n' +
    '  if (u.x <= 0.0 || u.y <= 0.0 || u.x >= 1.0 || u.y >= 1.0) return 0.0;\n' +
    '  d = vLocal.z > 0.0 ? max(vLocal.z - combZ.x, 0.0) : max(combZ.y - vLocal.z, 0.0);\n' +
    '  return texture2D(combMask, u).r; }\n');
}
function honeyMaterial({ att, dist, rough, planes, side = THREE.FrontSide, comb = false }) {
  const m = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(1, 1, 1), metalness: 0, roughness: rough,
    transmission: 1, thickness: 1.2, ior: 1.49,
    attenuationColor: new THREE.Color(att), attenuationDistance: dist,
    specularIntensity: 0.3, envMapIntensity: 0.8, side,
    clippingPlanes: planes || null,
  });
  m.onBeforeCompile = (sh) => {
    combUniforms(sh, comb);
    sh.fragmentShader = sh.fragmentShader.replace('#include <transmission_fragment>',
      THREE.ShaderChunk.transmission_fragment.replace('material.thickness = thickness;',
        `float ndv = clamp( abs( dot( normal, normalize( vViewPosition ) ) ), 0.0, 1.0 );
         float th = thickness * ( 0.1 + 1.9 * pow( ndv, 0.6 ) );
         float cd; float cm = combAt( cd );
         th = mix( th, min( th, 0.35 * thickness + 1.9 * thickness * cd ), cm );
         material.thickness = th;`));
  };
  m.customProgramCacheKey = () => 'honey' + (comb ? 'C' : '');
  return m;
}
// the clear glass floor under the honey: thick glass, tinted by the honey above it
function baseGlassMaterial(att, dist) {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(1, 1, 1), metalness: 0, roughness: 0.05, transmission: 1, thickness: 0.6, ior: 1.5,
    attenuationColor: new THREE.Color(att), attenuationDistance: dist, specularIntensity: 0.6, envMapIntensity: 0.7,
  });
}
// Older phones: no see-through (transmission) pass, which draws the scene twice. Instead the honey multiplies
// whatever is behind it by its colour, the way tinted glass (or real honey) darkens what you see through it:
// dense through the middle, light only at the outline and in front of the comb. Colours are screen values (sRGB, 0-1).
function honeyMaterialLite({ thin, thick, planes, side = THREE.DoubleSide, comb = false }) {
  const m = new THREE.ShaderMaterial({
    uniforms: { thin: { value: new THREE.Vector3(...thin) }, thick: { value: new THREE.Vector3(...thick) } },
    vertexShader: `
      #include <common>
      #include <clipping_planes_pars_vertex>
      varying vec3 vN; varying vec3 vV;
      void main() {
        #include <begin_vertex>
        #include <project_vertex>
        #include <clipping_planes_vertex>
        vN = normalize(normalMatrix * normal); vV = -mvPosition.xyz;
      }`,
    fragmentShader: `
      #include <common>
      #include <clipping_planes_pars_fragment>
      uniform vec3 thin; uniform vec3 thick; varying vec3 vN; varying vec3 vV;
      void main() {
        #include <clipping_planes_fragment>
        float e = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        vec3 c = mix(thick, thin, pow(e, 3.0));
        float cd; float cm = combAt(cd);
        c = mix(c, mix(thin, thick, clamp(cd * 1.5, 0.0, 1.0)), cm);
        gl_FragColor = vec4(c, 1.0);
      }`,
    clipping: true, clippingPlanes: planes || null, side,
    transparent: true, depthWrite: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.DstColorFactor, blendDst: THREE.ZeroFactor,
  });
  m.onBeforeCompile = (sh) => combUniforms(sh, comb);
  m.customProgramCacheKey = () => 'honeyLite' + (comb ? 'C' : '');
  return m;
}
// Glass: only the reflection is added on top (glass reflects about 4% head-on, much more at grazing angles)
const glassReflMat = new THREE.MeshPhysicalMaterial({
  color: new THREE.Color(0, 0, 0), roughness: 0.03, metalness: 0, ior: 1.5, specularIntensity: 1,
  envMap: studioEnv, envMapIntensity: 0.9, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
});
// ...plus a faint warm tint right at the outline, where you look through more glass (honey-lit, as in the photos)
const glassTintMat = new THREE.MeshStandardMaterial({
  color: tok('--j3-glass-tint'), roughness: 0.2, metalness: 0, envMapIntensity: 0.3,
  transparent: true, opacity: 0.0, depthWrite: false, side: THREE.DoubleSide,
});
glassTintMat.onBeforeCompile = (sh) => {
  sh.fragmentShader = sh.fragmentShader.replace('#include <alphamap_fragment>',
    `#include <alphamap_fragment>
     { float e = 1.0 - abs( dot( normalize( vNormal ), normalize( vViewPosition ) ) );
       diffuseColor.a = opacity + 0.5 * pow( e, 3.0 ); }`);
};
// white-painted metal cap (like the product shots): enamel over steel, faint spun texture under a glossy clear coat
// fine vertical ribs on the cap's upper band (a height map: light = raised), and a whisper of spun texture
const lidGeo = lidGeometry();
const [ribTex, grooveTex] = (() => {
  const W = 2048, Hh = 256;
  const c = document.createElement('canvas'); c.width = W; c.height = Hh;
  const c2 = document.createElement('canvas'); c2.width = W; c2.height = Hh;
  const g = c.getContext('2d'), img = g.createImageData(W, Hh), d = img.data;
  const g2 = c2.getContext('2d'), img2 = g2.createImageData(W, Hh), d2 = img2.data;
  const yA = (1 - LID_RIB.v1) * Hh, yB = (1 - LID_RIB.v0) * Hh;          // canvas rows (textures are flipped)
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let y = 0; y < Hh; y++) {
    const band = Math.min(1, Math.max(0, Math.min(y - yA, yB - y) / 3 + 0.5)); // soft 3px ends
    const depth = 0.45 + 0.55 * Math.min(1, Math.max(0, (yB - y) / (yB - yA)));   // deepest at the top
    for (let x = 0; x < W; x++) {
      const ph = (x / W) * LID_RIB.count, f = ph - Math.floor(ph);
      const groove = 1 - ss(0.07, 0.17, Math.abs(f - 0.5));               // narrow groove, flat land
      const k = (y * W + x) * 4;
      const v = Math.round(255 * (0.55 - band * groove * depth * 0.45 + (Math.random() - 0.5) * 0.01));
      d[k] = d[k + 1] = d[k + 2] = v; d[k + 3] = 255;
      const cv = Math.round(255 * (1 - band * groove * depth * 0.3));     // grooves read darker
      d2[k] = d2[k + 1] = d2[k + 2] = cv; d2[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0); g2.putImageData(img2, 0, 0);
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4;
  const t2 = new THREE.CanvasTexture(c2); t2.anisotropy = 4; t2.colorSpace = THREE.SRGBColorSpace;
  return [t, t2];
})();
// white enamel over metal: glossy clear coat, cool tone, crisp studio highlights, ribs catching the light
const lidMat = new THREE.MeshPhysicalMaterial({
  color: tok('--j3-lid'), map: grooveTex, metalness: 0.03, roughness: 0.3, bumpMap: ribTex, bumpScale: 1.4,
  clearcoat: 1.0, clearcoatRoughness: 0.06, envMap: studioEnv, envMapIntensity: 1.1,
});

// lighter versions of the cap and glass for older phones (no clear coat / physical extras)
const lidMatLite = new THREE.MeshStandardMaterial({ color: tok('--j3-lid'), map: grooveTex, metalness: 0.03, roughness: 0.22, bumpMap: ribTex, bumpScale: 1.4, envMap: studioEnv, envMapIntensity: 1.1 });
const glassReflLite = new THREE.MeshStandardMaterial({
  color: new THREE.Color(0, 0, 0), roughness: 0.04, metalness: 0, envMap: studioEnv, envMapIntensity: 0.9, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
});

let labelLoaded; const labelReady = new Promise((r) => { labelLoaded = r; });
const labelTex = new THREE.TextureLoader().load(Q.label, () => {
  jars.forEach(j => { j.label.visible = true; j.labelBack.visible = true; });
  labelLoaded();
}, undefined, () => { console.warn('label image failed to load'); labelLoaded(); });
labelTex.colorSpace = THREE.SRGBColorSpace;
labelTex.anisotropy = 8;
// front: printed paper, drawn after the glass so the glass doesn't wash it out
const labelMat = new THREE.MeshStandardMaterial({
  map: labelTex, transparent: true, alphaTest: 0.03, roughness: 0.6, metalness: 0, envMapIntensity: 0.5,
  polygonOffset: true, polygonOffsetFactor: -2,
});
labelMat.onBeforeCompile = (sh) => {
  sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>',
    '#include <map_fragment>\n diffuseColor.rgb = max( mix( vec3( dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) ), diffuseColor.rgb, 1.5 ), 0.0 );');
};
// back: blank paper, solid, so it shows up through the honey when the jar turns
const labelBackMat = new THREE.MeshStandardMaterial({
  map: labelTex, side: THREE.BackSide, alphaTest: 0.5, roughness: 0.9, metalness: 0, envMapIntensity: 0.6,
});
labelBackMat.onBeforeCompile = (sh) => {
  sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>',
    '#include <map_fragment>\n diffuseColor.rgb = vec3( 0.93, 0.90, 0.83 );');
};

// shared geometry
const HONEY_T0 = 0.05, HONEY_T1 = 0.985;   // thick clear glass floor (~7mm) under the honey, as in the photos
const BASE_DOME = 0.13;                   // push-up: the base rises ~5.5mm into the jar at the centre
const glassGeo = buildRingSurface(jarRings({ dome: BASE_DOME }), 160);
const honeyGeo = buildRingSurface(jarRings({ t0: HONEY_T0, t1: HONEY_T1, inset: GLASS_IN, yBottom: HONEY_T0 * H }), 160);
const baseGeo = buildRingSurface(jarRings({ t0: 0.004, t1: HONEY_T0 - 0.003, inset: GLASS_IN, yBottom: 0.004 * H, dome: BASE_DOME * 0.97, steps: 6 }), 120);
const labelGeo = labelGeometry();
const bubbleGeo = new THREE.SphereGeometry(1, 10, 8);
const shadowTex = (() => {
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'), img = g.createImageData(N, N), d = img.data;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = (x + 0.5) / (N / 2) - 1, dy = (y + 0.5) / (N / 2) - 1, r2 = dx * dx + dy * dy;
    const a = r2 >= 1 ? 0 : Math.exp(-r2 * 3.2) * (1 - r2) ** 1.5;
    const k = (y * N + x) * 4; d[k] = d[k + 1] = d[k + 2] = 255; d[k + 3] = Math.round(a * 255);
  }
  g.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(c);
})();

// honey surface: a disc fitted to the inside wall wherever the (tilting) level plane cuts it
const SURF_N = 120;
function makeSurfaceGeometry() {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array((SURF_N + 1) * 3), nor = new Float32Array((SURF_N + 1) * 3), idx = [];
  for (let i = 0; i < SURF_N; i++) idx.push(0, 1 + ((i + 1) % SURF_N), 1 + i);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setIndex(idx);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, H / 2, 0), H);
  return geo;
}

// ---------- honey volume: samples of the jar's inside, so the honey keeps the same amount as it flows ----------
const VOL = (() => {
  const pts = [], step = Q.volStep, tSteps = TIER === 'full' ? 56 : 40;
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < tSteps; k++) {
    const t = HONEY_T0 + (HONEY_T1 - HONEY_T0) * (k + 0.5) / tSteps;
    const { hw, hd, n } = section(t);
    const a = hw * GLASS_IN, b = hd * GLASS_IN;
    for (let x = -a + step / 2; x < a; x += step) for (let z = -b + step / 2; z < b; z += step) {
      const xx = x + (rnd() - 0.5) * step * 0.8, zz = z + (rnd() - 0.5) * step * 0.8;
      if (Math.pow(Math.abs(xx / a), n) + Math.pow(Math.abs(zz / b), n) <= 1)
        pts.push(xx, (t + (rnd() - 0.5) * (HONEY_T1 - HONEY_T0) / tSteps) * H, zz);
    }
  }
  return { p: new Float32Array(pts), n: pts.length / 3, d: Math.max(step, (HONEY_T1 - HONEY_T0) * H / tSteps) };
})();
const _S = new Float32Array(VOL.n);
function volFrac(c) {           // share of the jar's inside below the level (each sample counts as a thin slab: smooth)
  let sum = 0; const inv = 1 / VOL.d;
  for (let i = 0; i < VOL.n; i++) { const u = (c - _S[i]) * inv + 0.5; sum += u <= 0 ? 0 : u >= 1 ? 1 : u; }
  return sum / VOL.n;
}
function projectVol(n) {
  let lo = Infinity, hi = -Infinity; const P = VOL.p;
  for (let i = 0, k = 0; i < VOL.n; i++, k += 3) { const s = n.x * P[k] + n.y * P[k + 1] + n.z * P[k + 2]; _S[i] = s; if (s < lo) lo = s; if (s > hi) hi = s; }
  return [lo - VOL.d, hi + VOL.d];
}
function fillFraction(n, c) { projectVol(n); return volFrac(c); }
function solveLevel(n, F0) {    // where the flat honey surface must sit (along n) to hold the same amount of honey
  let [lo, hi] = projectVol(n);
  for (let it = 0; it < 22; it++) { const mid = (lo + hi) / 2; if (volFrac(mid) < F0) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
const _ax2 = new THREE.Vector3();
function rotateToward(v, target, k) {
  const ang = Math.acos(Math.min(1, Math.max(-1, v.dot(target))));
  if (ang < 1e-5) return v;
  _ax2.crossVectors(v, target);
  if (_ax2.lengthSq() < 1e-10) _ax2.set(1, 0, 0).cross(v);
  if (_ax2.lengthSq() < 1e-10) _ax2.set(0, 0, 1).cross(v);
  return v.applyAxisAngle(_ax2.normalize(), ang * k).normalize();
}

function randomInsidePoint(tMin, tMax, rMin, rMax, frontBias) {
  const t = tMin + Math.random() * (tMax - tMin);
  let phi = Math.random() * Math.PI * 2;
  if (Math.random() < frontBias) phi = Math.PI * (0.15 + 0.7 * Math.random());
  const { hw, hd, n } = section(t);
  const r = rMin + (rMax - rMin) * Math.sqrt(Math.random());
  const p = superPoint(phi, hw * GLASS_IN * r, hd * GLASS_IN * r, n);
  return new THREE.Vector3(p.x, t * H, p.z);
}

function makeJar({ att, dist, rough, fill, comb, bubbles, specks, x, rot, lite, shadowTint, baseAtt, baseDist }) {
  bubbles = Math.round(bubbles * Q.bubbles); specks = Math.round(specks * Q.bubbles);
  const group = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = -TOTAL_H / 2;
  group.add(body);
  const innards = new THREE.Group();
  body.add(innards);

  // keep-below plane for the honey (world space, updated every frame)
  const clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
  const honey = new THREE.Mesh(honeyGeo, TIER === 'lite' ? honeyMaterialLite({ ...lite, planes: [clip], comb }) : honeyMaterial({ att, dist, rough, planes: [clip], comb }));
  body.add(honey);
  const surface = new THREE.Mesh(makeSurfaceGeometry(), TIER === 'lite' ? honeyMaterialLite({ ...lite, side: THREE.FrontSide, comb }) : honeyMaterial({ att, dist, rough, side: THREE.FrontSide, comb }));
  const base = new THREE.Mesh(baseGeo, TIER === 'lite' ? honeyMaterialLite({ thin: lite.thin, thick: lite.thin }) : baseGlassMaterial(baseAtt, baseDist));
  body.add(base);
  surface.frustumCulled = false;
  body.add(surface);

  // the comb is wedged in the jar: it only shifts a little; bubbles and specks ride the honey flow
  const combGroup = new THREE.Group(), dots = new THREE.Group();
  innards.add(combGroup, dots);
  if (comb) {
    combGroup.add(makeComb());
  }
  // tiny air bubbles and pollen specks: what makes raw honey read as raw
  const addDots = (count, color, rMin, rMax, rough2, emissive) => {
    if (!count) return;
    const mat = new THREE.MeshStandardMaterial({ color, roughness: rough2, metalness: 0, emissive, emissiveIntensity: emissive ? 0.25 : 0 });
    const inst = new THREE.InstancedMesh(bubbleGeo, mat, count);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const p = randomInsidePoint(HONEY_T0 + 0.02, fill - 0.05, 0.45, 0.94, 0.3);
      const r = rMin + (rMax - rMin) * Math.pow(Math.random(), 3);
      m.compose(p, q, s.set(r, r, r)); inst.setMatrixAt(i, m);
    }
    inst.frustumCulled = false;
    dots.add(inst);
  };
  addDots(specks, tok('--j3-speck'), 0.004, 0.012, 0.7, 0);
  // air bubbles: these move. In thick honey they creep toward whichever way is up, the big ones faster
  const nBig = 2, nBub = bubbles + nBig;
  const bubMesh = new THREE.InstancedMesh(bubbleGeo,
    new THREE.MeshStandardMaterial({ color: tok('--j3-bubble'), roughness: 0.12, metalness: 0, emissive: new THREE.Color(1, 1, 1), emissiveIntensity: 0.08 }), nBub);
  bubMesh.frustumCulled = false; dots.add(bubMesh);
  const bub = { mesh: bubMesh, n: nBub, pos: new Float32Array(nBub * 3), r: new Float32Array(nBub) };
  for (let i = 0; i < nBub; i++) {
    const p = randomInsidePoint(HONEY_T0 + 0.02, fill - 0.05, 0.3, 0.92, 0.25);
    bub.r[i] = i >= bubbles ? 0.025 + 0.02 * Math.random() : 0.005 + 0.016 * Math.pow(Math.random(), 3);
    bub.pos.set([p.x, p.y, p.z], i * 3);
  }

  const tint = new THREE.Mesh(glassGeo, glassTintMat); tint.renderOrder = 2; body.add(tint);
  const glass = new THREE.Mesh(glassGeo, TIER === 'lite' ? glassReflLite : glassReflMat); glass.renderOrder = 3; body.add(glass);
  const lid = new THREE.Mesh(lidGeo, TIER === 'lite' ? lidMatLite : lidMat); body.add(lid);
  const label = new THREE.Mesh(labelGeo, labelMat); label.renderOrder = 4; label.visible = false; body.add(label);
  const labelBack = new THREE.Mesh(labelGeo, labelBackMat); labelBack.visible = false; body.add(labelBack);

  const shadowMat = (color) => new THREE.MeshBasicMaterial({ map: shadowTex, color, transparent: true, depthWrite: false, toneMapped: false });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shadowMat(tok('--j3-shadow-soft')));   // soft, wide
  const shadowCore = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shadowMat(shadowTint));   // tight contact shadow
  scene.add(shadow, shadowCore);

  group.traverse(o => o.userData.jarGroup = group);
  scene.add(group);
  return {
    group, body, innards, combGroup, dots, bub, honey, surface, base, clip, label, labelBack, shadow, shadowCore, fill, lid, glass, lite, hasComb: comb,
    home: { x, rot }, x, y: 0, vx: 0, vy: 0, rot, vr: 0, px: x, prot: rot,
    velS: 0, prevVelS: 0, wS: 0, prevWS: 0, lean: 0,
    sx: 0, sz: 0, svx: 0, svz: 0, honeyRot: rot,
    phase: Math.random() * 6, lastTouch: -1e9, dragging: false,
  };
}


// "spring flow" (light, with comb) and "fall flow" (dark), matching the site's two jars
const jars = [
  makeJar({ att: tok('--j3-honey-spring'), dist: 0.72, rough: 0.1, fill: yT(0.912), comb: true, bubbles: 30, specks: 18, x: -1.2, rot: 0,
    lite: { thin: [0.92, 0.72, 0.5], thick: [0.84, 0.4, 0.1] }, shadowTint: tok('--j3-shadow-core-spring'), baseAtt: tok('--j3-base-spring'), baseDist: 0.2 }),
  makeJar({ att: tok('--j3-honey-fall'), dist: 1.35, rough: 0.06, fill: yT(0.912), comb: false, bubbles: 10, specks: 8, x: 1.2, rot: 0,
    lite: { thin: [0.82, 0.62, 0.48], thick: [0.36, 0.12, 0.08] }, shadowTint: tok('--j3-shadow-core-fall'), baseAtt: tok('--j3-base-fall'), baseDist: 0.32 }),
];
jars[0].name = 'Shop spring flow'; jars[0].href = '#spring'; jars[0].introDelay = 350; jars[0].bobDur = 6.2; jars[0].bobDel = -1.5;
jars[1].name = 'Shop fall flow';   jars[1].href = '#fall';   jars[1].introDelay = 500; jars[1].bobDur = 7.4; jars[1].bobDel = -4.0;
for (const j of jars) {
  // cheap invisible box for hover / grab hit-testing
  const proxy = new THREE.Mesh(new THREE.BoxGeometry(2 * A, TOTAL_H, 2 * DEPTH_RATIO * A), new THREE.MeshBasicMaterial());
  proxy.visible = false; proxy.userData.jarGroup = j.group; j.group.add(proxy); j.proxy = proxy;
  j.hoverLift = 0; j.introDone = true;
}

// ---------- honey surface: a flat level that always holds the same amount of honey ----------
// Its direction lags behind "down" (thick honey takes a second or two to flow level) and slosh tilts it.
const _p = new THREE.Vector3(), _n = new THREE.Vector3(), _nE = new THREE.Vector3(), _qb = new THREE.Quaternion();
function updateHoneySurface(j) {
  j.body.updateWorldMatrix(true, false);
  _qb.copy(j.group.quaternion).invert();
  _nE.set(-j.sx, 0, -j.sz).applyQuaternion(_qb).add(j.nB).normalize();   // level direction, in the jar's frame
  // only solve again when the level's direction has actually moved (a resting jar costs nothing)
  const same = j.levelSolved && j.nE.dot(_nE) > 0.9999995;
  const c = same ? j.levelC : solveLevel(_nE, j.F0);
  if (!same) { j.nE.copy(_nE); j.levelC = c; j.levelSolved = true; }
  _nE.copy(j.nE);
  _n.copy(_nE).applyQuaternion(j.group.quaternion);
  _p.copy(_nE).multiplyScalar(c).applyMatrix4(j.body.matrixWorld);
  j.clip.normal.copy(_n).negate(); j.clip.constant = _n.dot(_p);          // keep the honey on the low side
  // the visible honey/air surface: drawn while it sits across the neck and shoulder (jar about upright)
  const nl = _nE, dl = -c;
  j.surface.visible = nl.y > 0.6;
  if (!j.surface.visible || same) return;
  const pos = j.surface.geometry.attributes.position.array;
  const nor = j.surface.geometry.attributes.normal.array;
  const lo0 = HONEY_T0 + 0.004, hi0 = HONEY_T1 - 0.002;
  pos[0] = 0; pos[1] = clamp(-dl / nl.y, lo0 * H, hi0 * H); pos[2] = 0;
  for (let i = 0; i < SURF_N; i++) {
    const phi = (i / SURF_N) * Math.PI * 2;
    const g = (t) => {
      const { hw, hd, n } = section(t);
      const q = superPoint(phi, hw * GLASS_IN * 0.998, hd * GLASS_IN * 0.998, n);
      return { v: nl.x * q.x + nl.y * t * H + nl.z * q.z + dl, x: q.x, z: q.z };
    };
    // where the level meets the wall; if it runs past the top (or bottom) of the honey, the edge stops there
    let lo = lo0, hi = hi0, r = g(lo), y;
    if (r.v >= 0) y = lo0 * H;
    else {
      const rh = g(hi);
      if (rh.v <= 0) { r = rh; y = hi0 * H; }
      else {
        for (let k = 0; k < 18; k++) { const mid = (lo + hi) / 2, rm = g(mid); if (rm.v < 0) lo = mid; else hi = mid; r = rm; }
        y = clamp(-(nl.x * r.x + nl.z * r.z + dl) / nl.y, lo0 * H, hi0 * H);
      }
    }
    pos.set([r.x, y, r.z], (i + 1) * 3);
  }
  for (let i = 0; i <= SURF_N; i++) nor.set([nl.x, nl.y, nl.z], i * 3);
  j.surface.geometry.attributes.position.needsUpdate = true;
  j.surface.geometry.attributes.normal.needsUpdate = true;
}

// =================== the headline, drawn into the 3D scene behind the jars ===================
// The h1 stays in the page (for layout, search and screen readers) but goes transparent; its exact
// glyph positions are measured and painted onto a plane behind the jars, so the honey and glass
// actually bend the letters and the green block behind them.
let bgCanvas = document.createElement('canvas');
let bgCtx = bgCanvas.getContext('2d');
let bgTex = new THREE.CanvasTexture(bgCanvas);
const bgMat = new THREE.MeshBasicMaterial({ map: bgTex, toneMapped: false });
const bgPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), bgMat);
bgPlane.renderOrder = -10;
scene.add(bgPlane);

const cubicBezier = (x1, y1, x2, y2) => (x) => {
  if (x <= 0) return 0; if (x >= 1) return 1;
  let t = x;
  for (let i = 0; i < 8; i++) {
    const cx = 3 * x1 * t * (1 - t) ** 2 + 3 * x2 * t * t * (1 - t) + t ** 3 - x;
    const dx = 3 * x1 * (1 - t) ** 2 + 6 * (x2 - x1) * t * (1 - t) + 3 * (1 - x2) * t * t;
    if (Math.abs(dx) < 1e-6) break; t -= cx / dx; t = Math.min(1, Math.max(0, t));
  }
  return 3 * y1 * t * (1 - t) ** 2 + 3 * y2 * t * t * (1 - t) + t ** 3;
};
const easeHoney = cubicBezier(0.2, 0.75, 0.2, 1);

let L = null;  // measured layout
function measure() {
  const sr = stage.getBoundingClientRect();
  const rel = (r) => ({ x: r.left - sr.left, y: r.top - sr.top, w: r.width, h: r.height });
  const lines = [];
  for (const [sel, delay] of [['.l1', 0], ['.l2', 140]]) {
    const el = document.querySelector('.hero ' + sel);
    const clip = rel(el.getBoundingClientRect());
    const innerH = el.firstElementChild.getBoundingClientRect().height;
    const lift = new DOMMatrixReadOnly(getComputedStyle(el.firstElementChild).transform).m42 || 0;   // reveal still under way
    const glyphs = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    let node;
    while ((node = walker.nextNode())) {
      const parent = node.parentElement, cs = getComputedStyle(parent);
      const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      bgCtx.font = font;
      const m = bgCtx.measureText('Hg');
      const asc = m.fontBoundingBoxAscent, desc = m.fontBoundingBoxDescent;
      const color = parent.closest('.hl') ? tok('--cream-light') : tok('--ink-brown');
      for (let i = 0; i < node.length; i++) {
        const ch = node.data[i];
        if (!ch.trim()) continue;
        range.setStart(node, i); range.setEnd(node, i + 1);
        const r = range.getBoundingClientRect();
        if (!r.width) continue;
        glyphs.push({ ch, w: r.width, h: r.height, x: r.left - sr.left, y: r.top - sr.top - lift + (r.height - (asc + desc)) / 2 + asc, font, color });
      }
    }
    const hl = el.querySelector('.hl');
    lines.push({ clip, innerH, glyphs, delay, hlRects: hl ? [...hl.getClientRects()].map(rel).map((r) => ({ ...r, y: r.y - lift })) : [] });
  }
  L = {
    W: sr.width, H: sr.height, lines,
    slot: rel(jarSlot.getBoundingClientRect()),
    gap: parseFloat(getComputedStyle(jarSlot).columnGap) || 16,
    barBottom: barEl.getBoundingClientRect().bottom - sr.top,
    subTop: rel(subEl.getBoundingClientRect()).y,
  };
}

function drawBackground(t) {
  const dpr = renderer.getPixelRatio();
  const ctx = bgCtx;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = tok('--cream'); ctx.fillRect(0, 0, L.W, L.H);
  ctx.textBaseline = 'alphabetic';
  for (const ln of L.lines) {
    const p = REDUCED ? 1 : easeHoney(Math.min(1, Math.max(0, (t - ln.delay) / 1000)));
    const dy = (1 - p) * ln.innerH * 1.05;   // same "up" reveal as the live site
    ctx.save();
    ctx.beginPath(); ctx.rect(ln.clip.x - 60, ln.clip.y, ln.clip.w + 120, ln.clip.h); ctx.clip();
    ctx.fillStyle = tok('--leaf');
    for (const r of ln.hlRects) ctx.fillRect(r.x, r.y + dy, r.w, r.h);
    for (const g of ln.glyphs) { ctx.font = g.font; ctx.fillStyle = g.color; ctx.fillText(g.ch, g.x, g.y + dy); }
    ctx.restore();
  }
  bgTex.needsUpdate = true;
}

// px <-> world mapping on the jars' plane (z = 0): x = (px - W/2) / s, y = (homePy - py) / s
let S = 100, HOME_PY = 0, B = { x0: -3, x1: 3, y0: -1, y1: 1 };
function layoutScene() {
  const { W, H: Hh, slot } = L;
  renderer.setSize(W, Hh, false);
  const dpr = renderer.getPixelRatio();
  bgTex.dispose();
  bgCanvas = document.createElement('canvas');
  bgCanvas.width = Math.round(W * dpr); bgCanvas.height = Math.round(Hh * dpr);
  bgCtx = bgCanvas.getContext('2d');
  bgTex = new THREE.CanvasTexture(bgCanvas);
  bgTex.colorSpace = THREE.SRGBColorSpace; bgTex.generateMipmaps = false; bgTex.minFilter = THREE.LinearFilter;
  bgMat.map = bgTex; bgMat.needsUpdate = true;

  // the 3D jar fills the same slot the product photos use (lid top to base)
  const jarPx = slot.h * 0.96;
  S = jarPx / TOTAL_H;
  const tanH = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  const dist = Hh / (2 * S * tanH);
  const imgW = 0.627 * slot.h;                  // product photos are 627 x 1000
  const offs = imgW / 2 + L.gap / 2;
  const cx = slot.x + slot.w / 2;
  HOME_PY = slot.y + slot.h - slot.h * 0.012 - jarPx / 2;
  jars[0].home.x = (cx - offs - W / 2) / S;
  jars[1].home.x = (cx + offs - W / 2) / S;

  // straight-on camera a touch above the jars (lid top just visible, verticals stay vertical),
  // lens-shifted so the jars land exactly where the photos sit
  const yEye = dist * Math.tan(THREE.MathUtils.degToRad(5));
  camera.aspect = W / Hh;
  camera.position.set(0, yEye, dist);
  camera.rotation.set(0, 0, 0);
  camera.near = Math.max(0.1, dist * 0.2); camera.far = dist * 4;
  camera.updateProjectionMatrix();
  const k = (1 - 2 * HOME_PY / Hh) - (1 / tanH) * (0 - yEye) / dist;
  camera.projectionMatrix.elements[9] = -k;
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();

  // background plane exactly fills the view at depth ZB behind the jars
  const ZB = 4, d = dist + ZB;
  const ph = 2 * d * tanH;
  bgPlane.position.set(0, yEye - k * d * tanH, -ZB);
  bgPlane.scale.set(ph * camera.aspect, ph, 1);

  // floating area: under the nav, above the sub line, inside the page edges
  const halfW = A * S, halfH = jarPx / 2, m = W <= 760 ? -0.3 * halfW : 18;
  B = {
    x0: (halfW + m - W / 2) / S, x1: (W / 2 - halfW - m) / S,
    y1: Math.max(0.1, (HOME_PY - (L.barBottom + halfH + 6)) / S),
    y0: Math.min(-0.1, (HOME_PY - (L.subTop - halfH - 4)) / S),
  };
  // reset: a small "Reset jars" pill centred just under the jars' resting spot, the place they float back to
  // (same row as the shop tag; only one of the two shows at a time)
  resetBtn.style.left = cx + 'px';
  resetBtn.style.top = (HOME_PY + jarPx / 2 + 30) + 'px';
  // shadow sizes (world units), from the photo slot: a soft one about the jar's width, a tight core under the base
  for (const j of jars) { j.shBase = { w: 1.35 * imgW / S, h: 34 / S, cw: 0.9 * imgW / S, ch: 17 / S }; j.floorY = -(jarPx / 2 + 4) / S; }
}

// =================== free-floating rigid body (zero-g) ===================
// Each jar is a rigid body floating in space, with its real spin resistance on three axes
// (moments of inertia of a solid box the size of the jar):
//   vertical, lid to base        IYY  smallest  -> spins like a top: stable
//   front to back, through label IZZ  largest   -> cartwheels: stable
//   side to side                 IXX  in between -> end-over-end tumble is UNSTABLE: the tennis-racket flip
// Rotation is integrated with Euler's equations, so the flip falls out of the physics; nothing is scripted.
const JAR_D = 2 * DEPTH_RATIO * A;
const IXX = (TOTAL_H ** 2 + JAR_D ** 2) / 12;
const IYY = ((2 * A) ** 2 + JAR_D ** 2) / 12;
const IZZ = ((2 * A) ** 2 + TOTAL_H ** 2) / 12;
const K_GRAB = 320, C_GRAB = 30, TORQUE_GAIN = 1.5;        // grabbing = a stiff spring on the exact point you clicked
const LIN_DRAG = 0.22, ANG_DRAG = 0.06, SPIN_DRAG = 0.05;  // almost frictionless; the honey bleeds off a little tumble/spin
const V_MAX = 14, W_MAX = 16, WALL = 0.6, WALL_ROLL = 0.5, JAR_E = 0.75, RETURN_AFTER_MS = 5000;
const _w = new THREE.Vector3(), _F = new THREE.Vector3(), _T = new THREE.Vector3(), _g = new THREE.Vector3(), _vg = new THREE.Vector3();
const _tB = new THREE.Vector3(), _a1 = new THREE.Vector3(), _a2 = new THREE.Vector3(), _wm = new THREE.Vector3();
const _ax = new THREE.Vector3(), _al = new THREE.Vector3(), _hit = new THREE.Vector3(), _zN = new THREE.Vector3(0, 0, 1);
const _qi = new THREE.Quaternion(), _qe = new THREE.Quaternion(), _dq = new THREE.Quaternion(), _qh = new THREE.Quaternion();
const _qId = new THREE.Quaternion(), _eul = new THREE.Euler(), _plane = new THREE.Plane();
const _qTw = new THREE.Quaternion(), _qSw = new THREE.Quaternion(), _qInv = new THREE.Quaternion();
const _upB = new THREE.Vector3(), _m4 = new THREE.Matrix4(), _eulC = new THREE.Euler();
const HONEY_TAU = 1.6;   // seconds for the honey to flow level again

function rbInit(j) {
  j.p = new THREE.Vector3(j.x, j.y, 0); j.v = new THREE.Vector3();
  j.q = new THREE.Quaternion().setFromEuler(_eul.set(0, j.home.rot, 0));
  j.wB = new THREE.Vector3(); j.grab = null; j.honeyQ = j.q.clone(); j.resetting = false;
  if (j.home.y === undefined) j.home.y = 0;
  // honey: level direction in the jar's frame (relaxes toward "down"), and how full the jar is
  j.nB = new THREE.Vector3(0, 1, 0); j.nE = new THREE.Vector3(0, 1, 0);
  j.F0 = fillFraction(j.nB, j.fill * H); j.levelC = j.fill * H;
  j.cOff = new THREE.Vector3(); j.cV = new THREE.Vector3(); j.cPrevV = new THREE.Vector3(); j.cAcc = new THREE.Vector3();
}
// Euler's equations for a torqued rigid body, in the jar's own frame: I w' = tau - w x (I w)
function eulerRHS(wB, tB, out) {
  const Lx = IXX * wB.x, Ly = IYY * wB.y, Lz = IZZ * wB.z;
  return out.set(
    (tB.x - (wB.y * Lz - wB.z * Ly)) / IXX,
    (tB.y - (wB.z * Lx - wB.x * Lz)) / IYY,
    (tB.z - (wB.x * Ly - wB.y * Lx)) / IZZ);
}
function addWorldSpin(j, x, y, z) { j.wB.add(_ax.set(x, y, z).applyQuaternion(_qi.copy(j.q).invert())); }
// resting pose: upright, label front, with a slow sway so the glass keeps catching light
function homeQuat(j, t) { return _qh.setFromEuler(_eul.set(0, j.home.rot + 0.05 * Math.sin(t / 2600 + j.phase), 0)); }

function rbStep(j, h, homing, homeQ, B, now) {
  _qi.copy(j.q).invert();
  const wW = _w.copy(j.wB).applyQuaternion(j.q);
  _F.set(0, 0, 0); _T.set(0, 0, 0);
  if (j.grab) {
    // pull the grabbed point toward the pointer; force off-centre = torque, so where you grab decides the spin
    const g = _g.copy(j.grab.r).applyQuaternion(j.q);
    const vg = _vg.copy(wW).cross(g).add(j.v);
    _F.set(K_GRAB * (j.grab.target.x - j.p.x - g.x) - C_GRAB * vg.x,
           K_GRAB * (j.grab.target.y - j.p.y - g.y) - C_GRAB * vg.y, 0);
    _T.copy(g).cross(_F).multiplyScalar(TORQUE_GAIN);
  }
  // homing: a quick settle on its own; a slower, gentler glide when someone hits reset
  const kp = j.resetting ? 3.2 : 9, kd = j.resetting ? 3.6 : 6, rkp = j.resetting ? 3.2 : 7, rkd = j.resetting ? 3.6 : 5.3;
  if (homing) { _F.x += kp * (j.home.x - j.p.x) - kd * j.v.x; _F.y += kp * (j.home.y - j.p.y) - kd * j.v.y; }
  j.v.addScaledVector(_F, h).multiplyScalar(Math.exp(-LIN_DRAG * h)); j.v.z = 0;
  if (j.v.length() > V_MAX) j.v.setLength(V_MAX);
  j.p.addScaledVector(j.v, h); j.p.z = 0;

  // rotation: Euler's equations (midpoint step)
  const tB = _tB.copy(_T).applyQuaternion(_qi);
  eulerRHS(j.wB, tB, _a1);
  eulerRHS(_wm.copy(j.wB).addScaledVector(_a1, h / 2), tB, _a2);
  j.wB.addScaledVector(_a2, h);
  if (homing) {
    // ease back upright, label front: critically damped pull on the rotation error
    _qe.copy(homeQ).multiply(_qi);
    if (_qe.w < 0) { _qe.x *= -1; _qe.y *= -1; _qe.z *= -1; _qe.w *= -1; }
    const s = Math.sqrt(Math.max(0, 1 - _qe.w * _qe.w)), ang = 2 * Math.acos(Math.min(1, _qe.w));
    if (s > 1e-6) _ax.set(_qe.x / s, _qe.y / s, _qe.z / s); else _ax.set(0, 0, 0);
    _al.copy(_ax).multiplyScalar(ang * rkp).addScaledVector(wW, -rkd).applyQuaternion(_qi);
    j.wB.addScaledVector(_al, h);
  }
  const ds = Math.exp(-(ANG_DRAG + SPIN_DRAG) * h);
  j.wB.x *= ds; j.wB.y *= ds; j.wB.z *= Math.exp(-ANG_DRAG * h);
  if (j.wB.length() > W_MAX) j.wB.setLength(W_MAX);
  const wl = j.wB.length();
  if (wl > 1e-9) { _dq.setFromAxisAngle(_ax.copy(j.wB).divideScalar(wl), wl * h); j.q.multiply(_dq).normalize(); }

  // walls: bounce, and the wall's grip rolls the jar along it
  if (j.p.x > B.x1) { j.p.x = B.x1; if (j.v.x > 0) { addWorldSpin(j, 0, 0, -WALL_ROLL * j.v.y); j.v.x *= -WALL; j.lastTouch = now; } }
  if (j.p.x < B.x0) { j.p.x = B.x0; if (j.v.x < 0) { addWorldSpin(j, 0, 0, WALL_ROLL * j.v.y); j.v.x *= -WALL; j.lastTouch = now; } }
  if (j.p.y > B.y1) { j.p.y = B.y1; if (j.v.y > 0) { addWorldSpin(j, 0, 0, WALL_ROLL * j.v.x); j.v.y *= -WALL; j.lastTouch = now; } }
  if (j.p.y < B.y0) { j.p.y = B.y0; if (j.v.y < 0) { addWorldSpin(j, 0, 0, -WALL_ROLL * j.v.x); j.v.y *= -WALL; j.lastTouch = now; } }
}

function rbGrab(j, hitPoint, now) {
  _qi.copy(j.q).invert();
  j.grab = { r: hitPoint.clone().sub(j.p).applyQuaternion(_qi), target: hitPoint.clone(), z: hitPoint.z };
  j.lastTouch = now;
}
function rbDragTo(j, ray, now) {      // keep the grabbed point under the pointer, in the plane it was grabbed in
  _plane.set(_zN, -j.grab.z);
  if (ray.intersectPlane(_plane, _hit)) j.grab.target.copy(_hit);
  j.lastTouch = now;
}
function rbRelease(j, now) {
  j.grab = null; j.lastTouch = now;
  // no real flick is perfectly clean: a hair of off-axis spin, which is all the flip needs to show itself
  const w = j.wB.length();
  if (w > 0.5) j.wB.add(_ax.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.06 * w));
}

function collide(a, b, now) {
  const minD = 2 * A * 0.97;
  const dx = b.p.x - a.p.x, dy = b.p.y - a.p.y;
  if (Math.abs(dx) >= minD || Math.abs(dy) > TOTAL_H * 0.85) return;
  const dir = Math.sign(dx) || 1, overlap = minD - Math.abs(dx);
  if (a.grab) b.p.x += dir * overlap;
  else if (b.grab) a.p.x -= dir * overlap;
  else { a.p.x -= dir * overlap / 2; b.p.x += dir * overlap / 2; }
  const rel = (b.v.x - a.v.x) * dir;
  if (rel < 0) {
    const avg = (a.v.x + b.v.x) / 2, half = (a.v.x - b.v.x) / 2;
    if (!a.grab) a.v.x = avg - JAR_E * half;
    if (!b.grab) b.v.x = avg + JAR_E * half;
    // contact lands off-centre, so a knock also twists both jars
    const tw = rel * 0.9 * (dy / TOTAL_H);
    addWorldSpin(a, 0, rel * 0.5 * dir, tw); addWorldSpin(b, 0, -rel * 0.5 * dir, -tw);
    a.lastTouch = b.lastTouch = now;
  }
}

// honey: slow viscous slosh while upright; bubbles trail the jar's turning on any axis; the wedged comb barely moves
function honeyUpdate(j, dt) {
  const vel = j.p.x - j.px; j.px = j.p.x;
  j.velS += (vel - j.velS) * 0.35;
  const acc = j.velS - j.prevVelS; j.prevVelS = j.velS;
  const wy = _w.copy(j.wB).applyQuaternion(j.q).y / 60;         // spin about vertical, rad per 60fps frame
  j.wS += (wy - j.wS) * 0.35;
  const alpha = j.wS - j.prevWS; j.prevWS = j.wS;
  const lx = _ax.set(1, 0, 0).applyQuaternion(j.q);
  const kick = -alpha * 1.3;
  j.svx += -acc * 0.45 + lx.x * kick - j.sx * 0.0022;
  j.svz += lx.z * kick - j.sz * 0.0022;
  j.svx *= 0.90; j.svz *= 0.90;
  j.sx = clamp(j.sx + j.svx, -0.55, 0.55); j.sz = clamp(j.sz + j.svz, -0.55, 0.55);
  // honey's lag behind the jar, in the jar's frame, split into twist about the jar's own vertical axis
  // and everything else. Thick honey in a full jar only visibly lags in twist; tumbling carries it along.
  j.honeyQ.slerp(j.q, 1 - Math.exp(-1.2 * dt));
  _qe.copy(j.q).invert().multiply(j.honeyQ);
  if (_qe.w < 0) { _qe.x *= -1; _qe.y *= -1; _qe.z *= -1; _qe.w *= -1; }
  const tl = Math.hypot(_qe.y, _qe.w) || 1;
  _qTw.set(0, _qe.y / tl, 0, _qe.w / tl);                       // twist (about jar's vertical)
  _qSw.copy(_qe).multiply(_qInv.copy(_qTw).invert());          // swing (the rest)
  clampQuat(_qTw, 0.5); clampQuat(_qSw, 0.04);
  _qe.copy(_qSw).multiply(_qTw);
  j.honeyQ.copy(j.q).multiply(_qe);
  // rotate about the jar's centre (the inner groups' origin is the jar's base)
  _g.set(j.sx, 0, j.sz).applyQuaternion(_qi.copy(j.q).invert());
  _wm.set(0, TOTAL_H / 2, 0);
  j.dots.quaternion.copy(_qe);
  j.dots.position.copy(_wm).sub(_al.copy(_wm).applyQuaternion(_qe)).add(_tB.set(-_g.x * 0.1, 0, -_g.z * 0.1));

  // the level flows toward "down" slowly: a fast tumble barely moves it, a jar left tilted settles in a couple of seconds
  _upB.set(0, 1, 0).applyQuaternion(_qi.copy(j.q).invert());
  rotateToward(j.nB, _upB, 1 - Math.exp(-dt / HONEY_TAU));
  // air bubbles creep toward "up" (Stokes: speed grows with size squared), sliding along the glass and the surface
  const Bb = j.bub, P = Bb.pos, R = Bb.r;
  for (let i = 0; i < Bb.n; i++) {
    const k = i * 3, r = R[i], sp = Math.min(0.3, 0.012 + 45 * r * r) * dt;
    let x = P[k] + _upB.x * sp, y = P[k + 1] + _upB.y * sp, z = P[k + 2] + _upB.z * sp;
    const t = clamp(y / H, HONEY_T0 + (r + 0.01) / H, HONEY_T1 - 0.01); y = t * H;
    const { hw, hd, n } = section(t);
    const a = Math.max(0.05, hw * GLASS_IN - r - 0.012), b = Math.max(0.05, hd * GLASS_IN - r - 0.012);
    const rho = Math.pow(Math.pow(Math.abs(x / a), n) + Math.pow(Math.abs(z / b), n), 1 / n);
    if (rho > 1) { x /= rho; z /= rho; }
    const over = j.nE.x * x + j.nE.y * y + j.nE.z * z - (j.levelC - r - 0.01);
    if (over > 0) { x -= j.nE.x * over; y -= j.nE.y * over; z -= j.nE.z * over; }
    P[k] = x; P[k + 1] = y; P[k + 2] = z;
    _m4.makeScale(r, r, r).setPosition(x, y, z); Bb.mesh.setMatrixAt(i, _m4);
  }
  Bb.mesh.instanceMatrix.needsUpdate = true;
  // the comb: wedged in, but wax is lighter than honey, so it presses gently toward "up" and leans into a shove
  // (in a liquid a light body moves WITH the acceleration, like a balloon in a braking car). Heavily damped, a few mm at most.
  _tB.set(j.v.x - j.cPrevV.x, j.v.y - j.cPrevV.y, 0).divideScalar(Math.max(dt, 1e-3)); j.cPrevV.copy(j.v);
  j.cAcc.lerp(_tB, 1 - Math.exp(-dt * 8));
  _g.set(0, 1, 0).addScaledVector(j.cAcc, 0.06).applyQuaternion(_qi.copy(j.q).invert());   // the comb's "up", in the jar's frame
  const ctx = clamp(_g.x * 0.05, -0.06, 0.06), cty = clamp(_g.y * 0.035, -0.04, 0.04), ctz = clamp(_g.z * 0.03, -0.025, 0.025);
  j.cV.x += ((ctx - j.cOff.x) * 7 - j.cV.x * 6) * dt;
  j.cV.y += ((cty - j.cOff.y) * 7 - j.cV.y * 6) * dt;
  j.cV.z += ((ctz - j.cOff.z) * 7 - j.cV.z * 6) * dt;
  j.cOff.addScaledVector(j.cV, dt);
  _qSw.copy(_qId).slerp(_qe, 0.12);                                       // a little of the honey's twist lag
  _dq.setFromEuler(_eulC.set(j.cOff.z * 1.4, 0, -j.cOff.x * 1.4));        // and a few degrees of lean with the drift
  j.combGroup.quaternion.copy(_qSw).multiply(_dq);
  j.combGroup.position.copy(_wm).sub(_al.copy(_wm).applyQuaternion(j.combGroup.quaternion)).add(j.cOff);
}
function clampQuat(q, maxAng) {
  if (q.w < 0) { q.x *= -1; q.y *= -1; q.z *= -1; q.w *= -1; }
  const ang = 2 * Math.acos(Math.min(1, q.w));
  if (ang > maxAng) q.slerp(_qId, 1 - maxAng / ang);
}

for (const j of jars) rbInit(j);

// =================== interaction ===================
// Mouse: grab a jar anywhere and fling it (up/down flicks tumble it); a plain click offers its shop link.
// Touch: the page must always scroll, so an up/down swipe is left to the page. A sideways swipe grabs the
// jar (after that it can be flung any way, tumbles included), and a tap flips it and offers its shop link.
const raycaster = new THREE.Raycaster();
let active = null, downInfo = null, hovered = null, pending = null;
function canvasPoint(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
function rayAt(px, py) { raycaster.setFromCamera(new THREE.Vector2(px / L.W * 2 - 1, -(py / L.H * 2 - 1)), camera); }
function pick(px, py) {
  rayAt(px, py);
  const hits = raycaster.intersectObjects(jars.map(j => j.proxy), false);
  if (!hits.length) return null;
  const j = jars.find(jj => jj.proxy === hits[0].object);
  return j ? { j, point: hits[0].point } : null;
}
function startGrab(j, point, p, id) {
  active = j;
  try { canvas.setPointerCapture(id); } catch (e) { /* pointer already gone */ }
  rbGrab(j, point, performance.now());
  canvas.classList.add('dragging');
  downInfo = { x: p.x, y: p.y, t: performance.now(), lastX: p.x, lastY: p.y };
}
const touchy = (e) => e.pointerType === 'touch' || e.pointerType === 'pen' || BB.emulateTouch;
canvas.addEventListener('pointerdown', (e) => {
  if (active || pending) return;
  const p = canvasPoint(e), hit = pick(p.x, p.y);
  if (!hit) return;
  if (touchy(e)) { pending = { j: hit.j, point: hit.point.clone(), x: p.x, y: p.y, t: performance.now(), id: e.pointerId }; return; }
  startGrab(hit.j, hit.point, p, e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  const p = canvasPoint(e);
  if (pending) {
    if (e.pointerId !== pending.id) return;
    const dx = p.x - pending.x, dy = p.y - pending.y;
    if (Math.hypot(dx, dy) < 9) return;
    const pd = pending; pending = null;
    if (Math.abs(dx) > Math.abs(dy) * 1.15) startGrab(pd.j, pd.point, pd, e.pointerId);   // sideways: take the jar
    else return;                                                                          // up/down: a scroll, the page's
  }
  if (!active) {
    if (e.pointerType === 'mouse' && !BB.emulateTouch) { const h = pick(p.x, p.y); hovered = h ? h.j : null; canvas.classList.toggle('hover', !!hovered); }
    return;
  }
  rayAt(p.x, p.y);
  rbDragTo(active, raycaster.ray, performance.now());
  downInfo.lastX = p.x; downInfo.lastY = p.y;
});
function release(e) {
  if (pending && (!e || e.pointerId === pending.id)) {
    const pd = pending; pending = null;
    if (e && e.type === 'pointerup' && performance.now() - pd.t < 450) tapFlip(pd.j, performance.now());
    return;
  }
  if (!active) return;
  const moved = Math.hypot(downInfo.lastX - downInfo.x, downInfo.lastY - downInfo.y);
  const quick = performance.now() - downInfo.t < 350;
  rbRelease(active, performance.now());
  if (moved < 5 && quick) showToast(active, false);   // a plain click = the shop link
  active = null; canvas.classList.remove('dragging');
}
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);
canvas.addEventListener('pointerleave', () => { if (!active) { hovered = null; canvas.classList.remove('hover'); } });

// a tap: the jar hops and somersaults end over end about its in-between axis (so the flip wobbles like a real
// one), then floats home sooner than after a throw
function tapFlip(j, now) {
  if (!REDUCED) {
    const s = Math.random() < 0.5 ? -1 : 1;
    j.wB.set(s * 8.5, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6);
    j.v.y += 2.4; j.v.x += (Math.random() - 0.5) * 0.8;
    j.lastTouch = now - RETURN_AFTER_MS + 1800;
  }
  showToast(j, true);
}

let toastTimer = 0;
function showToast(j, fromTap) {
  toast.href = j.href;
  toast.querySelector('span').textContent = j.name + '  →';
  const x = L.W / 2 + (fromTap ? j.home.x : j.p.x) * S;
  const y = fromTap ? HOME_PY + TOTAL_H * S / 2 + 14 : HOME_PY - j.p.y * S + TOTAL_H * S / 2 + 18;
  toast.style.left = clamp(x, 84, L.W - 84) + 'px';
  toast.style.top = y + 'px';
  toast.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('on'), fromTap ? 3200 : 1600);
}
toast.addEventListener('click', (e) => {
  toast.classList.remove('on');
  const t = document.querySelector(toast.getAttribute('href'));
  if (!t) return;
  e.preventDefault();
  t.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'start' });
  setTimeout(() => { t.classList.remove('arrive'); void t.offsetWidth; t.classList.add('arrive'); }, 650);
});

// =================== reset button ===================
const resetBtn = document.getElementById('resetBtn');
function jarDisplaced(j, t) {
  if (j.resetting) return false;
  const dp = Math.hypot(j.p.x - j.home.x, j.p.y - j.home.y);
  _qe.copy(homeQuat(j, t)).multiply(_qi.copy(j.q).invert());
  const ang = 2 * Math.acos(Math.min(1, Math.abs(_qe.w)));
  return dp > 0.25 || ang > 0.35 || j.wB.length() > 1.2;
}
function updateResetButton(t) {
  for (const j of jars) if (j.resetting) {
    const dp = Math.hypot(j.p.x - j.home.x, j.p.y - j.home.y);
    _qe.copy(homeQuat(j, t)).multiply(_qi.copy(j.q).invert());
    if (dp < 0.03 && 2 * Math.acos(Math.min(1, Math.abs(_qe.w))) < 0.05 && j.v.length() < 0.05) j.resetting = false;
  }
  const on = jars.some(j => jarDisplaced(j, t)) && !toast.classList.contains('on');
  if (on !== resetBtn.classList.contains('on')) {
    resetBtn.classList.toggle('on', on); resetBtn.tabIndex = on ? 0 : -1; resetBtn.setAttribute('aria-hidden', on ? 'false' : 'true');
  }
}
resetBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
resetBtn.addEventListener('mousedown', (e) => e.stopPropagation());
resetBtn.addEventListener('click', () => {
  for (const j of jars) { j.grab = null; j.resetting = true; j.lastTouch = -1e9; }
  active = null; pending = null; canvas.classList.remove('dragging');
  const icon = resetBtn.querySelector('svg');
  icon.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(-360deg)' }], { duration: 800, easing: 'cubic-bezier(.2,.75,.2,1)' });
  resetBtn.classList.remove('on'); resetBtn.tabIndex = -1;
});

// =================== motion ===================
// the photos' drift is CSS (translateY -5px..+6px, ease-in-out, alternate); the 3D continues it exactly
const easeInOut = cubicBezier(0.42, 0, 0.58, 1);
function syncDrift() {
  const flts = document.querySelectorAll('.jars .flt');
  jars.forEach((j, i) => {
    const a = flts[i] && flts[i].getAnimations ? flts[i].getAnimations().find((x) => x.animationName === 'drift') : null;
    if (a && a.currentTime != null) {
      const tm = a.effect.getTiming();
      j.drift = { start: performance.now() - (a.currentTime - tm.delay), dur: tm.duration };
    } else j.drift = { start: performance.now() + j.bobDel * 1000, dur: j.bobDur * 1000 };
  });
}
function driftPx(j, now) {
  const it = (now - j.drift.start) / j.drift.dur, k = Math.floor(it);
  let f = it - k; if (k & 1) f = 1 - f;          // alternate
  return 5 - 11 * easeInOut(f);                   // CSS: -5px (up) -> +6px (down); the 3D's +y is up
}
const _upw = new THREE.Vector3(), _shM = new THREE.Matrix4();
let lastT = 0, frameNo = 0, running = false, dead = false, shown = false, onScreen = true;
function isIdle() {
  if (active || pending) return false;
  for (const j of jars) {
    if (j.grab || j.resetting || j.v.lengthSq() > 0.003 || j.wB.lengthSq() > 0.01) return false;
    if (Math.abs(j.p.x - j.home.x) > 0.02 || Math.abs(j.p.y - j.home.y) > 0.02) return false;
  }
  return true;
}
function poseJars(now, t, dt) {
  for (const j of jars) {
    honeyUpdate(j, dt);
    j.x = j.p.x; j.y = j.p.y;
    // the site's gentle drift (-5px..+6px, 6.2s / 7.4s) on the same clock as the photos, and hover lift (16px) while upright
    const upright = _upw.set(0, 1, 0).applyQuaternion(j.q).y > 0.97;
    const bob = REDUCED ? 0 : driftPx(j, now) / S;
    const wantLift = (hovered === j && !j.grab && upright && now - j.lastTouch > 600) ? 16 / S : 0;
    j.hoverLift += (wantLift - j.hoverLift) * 0.08;
    j.group.position.set(j.p.x, j.p.y + bob + j.hoverLift, 0);
    j.group.quaternion.copy(j.q);
    updateHoneySurface(j);

    // shadow: follows the jar's footprint as it turns (lying down = longer), and softens, spreads and fades as the
    // jar's lowest point rises off the "floor" (drift and hover lift included, so it breathes with the float)
    const e = _shM.makeRotationFromQuaternion(j.q).elements, hx = A, hy = TOTAL_H / 2, hz = JAR_D / 2;
    const footX = (Math.abs(e[0]) * hx + Math.abs(e[4]) * hy + Math.abs(e[8]) * hz) / hx;
    const footZ = Math.min(2.5, (Math.abs(e[2]) * hx + Math.abs(e[6]) * hy + Math.abs(e[10]) * hz) / hz);
    const lowY = Math.abs(e[1]) * hx + Math.abs(e[5]) * hy + Math.abs(e[9]) * hz;
    const gap = Math.max(0, (j.p.y + bob + j.hoverLift - lowY + hy) * S);      // px from the jar's lowest point to the floor
    const spread = 1 + Math.min(gap, 300) / 380, fade = Math.max(0, 1 - gap / 280), contact = Math.max(0, 1 - gap / 60);
    j.shadow.position.set(j.p.x, j.floorY, -0.9);
    j.shadow.scale.set(j.shBase.w * footX * spread, j.shBase.h * footZ * spread, 1);
    j.shadow.material.opacity = 0.6 * fade * fade;
    j.shadowCore.position.set(j.p.x, j.floorY + 1 / S, -0.85);
    j.shadowCore.scale.set(j.shBase.cw * footX, j.shBase.ch * footZ, 1);
    j.shadowCore.material.opacity = 0.62 * contact;
  }
}
function animate(now) {
  if (!running) return;
  requestAnimationFrame(animate);
  watch(now);
  // phones: half rate while the jars just float (always, on older phones): it looks the same and saves battery
  if ((Q.halfRate || (Q.halfRateIdle && isIdle())) && (++frameNo & 1)) return;
  const t = now - BB.T0;
  const dt = Math.min(1 / 30, Math.max(1 / 240, (now - (lastT || now)) / 1000)); lastT = now;
  for (const j of jars) {
    const homing = !j.grab && now - j.lastTouch > RETURN_AFTER_MS;
    const hq = homeQuat(j, t);
    for (let k = 0; k < Q.substeps; k++) rbStep(j, dt / Q.substeps, homing, hq, B, now);
  }
  collide(jars[0], jars[1], now);
  updateResetButton(t);
  poseJars(now, t, dt);
  renderer.render(scene, camera);
}

// ---------- rest when nobody's looking: hero scrolled away, or tab in the background ----------
// The jars quietly go home, and nothing is drawn until the hero is back on screen.
function parkJars() {
  active = null; pending = null; hovered = null;
  canvas.classList.remove('dragging', 'hover');
  const t = performance.now() - BB.T0;
  for (const j of jars) {
    j.grab = null; j.resetting = false; j.lastTouch = -1e9;
    j.p.set(j.home.x, j.home.y, 0); j.px = j.p.x; j.v.set(0, 0, 0); j.wB.set(0, 0, 0);
    j.q.copy(homeQuat(j, t)); j.honeyQ.copy(j.q);
    j.nB.set(0, 1, 0); j.levelSolved = false;
    j.sx = j.sz = j.svx = j.svz = 0; j.velS = j.prevVelS = j.wS = j.prevWS = 0;
    j.cOff.set(0, 0, 0); j.cV.set(0, 0, 0); j.cPrevV.copy(j.v); j.cAcc.set(0, 0, 0);
  }
  resetBtn.classList.remove('on'); resetBtn.tabIndex = -1; resetBtn.setAttribute('aria-hidden', 'true');
  toast.classList.remove('on');
}
function sync() {
  const want = shown && onScreen && !document.hidden && !dead;
  if (want && !running) { running = true; lastT = 0; watchState.last = 0; requestAnimationFrame(animate); }
  else if (!want && running) { running = false; parkJars(); }
}
new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; sync(); }).observe(jarSlot);
document.addEventListener('visibilitychange', sync);

// ---------- speed check: if a phone turns out slower than it looked, step down (phone -> lite -> photos) ----------
const watchState = { from: 0, last: 0, gaps: [], done: false };
function watch(now) {
  if (TIER === 'full' || watchState.done) return;
  if (!watchState.from) { watchState.from = now + 1200; return; }      // let warm-up hitches pass
  if (now < watchState.from) { watchState.last = now; return; }
  if (watchState.last) watchState.gaps.push(now - watchState.last);
  watchState.last = now;
  if (watchState.gaps.length < 90) return;
  const gap = watchState.gaps.sort((a, b) => a - b)[45];               // median time between screen frames
  Object.assign(watchState, { gaps: [], from: now + 600, last: 0 });
  const fps = Math.round(1000 / gap);
  if (TIER === 'phone' && gap > 30) stepDown('lite', 'ran at ' + fps + ' fps');
  else if (TIER === 'lite' && gap > 48) stepDown('photo', 'ran at ' + fps + ' fps');
  else watchState.done = true;
}
function stepDown(to, reason) {
  BB.why.push(reason);
  if (to === 'photo') { giveUp(); return; }
  TIER = BB.tier = to; Q = QUALITY[to];
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, Q.dpr));
  for (const j of jars) {
    j.honey.material.dispose(); j.surface.material.dispose();
    j.honey.material = honeyMaterialLite({ ...j.lite, planes: [j.clip], comb: j.hasComb });
    j.surface.material = honeyMaterialLite({ ...j.lite, side: THREE.FrontSide, comb: j.hasComb });
    j.base.material.dispose(); j.base.material = honeyMaterialLite({ thin: j.lite.thin, thick: j.lite.thin });
    j.lid.material = lidMatLite; j.glass.material = glassReflLite;
    j.bub.n = Math.max(6, Math.round(j.bub.n * 0.5)); j.bub.mesh.count = j.bub.n;
  }
  layoutScene(); drawBackground(1e9);
  Object.assign(watchState, { from: 0, last: 0, gaps: [], done: false });
  BB.updatePill();
}
function giveUp(reason) {        // back to the still photos for good
  dead = true; running = false;
  resetBtn.classList.remove('on'); toast.classList.remove('on');
  BB.back2D(reason);
}
canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); giveUp('3D switched off by the browser'); });

// =================== boot ===================
// Build everything while the photos are up, wait for the intro to finish, then swap the 3D in where the photos sit.
await Promise.all([labelReady, BB.introEnd, document.fonts.ready]);
syncDrift();
measure();
layoutScene();
drawBackground(1e9);
try { await renderer.compileAsync(scene, camera); } catch (e) { renderer.compile(scene, camera); }   // no stutter at the swap
parkJars();
{ const now = performance.now(); poseJars(now, now - BB.T0, 1 / 60); renderer.render(scene, camera); }
shown = true;
sync();
await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
BB.show3D();
BB.updatePill();

let rt = 0;
window.addEventListener('resize', () => {
  clearTimeout(rt);
  rt = setTimeout(() => {
    if (dead) return;
    const r = stage.getBoundingClientRect();
    if (Math.abs(r.width - L.W) < 1 && Math.abs(r.height - L.H) < 1) return;   // e.g. a phone's address bar sliding away: nothing moved
    measure(); layoutScene(); drawBackground(1e9);
    if (!running) { const now = performance.now(); poseJars(now, now - BB.T0, 1 / 60); renderer.render(scene, camera); }
  }, 150);
});
