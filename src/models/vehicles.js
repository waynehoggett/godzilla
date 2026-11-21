import * as THREE from 'three/webgpu';
import { positionLocal, normalLocal, color, mix, smoothstep, step, vec2, float, abs, fract, mx_noise_float, atan } from 'three/tsl';
import { LoftGeometry } from 'three/addons/geometries/LoftGeometry.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { assets } from '../core/assets.js';

// Planes, boats, ships and the deck gun are lofted through cross-sections (the technique Three.js's
// own CarGenerator uses) and shaded with procedural TSL paint, so they stay smooth at any distance.
// If a matching file is listed in public/models/extra.json, that model is used instead (see README).

const V = THREE.Vector3;

// ---------- geometry helpers ----------
// Superellipse cross-section in the XY plane at depth z (e = 2 ellipse, larger = boxier).
function ring(z, hw, hh, cy = 0, e = 2, n = 24) {
  const pts = [];
  for (let j = 0; j < n; j++) {
    const a = (j / n) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    pts.push(new V(Math.sign(c) * Math.pow(Math.abs(c), 2 / e) * hw, cy + Math.sign(s) * Math.pow(Math.abs(s), 2 / e) * hh, z));
  }
  return pts;
}
// Smooth body through stations [z, halfWidth, halfHeight, centreY, squareness], tail to nose.
const hull = (stations, n = 24) => new LoftGeometry(stations.map((s) => ring(s[0], s[1], s[2], s[3] ?? 0, s[4] ?? 2, n)), { capStart: true, capEnd: true });

// Airfoil section at span position x: chord c centred on zc, height y, thickness ratio th.
function airfoil(x, c, zc, y, th, n = 18) {
  const pts = [];
  for (let j = 0; j < n; j++) {
    const t = (j / n) * Math.PI * 2;
    pts.push(new V(x, y + Math.sin(t) * th * c * 0.5 * (0.6 - 0.4 * Math.cos(t)), zc - Math.cos(t) * c * 0.5));
  }
  return pts;
}
// A wing through sections [x, chord, zc, y, thickness], given root to tip on the +X side; mirrored for the other.
function wing(sections, mirror = true) {
  const right = new LoftGeometry(sections.map((s) => airfoil(...s)), { capStart: true, capEnd: true });
  if (!mirror) return right;
  const left = new LoftGeometry([...sections].reverse().map((s) => airfoil(-s[0], s[1], s[2], s[3], s[4])), { capStart: true, capEnd: true });
  return mergeGeometries([right, left]);
}
const tf = (g, f) => { f(g); return g; };
const at = (g, x, y, z) => g.translate(x, y, z);
const cyl = (r1, r2, len, seg = 16) => new THREE.CylinderGeometry(r1, r2, len, seg);
const zcyl = (r1, r2, len, seg = 16) => cyl(r1, r2, len, seg).rotateX(Math.PI / 2); // along Z, r1 at +Z end
const merge = (list) => mergeGeometries(list);
function mesh(parent, geo, mat, shadow = true) { const m = new THREE.Mesh(geo, mat); m.castShadow = shadow; m.receiveShadow = shadow; parent.add(m); return m; }
function group(parent, x = 0, y = 0, z = 0) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }

// ---------- materials ----------
// Two-tone military paint: `top` on upward faces, `under` below; optional black cowl, hinomaru and wear.
function paint(o) {
  const m = new THREE.MeshPhysicalNodeMaterial({ metalness: o.metal ?? 0.35, clearcoat: 0.25, clearcoatRoughness: 0.5 });
  const p = positionLocal, n = normalLocal;
  let col = mix(color(o.under ?? 0xa8aca6), color(o.top), smoothstep(-0.3, 0.05, n.y));
  if (o.cowlZ !== undefined) col = mix(col, color(0x0d0f11), step(o.cowlZ, p.z));
  if (o.waterline !== undefined) col = mix(color(0x5a1f18), col, smoothstep(o.waterline - 0.05, o.waterline + 0.05, p.y));
  const red = color(0xb3161a);
  for (const d of o.wingMarks || []) col = mix(col, red, step(vec2(abs(p.x).sub(d.x), p.z.sub(d.z)).length(), d.r).mul(step(0.5, abs(n.y))));
  for (const d of o.sideMarks || []) col = mix(col, red, step(vec2(p.y.sub(d.y), p.z.sub(d.z)).length(), d.r).mul(step(0.55, abs(n.x))));
  // panel lines, plus soft weathering that also roughens the surface
  const k = o.panel ?? 1.1;
  const line = smoothstep(0.0, 0.018, abs(fract(p.z.mul(k)).sub(0.5))).mul(smoothstep(0.0, 0.012, abs(fract(p.x.mul(k * 0.8)).sub(0.5))));
  const wear = mx_noise_float(p.mul(o.wearScale ?? 1.6)).mul(0.5).add(0.5), grime = mx_noise_float(p.mul(0.45)).mul(0.5).add(0.5);
  m.colorNode = col.mul(mix(float(0.62), float(1), line)).mul(wear.mul(0.22).add(0.8)).mul(grime.mul(0.25).add(0.78));
  m.roughnessNode = wear.mul(0.3).add(o.rough ?? 0.42);
  return m;
}
const steel = (c = 0x23272b, rough = 0.38) => new THREE.MeshStandardMaterial({ color: c, metalness: 0.9, roughness: rough });
const matte = (c, rough = 0.85) => new THREE.MeshStandardMaterial({ color: c, roughness: rough });
const glass = () => new THREE.MeshPhysicalMaterial({ color: 0x88a8b8, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.38, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false });
// Planked, weathered timber: seams along `axis`.
function wood(c = 0x6b4a2c, seams = 2.4) {
  const m = new THREE.MeshStandardNodeMaterial({ metalness: 0 });
  const p = positionLocal, seam = smoothstep(0.0, 0.05, abs(fract(p.y.mul(seams)).sub(0.5)));
  const grain = mx_noise_float(vec2(p.z.mul(0.5), p.y.mul(6))).mul(0.5).add(0.5), stain = mx_noise_float(p.mul(0.35)).mul(0.5).add(0.5);
  m.colorNode = color(c).mul(mix(float(0.45), float(1), seam)).mul(grain.mul(0.3).add(0.75)).mul(stain.mul(0.35).add(0.7));
  m.roughnessNode = grain.mul(0.2).add(0.7);
  m.side = THREE.DoubleSide;
  return m;
}

// ---------- shared parts ----------
function propeller(parent, z, r, blades, facing = 1) {
  const p = group(parent, 0, 0, z), dark = steel(0x1c1e20, 0.5);
  mesh(p, tf(new THREE.ConeGeometry(r * 0.2, r * 0.42, 20), (g) => g.rotateX((facing * Math.PI) / 2).translate(0, 0, facing * r * 0.18)), steel(0x8a2a1c, 0.45));
  const blade = new LoftGeometry([airfoil(r * 0.14, r * 0.13, 0, 0, 0.22, 10), airfoil(r * 0.55, r * 0.17, 0, 0, 0.12, 10), airfoil(r, r * 0.07, 0, 0, 0.1, 10)], { capStart: true, capEnd: true });
  blade.rotateX(0.5);
  for (let i = 0; i < blades; i++) mesh(p, new THREE.BufferGeometry().copy(blade).rotateZ((i / blades) * Math.PI * 2), dark);
  const blur = new THREE.Mesh(new THREE.CircleGeometry(r, 40), new THREE.MeshBasicMaterial({ color: 0x15171a, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
  p.add(blur);
  return p;
}
function canopy(parent, z0, z1, hw, hh, cy, frames, frameMat) {
  const stations = [[z0, hw * 0.3, hh * 0.25, cy - hh * 0.5], [z0 + (z1 - z0) * 0.18, hw * 0.9, hh * 0.85, cy], [z0 + (z1 - z0) * 0.6, hw, hh, cy], [z1 - (z1 - z0) * 0.1, hw * 0.9, hh * 0.8, cy - hh * 0.1], [z1, hw * 0.5, hh * 0.2, cy - hh * 0.55]];
  mesh(parent, hull(stations, 20), glass(), false);
  for (const f of frames) {
    const t = (f - z0) / (z1 - z0), k = Math.sin(Math.min(1, Math.max(0.12, t)) * Math.PI) * 0.35 + 0.68;
    mesh(parent, at(new THREE.TorusGeometry(1, 0.045, 6, 24, Math.PI).scale(hw * k * 1.02, hh * k * 1.04, 1), 0, cy - hh * 0.08, f), frameMat);
  }
  mesh(parent, at(new THREE.BoxGeometry(0.05, 0.03, (z1 - z0) * 0.7), 0, cy + hh * 0.98, (z0 + z1) / 2), frameMat);
}
// Use a user-supplied model for this slot when one is installed.
function dropIn(slot, length, groundY = null) {
  const a = assets.extra && assets.extra[slot];
  if (!a) return null;
  const g = new THREE.Group(), inner = a.gltf.scene.clone(true);
  inner.rotation.y = THREE.MathUtils.degToRad(a.yaw || 0); inner.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(inner), size = box.getSize(new V()), k = (length / Math.max(size.x, size.z)) * (a.scale || 1), c = box.getCenter(new V());
  inner.position.set(-c.x, groundY === null ? -c.y : -box.min.y, -c.z); g.add(inner); g.scale.setScalar(k);
  if (groundY !== null) g.position.y = groundY;
  inner.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  return g;
}

function zeroGear(f, doorMat, y) {
  for (const s of [1, -1]) {
    const leg = group(f, 1.75 * s, y, 0.95); leg.rotation.x = 0.19;
    mesh(leg, at(cyl(0.05, 0.05, 1.2, 10), 0, -0.6, 0), steel(0x8a8f92, 0.35));
    mesh(leg, at(new THREE.BoxGeometry(0.04, 0.9, 0.5), 0.08 * s, -0.55, 0), doorMat);
    mesh(leg, at(new THREE.TorusGeometry(0.27, 0.13, 12, 24).rotateY(Math.PI / 2), 0, -1.22, 0), matte(0x101112, 0.9));
    mesh(leg, at(cyl(0.14, 0.14, 0.14, 16).rotateZ(Math.PI / 2), 0, -1.22, 0), steel(0x7a7f82, 0.4));
  }
  mesh(f, at(new THREE.TorusGeometry(0.1, 0.05, 8, 16).rotateY(Math.PI / 2), 0, y - 0.15, -4.2), matte(0x101112)); // tail wheel
}

// ---------- Mitsubishi A6M Zero: ~9 long, nose toward +Z, wheels on y=0 ----------
export function makeZero() {
  const g = new THREE.Group(), f = group(g, 0, 1.75, 0);
  f.rotation.x = -0.19; // tail-dragger stance
  const drop = dropIn('zero', 9.1);
  if (drop) {
    // the sourced model is in flying trim, so it gets landing gear for the airstrip and a spinning prop disc
    f.add(drop); zeroGear(f, matte(0x8f948c, 0.6), -0.55);
    const prop = group(f, 0, 0, 4.5);
    prop.add(new THREE.Mesh(new THREE.CircleGeometry(1.5, 40), new THREE.MeshBasicMaterial({ color: 0x15171a, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false })));
    return { root: g, prop, body: f };
  }
  const green = paint({ top: 0x2c4630, under: 0xa9ada6, cowlZ: 2.42, wingMarks: [{ x: 3.9, z: 0.7, r: 0.62 }], sideMarks: [{ y: 0.05, z: -1.75, r: 0.4 }] });
  const parts = [
    hull([[-4.7, 0.04, 0.07, 0.2], [-4.0, 0.2, 0.3, 0.14], [-2.4, 0.42, 0.54, 0.06], [-0.7, 0.56, 0.68, 0], [0.9, 0.62, 0.7, 0], [2.25, 0.65, 0.68, 0], [2.45, 0.74, 0.74, 0], [3.55, 0.73, 0.73, 0], [3.95, 0.56, 0.56, 0], [4.02, 0.3, 0.3, 0]]),
    wing([[0.45, 2.5, 0.75, -0.38, 0.15], [3.0, 1.9, 0.72, -0.2, 0.13], [5.7, 1.15, 0.7, 0.02, 0.1], [6.02, 0.55, 0.62, 0.05, 0.08]]),
    wing([[0.12, 1.25, -3.95, 0.22, 0.1], [1.4, 0.85, -4.02, 0.24, 0.09], [2.0, 0.4, -4.1, 0.25, 0.07]]),
    tf(wing([[0.0, 1.5, -4.05, 0, 0.09], [1.0, 1.05, -4.25, 0, 0.08], [1.55, 0.5, -4.45, 0, 0.06]], false), (w) => w.rotateZ(Math.PI / 2).translate(0, 0.25, 0)),
  ];
  mesh(f, merge(parts), green);
  canopy(f, -1.15, 1.75, 0.38, 0.5, 0.62, [-0.6, 0.0, 0.6, 1.2], matte(0x243a28, 0.6));
  const dark = steel();
  for (const s of [1, -1]) {
    mesh(f, at(zcyl(0.035, 0.035, 0.9, 8), 1.95 * s, -0.27, 2.1), dark);                         // 20mm cannon
    for (let i = 0; i < 3; i++) mesh(f, at(zcyl(0.05, 0.06, 0.3, 8), 0.72 * s, -0.25 - i * 0.14, 2.35), steel(0x3a2a22, 0.7)); // exhaust stubs
  }
  zeroGear(f, green, -0.4);
  mesh(f, at(cyl(0.02, 0.02, 0.7, 6), 0, 1.35, -1.0), dark);                                    // aerial mast
  const prop = propeller(f, 4.08, 1.52, 3);
  return { root: g, prop, body: f };
}

// ---------- Kyushu J7W Shinden: canard fighter with a pusher propeller, nose toward +Z ----------
export function makeShinden() {
  const g = new THREE.Group();
  const drop = dropIn('shinden', 9.7);
  if (drop) { g.add(drop); return { root: g, prop: new THREE.Group() }; }
  const green = paint({ top: 0x2f4a33, under: 0xa9ada6, wingMarks: [{ x: 4.25, z: -2.85, r: 0.56 }], sideMarks: [{ y: 0.0, z: -0.7, r: 0.4 }] });
  const fin = (x) => tf(wing([[0.0, 1.9, -3.0, 0, 0.08], [1.25, 1.35, -3.25, 0, 0.07], [2.15, 0.7, -3.55, 0, 0.06]], false), (w) => w.rotateZ(Math.PI / 2).translate(x, -0.95, 0));
  const scoop = (s) => hull([[-2.4, 0.1, 0.2, 0.1], [-1.8, 0.2, 0.34, 0.1], [-0.9, 0.2, 0.32, 0.1], [-0.55, 0.14, 0.26, 0.1]], 14).translate(0.62 * s, 0, 0);
  mesh(g, merge([
    hull([[-4.0, 0.36, 0.36, 0], [-3.2, 0.56, 0.6, 0], [-1.6, 0.66, 0.74, 0], [0.0, 0.6, 0.76, 0], [1.5, 0.52, 0.66, -0.02], [3.0, 0.4, 0.5, -0.05], [4.2, 0.24, 0.28, -0.08], [4.85, 0.05, 0.06, -0.1]]),
    wing([[0.5, 3.0, -1.75, -0.32, 0.13], [3.0, 2.1, -2.6, -0.22, 0.11], [5.3, 1.3, -3.3, -0.12, 0.09], [5.6, 0.6, -3.45, -0.1, 0.07]]),
    wing([[0.3, 1.05, 3.55, -0.12, 0.11], [1.5, 0.7, 3.45, -0.1, 0.09], [1.95, 0.35, 3.4, -0.1, 0.07]]),     // canards
    fin(3.0), fin(-3.0), scoop(1), scoop(-1),
  ]), green);
  canopy(g, -0.5, 1.9, 0.36, 0.48, 0.62, [0.0, 0.55, 1.1], matte(0x243a28, 0.6));
  const dark = steel();
  for (const [x, y] of [[0.14, 0.12], [-0.14, 0.12], [0.2, -0.08], [-0.2, -0.08]]) mesh(g, at(zcyl(0.04, 0.04, 1.1, 8), x, y - 0.08, 4.5), dark); // 30mm cannons
  mesh(g, at(zcyl(0.34, 0.2, 0.5, 20), 0, 0, -4.2), steel(0x3a3d40, 0.5));
  const prop = propeller(g, -4.45, 1.7, 6, -1);
  return { root: g, prop };
}

// ---------- boats ----------
// Open wooden hull: stations [z, halfBeam, keelY, sheerY]; returns the shell and a deck at deckDrop below the rail.
function boatHull(stations, deckDrop = 0.55, n = 14) {
  const sections = stations.map(([z, hw, keel, sheer]) => {
    const pts = [];
    for (let j = 0; j <= n; j++) {
      const a = Math.PI + (j / n) * Math.PI, c = Math.cos(a), s = Math.sin(a); // port rail -> keel -> starboard rail
      pts.push(new V(Math.sign(c) * Math.pow(Math.abs(c), 0.62) * hw, sheer + s * (sheer - keel), z));
    }
    return pts;
  });
  const shell = new LoftGeometry(sections, { closed: false });
  const outline = new THREE.Shape();
  stations.forEach(([z, hw], i) => (i ? outline.lineTo(hw * 0.97, z) : outline.moveTo(hw * 0.97, z)));
  [...stations].reverse().forEach(([z, hw]) => outline.lineTo(-hw * 0.97, z));
  const deck = new THREE.ShapeGeometry(outline).rotateX(Math.PI / 2);
  const dp = deck.attributes.position;
  // the deck follows the sheer line
  for (let i = 0; i < dp.count; i++) {
    const z = dp.getZ(i); let y = stations[0][3];
    for (let k = 0; k < stations.length - 1; k++) if (z >= stations[k][0] && z <= stations[k + 1][0]) { const t = (z - stations[k][0]) / (stations[k + 1][0] - stations[k][0]); y = stations[k][3] + (stations[k + 1][3] - stations[k][3]) * t; }
    dp.setY(i, y - deckDrop);
  }
  deck.computeVertexNormals();
  // transom
  const [z0, hw0, keel0, sheer0] = stations[0], tr = new THREE.Shape();
  tr.moveTo(-hw0, sheer0); tr.lineTo(hw0, sheer0); tr.quadraticCurveTo(hw0 * 0.9, keel0, 0, keel0); tr.quadraticCurveTo(-hw0 * 0.9, keel0, -hw0, sheer0);
  const transom = new THREE.ShapeGeometry(tr).translate(0, 0, z0);
  const rail = (s) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(stations.map(([z, hw, , sheer]) => new V(hw * s, sheer + 0.04, z))), 40, 0.09, 6);
  return { shell, deck, transom, rails: mergeGeometries([rail(1), rail(-1)]) };
}
function windows(parent, w, h, d, y, z, glassMat) {
  mesh(parent, at(new THREE.BoxGeometry(w * 0.82, h * 0.34, 0.06), 0, y + h * 0.16, z + d / 2 + 0.01), glassMat, false);
  for (const s of [1, -1]) mesh(parent, at(new THREE.BoxGeometry(0.06, h * 0.3, d * 0.6), s * (w / 2 + 0.01), y + h * 0.16, z), glassMat, false);
}

// Wooden minesweeper Shinsei Maru. ~22 long, bow toward +Z, waterline at y=0.
export function makeShinsei() {
  const g = new THREE.Group();
  const drop = dropIn('boat', 22, -1.0);
  if (drop) { g.add(drop); return { root: g }; }
  const H = boatHull([[-10, 2.3, -0.5, 2.2], [-8, 2.9, -1.1, 2.05], [-3, 3.15, -1.3, 1.95], [3, 3.0, -1.25, 2.05], [7, 2.1, -1.0, 2.5], [9.6, 0.9, -0.5, 3.0], [10.7, 0.06, 0.4, 3.3]]);
  const hullMat = wood(0x5c3f26), deckMat = wood(0x8a6d4a, 0), white = matte(0xd9d3c2, 0.7), dark = matte(0x1d1b19, 0.8), glassMat = new THREE.MeshPhysicalMaterial({ color: 0x1a2a34, roughness: 0.1, metalness: 0.2 });
  mesh(g, H.shell, hullMat); mesh(g, H.transom, hullMat); mesh(g, H.rails, wood(0x3f2b1a, 0)); mesh(g, H.deck, deckMat);
  // wheelhouse, galley, funnel
  mesh(g, at(new RoundedBoxGeometry(3.4, 2.5, 4.2, 3, 0.18), 0, 2.75, -3.6), white);
  mesh(g, at(new RoundedBoxGeometry(3.9, 0.16, 4.8, 2, 0.06), 0, 4.05, -3.5), wood(0x4a3320, 0));
  windows(g, 3.4, 2.5, 4.2, 2.9, -3.6, glassMat);
  mesh(g, at(new RoundedBoxGeometry(2.6, 1.3, 2.2, 3, 0.12), 0, 2.2, -6.9), white);
  mesh(g, at(cyl(0.38, 0.44, 2.6, 18), 0, 5.2, -5.2), matte(0x25221f, 0.6)); mesh(g, at(cyl(0.4, 0.4, 0.35, 18), 0, 6.1, -5.2), matte(0x8a2a1c, 0.6));
  // masts, boom, rigging
  const spar = wood(0x6a4a2c, 0);
  mesh(g, at(cyl(0.09, 0.13, 8.5, 10), 0, 5.8, 1.2), spar); mesh(g, at(cyl(0.06, 0.08, 5, 8).rotateX(1.15), 0, 4.2, 3.6), spar); mesh(g, at(cyl(0.07, 0.1, 5, 8), 0, 4.2, -8.6), spar);
  for (const [a, b] of [[[0, 10, 1.2], [0, 3.3, 10.5]], [[0, 10, 1.2], [0, 6.6, -8.6]], [[0, 10, 1.2], [2.9, 2.1, 0]], [[0, 10, 1.2], [-2.9, 2.1, 0]]]) {
    const A = new V(...a), B = new V(...b), d = B.clone().sub(A), line = cyl(0.015, 0.015, d.length(), 4);
    const m = mesh(g, line, dark, false); m.position.copy(A).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(new V(0, 1, 0), d.normalize());
  }
  // deck gear: winch, crates, sweep-wire drum, life rings, lantern
  mesh(g, at(cyl(0.45, 0.45, 1.4, 16).rotateZ(Math.PI / 2), 0, 2.2, 5.6), steel(0x3a3d40, 0.6));
  mesh(g, at(cyl(0.6, 0.6, 1.8, 18).rotateZ(Math.PI / 2), 0, 2.15, -8.6), steel(0x4a4038, 0.7));
  for (const [x, z, s] of [[1.6, 2.6, 0.8], [-1.5, 3.3, 0.7], [1.2, 3.6, 0.6]]) mesh(g, at(new RoundedBoxGeometry(s, s, s, 2, 0.04), x, 1.5 + s / 2, z), wood(0x7a5a38, 3));
  for (const s of [1, -1]) mesh(g, at(new THREE.TorusGeometry(0.36, 0.09, 8, 20).rotateY(Math.PI / 2), 1.74 * s, 3.0, -2.6), matte(0xd8d0c0, 0.7));
  mesh(g, at(new THREE.SphereGeometry(0.14, 10, 8), 0, 4.45, -1.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc070).multiplyScalar(2.5) }), false);
  return { root: g };
}

export function makeTug() {
  const g = new THREE.Group();
  const H = boatHull([[-6.5, 1.9, -0.4, 1.7], [-4.5, 2.5, -1.0, 1.6], [0, 2.7, -1.1, 1.6], [4, 2.0, -0.9, 2.0], [6.4, 0.7, -0.3, 2.5], [7.2, 0.05, 0.3, 2.7]], 0.4, 12);
  const black = paint({ top: 0x1e2224, under: 0x1e2224, waterline: 0.15, metal: 0.2, rough: 0.6 }); black.side = THREE.DoubleSide;
  mesh(g, H.shell, black); mesh(g, H.transom, black); mesh(g, H.rails, matte(0x15171a)); mesh(g, H.deck, wood(0x7a6044, 0));
  mesh(g, at(new RoundedBoxGeometry(3.0, 2.3, 3.6, 3, 0.16), 0, 2.5, -0.6), matte(0xd8d2c0, 0.7));
  windows(g, 3.0, 2.3, 3.6, 2.7, -0.6, new THREE.MeshPhysicalMaterial({ color: 0x1a2a34, roughness: 0.1 }));
  mesh(g, at(cyl(0.5, 0.56, 2.6, 18), 0, 4.6, -1.6), matte(0xa83a22, 0.6)); mesh(g, at(cyl(0.52, 0.52, 0.5, 18), 0, 5.7, -1.6), matte(0x151515, 0.6));
  for (let i = 0; i < 5; i++) for (const s of [1, -1]) mesh(g, at(new THREE.TorusGeometry(0.34, 0.14, 8, 16).rotateY(Math.PI / 2), 2.55 * s, 1.1, -4 + i * 2), matte(0x0e0e0e, 0.95));
  mesh(g, at(cyl(0.16, 0.2, 1.1, 10), 0, 1.8, -4.6), steel(0x3a3d40, 0.6));
  return { root: g };
}

// Grey warship; len 60-70 = destroyer, 120+ = heavy cruiser. Bow toward +Z, waterline at y=0.
export function makeWarship(len = 60) {
  const g = new THREE.Group(), w = len * 0.11, big = len > 100;
  const drop = dropIn('destroyer', len, -w * 0.3);
  if (drop) { g.add(drop); return { root: g, turrets: [], len, beam: w }; }
  const grey = paint({ top: 0x6c767e, under: 0x626c74, waterline: 0.4, metal: 0.25, rough: 0.5, panel: 12 / len, wearScale: 30 / len });
  const deckY = w * 0.55, st = (z, hw, sheer = 0) => [len * z, w * hw, (deckY + w * sheer + w * 0.35) / 2, (deckY + w * sheer - w * 0.35) / 2, 3.2];
  mesh(g, hull([st(-0.5, 0.28), st(-0.44, 0.42), st(-0.2, 0.5), st(0.15, 0.5), st(0.33, 0.38, 0.06), st(0.44, 0.17, 0.16), st(0.5, 0.012, 0.26)], 28), grey);
  const upper = paint({ top: 0x737d85, under: 0x69737b, metal: 0.25, rough: 0.5, panel: 14 / len, wearScale: 30 / len }), dk = steel(0x3f474e, 0.55);
  const box = (x, y, z, sx, sy, sz, mat = upper) => mesh(g, at(new RoundedBoxGeometry(sx, sy, sz, 2, Math.min(sx, sy, sz) * 0.12), x, y, z), mat);
  box(0, deckY + w * 0.22, -len * 0.02, w * 0.66, w * 0.44, len * 0.34);                                  // deckhouse
  const levels = big ? 5 : 3;
  for (let i = 0; i < levels; i++) box(0, deckY + w * (0.6 + i * 0.3), len * 0.09 - i * w * 0.05, w * (0.56 - i * 0.07), w * 0.32, len * (0.085 - i * 0.008)); // bridge tower
  mesh(g, at(cyl(w * 0.03, w * 0.05, w * (big ? 2.6 : 1.9), 8), 0, deckY + w * (big ? 2.9 : 2.0), len * 0.07), dk); // foremast
  mesh(g, at(cyl(w * 0.02, w * 0.02, w * 0.9, 6).rotateZ(Math.PI / 2), 0, deckY + w * (big ? 3.5 : 2.5), len * 0.07), dk);
  for (const z of big ? [-0.02, -0.1] : [-0.04, -0.13]) {                                                 // raked funnels
    const fn = mesh(g, cyl(w * 0.2, w * 0.24, w * 1.25, 20).scale(1, 1, 1.5), upper); fn.position.set(0, deckY + w * 1.0, len * z); fn.rotation.x = -0.18;
    const cap = mesh(g, cyl(w * 0.21, w * 0.21, w * 0.22, 20).scale(1, 1, 1.5), matte(0x15171a, 0.7)); cap.position.set(0, deckY + w * 1.62, len * z - w * 0.11); cap.rotation.x = -0.18;
  }
  mesh(g, at(cyl(w * 0.025, w * 0.04, w * 1.6, 8), 0, deckY + w * 1.4, -len * 0.2), dk);                    // mainmast
  const turrets = [];
  for (const z of big ? [0.33, 0.26, 0.19, -0.3, -0.37] : [0.3, -0.3, -0.38]) {
    const t = group(g, 0, deckY + w * (z === 0.26 ? 0.42 : 0.16), len * z), dir = Math.sign(z);
    mesh(t, at(cyl(w * 0.2, w * 0.22, w * 0.2, 20), 0, -w * 0.05, 0), dk);
    mesh(t, new RoundedBoxGeometry(w * 0.44, w * 0.24, w * 0.52, 3, w * 0.06).translate(0, w * 0.12, 0), upper);
    for (const s of [1, -1]) mesh(t, at(zcyl(w * 0.025, w * 0.032, w * 0.85, 10), w * 0.1 * s, w * 0.13, dir * w * 0.62), dk);
    turrets.push(t);
  }
  for (const s of [1, -1]) { box(w * 0.36 * s, deckY + w * 0.1, -len * 0.12, w * 0.12, w * 0.1, len * 0.06, matte(0xcfc8b8, 0.8)); mesh(g, at(zcyl(w * 0.05, w * 0.05, len * 0.07, 10), w * 0.34 * s, deckY + w * 0.1, len * 0.02), dk); } // boats, torpedo tubes
  return { root: g, turrets, len, beam: w };
}

// ---------- ordnance and gear ----------
export function makeMine(r = 1.4) {
  const g = new THREE.Group(), iron = new THREE.MeshStandardNodeMaterial({ metalness: 0.75 });
  const rust = mx_noise_float(positionLocal.mul(2.2 / r)).mul(0.5).add(0.5);
  iron.colorNode = mix(color(0x15181a), color(0x4a2a1a), smoothstep(0.45, 0.8, rust)); iron.roughnessNode = rust.mul(0.4).add(0.45);
  mesh(g, new THREE.SphereGeometry(r, 28, 20), iron);
  mesh(g, new THREE.TorusGeometry(r * 1.005, r * 0.035, 6, 32).rotateX(Math.PI / 2), steel(0x15181a, 0.6));
  for (let i = 0; i < 10; i++) {
    const a = i * 2.4, b = Math.acos(1 - (2 * (i + 0.5)) / 10), d = new V(Math.sin(b) * Math.cos(a), Math.cos(b), Math.sin(b) * Math.sin(a));
    const horn = mesh(g, mergeGeometries([cyl(r * 0.06, r * 0.1, r * 0.34, 10).translate(0, r * 0.17, 0), new THREE.SphereGeometry(r * 0.06, 8, 6).translate(0, r * 0.34, 0)]), steel(0x2a2d30, 0.5));
    horn.position.copy(d).multiplyScalar(r * 0.97); horn.quaternion.setFromUnitVectors(new V(0, 1, 0), d);
  }
  return g;
}

function gores(c1, c2, n) {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.75, side: THREE.DoubleSide });
  const a = atan(positionLocal.z, positionLocal.x).div(Math.PI * 2).mul(n), seam = smoothstep(0.0, 0.04, abs(fract(a).sub(0.5)));
  m.colorNode = mix(color(c1), color(c2), step(0.5, fract(a.mul(0.5)))).mul(mix(float(0.7), float(1), seam));
  return m;
}
export function makeBalloon(r = 8) {
  const g = new THREE.Group();
  mesh(g, new THREE.SphereGeometry(r, 32, 20).scale(1, 0.92, 1), gores(0xd89a22, 0xc8861c, 12));
  return g;
}
export function makeParachute() {
  const g = new THREE.Group();
  const c = mesh(g, new THREE.SphereGeometry(1, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2), gores(0xece6d6, 0xd9d2c0, 12));
  c.position.y = 5; c.scale.set(3.4, 2.4, 3.4);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2, A = new V(Math.cos(a) * 3.35, 5.05, Math.sin(a) * 3.35), B = new V(0, 1.5, 0), d = B.clone().sub(A);
    const l = mesh(g, cyl(0.012, 0.012, d.length(), 4), matte(0x55504a), false); l.position.copy(A).addScaledVector(d, 0.5); l.quaternion.setFromUnitVectors(new V(0, 1, 0), d.normalize());
  }
  return { root: g, canopy: c };
}

// Type 93-style 13 mm deck machine gun, barrel along +Z, grips toward the viewer.
export function makeGun() {
  const g = new THREE.Group();
  const drop = dropIn('gun', 2.4);
  if (drop) { g.add(drop); return g; }
  const blued = steel(0x1d2226, 0.34), worn = steel(0x3a4046, 0.45), grip = matte(0x3a2a1c, 0.6);
  // barrel with cooling fins and flash hider
  mesh(g, at(zcyl(0.04, 0.045, 2.0, 16), 0, 0, 1.35), blued);
  for (let i = 0; i < 22; i++) mesh(g, at(zcyl(0.075, 0.075, 0.022, 20), 0, 0, 0.55 + i * 0.05), worn);
  mesh(g, at(zcyl(0.085, 0.05, 0.22, 18), 0, 0, 2.42), blued);
  mesh(g, at(zcyl(0.06, 0.06, 0.3, 16), 0, 0, 0.42), worn);
  // receiver, feed cover, magazine
  mesh(g, at(new RoundedBoxGeometry(0.22, 0.26, 0.86, 3, 0.03), 0, 0, -0.12), blued);
  mesh(g, at(new RoundedBoxGeometry(0.17, 0.05, 0.5, 2, 0.015), 0, 0.15, -0.05), worn);
  mesh(g, at(new RoundedBoxGeometry(0.14, 0.42, 0.26, 3, 0.03).rotateX(0.18), 0, 0.36, 0.02), blued);
  mesh(g, at(zcyl(0.02, 0.02, 0.2, 8).rotateY(Math.PI / 2), 0.14, 0.02, 0.1), worn);                    // charging handle
  // spade grips and trigger bar
  for (const s of [1, -1]) { mesh(g, at(cyl(0.028, 0.028, 0.26, 10), 0.11 * s, 0, -0.74), grip); mesh(g, at(zcyl(0.014, 0.014, 0.2, 6), 0.11 * s, 0.11, -0.64), worn); mesh(g, at(zcyl(0.014, 0.014, 0.2, 6), 0.11 * s, -0.11, -0.64), worn); }
  mesh(g, at(new THREE.BoxGeometry(0.2, 0.03, 0.03), 0, 0, -0.76), worn);
  // ring sight and front post
  mesh(g, at(new THREE.TorusGeometry(0.085, 0.008, 6, 28), 0, 0.3, 0.3), worn);
  mesh(g, at(new THREE.TorusGeometry(0.04, 0.006, 6, 20), 0, 0.3, 0.3), worn);
  mesh(g, at(new THREE.BoxGeometry(0.17, 0.006, 0.006), 0, 0.3, 0.3), worn); mesh(g, at(new THREE.BoxGeometry(0.006, 0.26, 0.006), 0, 0.27, 0.3), worn);
  mesh(g, at(new THREE.BoxGeometry(0.008, 0.16, 0.008), 0, 0.14, 2.2), worn); mesh(g, at(new THREE.SphereGeometry(0.014, 8, 6), 0, 0.22, 2.2), worn);
  // cradle and pintle
  mesh(g, at(new RoundedBoxGeometry(0.3, 0.07, 0.4, 2, 0.02), 0, -0.17, 0.05), worn);
  for (const s of [1, -1]) mesh(g, at(new THREE.BoxGeometry(0.03, 0.3, 0.14), 0.15 * s, -0.08, 0.05), worn);
  mesh(g, at(cyl(0.07, 0.11, 0.9, 16), 0, -0.65, 0.05), blued);
  mesh(g, at(cyl(0.2, 0.24, 0.1, 20), 0, -1.12, 0.05), worn);
  g.scale.setScalar(0.8);
  return g;
}
