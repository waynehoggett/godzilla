import * as THREE from 'three/webgpu';
import { part, pivot } from './godzilla.js';

const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, flatShading: true, ...o });
const box = new THREE.BoxGeometry(1, 1, 1);
const cyl = new THREE.CylinderGeometry(1, 1, 1, 10);
const cone = new THREE.ConeGeometry(1, 1, 8);
const sph = new THREE.SphereGeometry(1, 10, 8);
const disc = new THREE.CircleGeometry(1, 16);
const RED = new THREE.MeshBasicMaterial({ color: 0xc8201a, side: THREE.DoubleSide });

function propeller(parent, x, y, z, r) {
  const p = pivot(parent, x, y, z);
  const blur = new THREE.Mesh(disc, new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }));
  blur.scale.setScalar(r); p.add(blur);
  for (let i = 0; i < 3; i++) { const b = part(p, box, M(0x2a2a2a), 0, 0, 0, 0.14, r * 2, 0.05); b.rotation.z = (i * Math.PI) / 3; }
  return p;
}
function roundel(parent, x, y, z, r, rx = -Math.PI / 2) {
  const m = new THREE.Mesh(disc, RED); m.position.set(x, y, z); m.rotation.x = rx; m.scale.setScalar(r); parent.add(m);
}

// A6M Zero. ~9 units long, nose toward +Z, wheels at y=0.
export function makeZero() {
  const g = new THREE.Group(), green = M(0x3d5038), grey = M(0xa9aca4);
  const f = pivot(g, 0, 1.6, 0);
  const fus = part(f, cyl, green, 0, 0, 0, 0.62, 7.2, 0.62); fus.rotation.x = Math.PI / 2;
  const tailc = part(f, cone, green, 0, 0, -4.6, 0.6, 2.2, 0.6); tailc.rotation.x = -Math.PI / 2;
  const cowl = part(f, cyl, M(0x15171a), 0, 0, 3.9, 0.66, 0.9, 0.66); cowl.rotation.x = Math.PI / 2;
  part(f, box, green, 0, -0.2, 0.6, 11, 0.14, 1.9);
  part(f, box, grey, 0, -0.28, 0.6, 10.8, 0.05, 1.8);
  part(f, box, green, 0, 0.1, -4.9, 3.6, 0.1, 1.0);
  part(f, box, green, 0, 0.8, -5.0, 0.1, 1.4, 1.0);
  part(f, sph, M(0x7fa0b0, { roughness: 0.2, metalness: 0.4 }), 0, 0.55, 0.2, 0.42, 0.42, 1.2);
  roundel(f, 3.6, -0.12, 0.6, 0.6); roundel(f, -3.6, -0.12, 0.6, 0.6);
  for (const s of [1, -1]) { part(f, cyl, M(0x222), 1.6 * s, -1.0, 0.9, 0.06, 1.4, 0.06); const w = part(f, cyl, M(0x111), 1.6 * s, -1.6, 0.9, 0.36, 0.2, 0.36); w.rotation.z = Math.PI / 2; }
  const prop = propeller(f, 0, 0, 4.4, 1.5);
  return { root: g, prop, body: f };
}

// J7W Shinden: canard fighter with a pusher propeller. Nose toward +Z, origin at centre of mass.
export function makeShinden() {
  const g = new THREE.Group(), green = M(0x3f5a3c), grey = M(0xb4b8b0), dark = M(0x1a1c1e);
  const fus = part(g, cyl, green, 0, 0, 0, 0.6, 7.6, 0.6); fus.rotation.x = Math.PI / 2;
  const nose = part(g, cone, green, 0, 0, 4.8, 0.6, 2.0, 0.6); nose.rotation.x = Math.PI / 2;
  part(g, box, grey, 0, -0.3, -0.2, 0.9, 0.3, 7.2);
  part(g, box, green, 0, 0, 4.0, 3.6, 0.1, 0.8);                 // canards
  for (const s of [1, -1]) {
    const w = part(g, box, green, 2.9 * s, -0.1, -2.0, 5.2, 0.14, 2.2); w.rotation.y = 0.32 * s; // swept main wing
    part(g, box, green, 3.3 * s, 0.6, -3.0, 0.1, 1.8, 1.5);     // wing fins
    roundel(g, 3.2 * s, 0.0, -2.0, 0.55);
    for (let i = 0; i < 2; i++) part(g, cyl, dark, (0.2 + i * 0.22) * s, 0.15, 5.0, 0.04, 1.4, 0.04).rotation.x = Math.PI / 2; // 30mm cannons
  }
  part(g, sph, M(0x7fa0b0, { roughness: 0.2, metalness: 0.4 }), 0, 0.52, 0.8, 0.42, 0.42, 1.3);
  const scoop = part(g, box, dark, 0, 0.1, -2.4, 1.5, 0.5, 1.2); scoop.visible = true;
  const prop = propeller(g, 0, 0, -3.95, 1.6);
  return { root: g, prop };
}

// Wooden minesweeper Shinsei Maru. ~22 long, bow toward +Z, waterline at y=0.
export function makeShinsei() {
  const g = new THREE.Group(), wood = M(0x6b4a2c), deck = M(0x8a6a45), cabin = M(0xb9b09a), dark = M(0x2a2622);
  part(g, box, wood, 0, 0.6, -1, 6, 2.6, 16);
  const bow = part(g, cone, wood, 0, 0.6, 9.6, 3, 6, 1.3); bow.rotation.x = Math.PI / 2; bow.scale.set(3, 6, 1.3); bow.rotation.z = 0;
  part(g, box, deck, 0, 1.95, -1, 5.6, 0.12, 15.6);
  part(g, box, cabin, 0, 3.3, -3.5, 3.6, 2.6, 4.6);
  part(g, box, dark, 0, 3.7, -1.15, 3.0, 0.9, 0.1);
  part(g, box, wood, 0, 4.7, -3.5, 4.0, 0.2, 5.0);
  part(g, cyl, dark, 0, 6.2, -5.0, 0.4, 3.0, 0.4);
  part(g, cyl, wood, 0, 6.5, 1.0, 0.12, 9, 0.12);
  part(g, box, wood, 0, 2.6, 7.0, 5.0, 1.2, 0.2); part(g, box, wood, 0, 2.6, -8.9, 5.6, 1.2, 0.2);
  for (const s of [1, -1]) part(g, box, wood, 2.9 * s, 2.5, -1, 0.2, 1.0, 15.8);
  return { root: g };
}

// Grey warship; len 60 = destroyer, 120 = heavy cruiser. Bow toward +Z.
export function makeWarship(len = 60) {
  const g = new THREE.Group(), grey = M(0x6f7a82), dk = M(0x4a5258), w = len * 0.11;
  part(g, box, grey, 0, w * 0.2, -len * 0.05, w, w * 0.9, len * 0.8);
  const bow = part(g, cone, grey, 0, w * 0.2, len * 0.47, 1, 1, 1); bow.rotation.x = Math.PI / 2; bow.scale.set(w * 0.5, len * 0.25, w * 0.45);
  part(g, box, dk, 0, w * 0.95, 0, w * 0.7, w * 0.7, len * 0.3);
  part(g, box, dk, 0, w * 1.7, len * 0.06, w * 0.5, w * 0.9, len * 0.1);
  part(g, cyl, dk, 0, w * 2.6, len * 0.06, w * 0.06, w * 1.6, w * 0.06);
  for (const z of [-0.08, 0.0]) part(g, cyl, dk, 0, w * 1.6, len * z - len * 0.04, w * 0.22, w * 1.3, w * 0.28);
  const turrets = [];
  for (const z of [0.3, 0.22, -0.3, -0.38]) {
    if (len < 100 && (z === 0.22 || z === -0.38)) continue;
    const t = pivot(g, 0, w * 0.85, len * z);
    part(t, box, grey, 0, 0, 0, w * 0.5, w * 0.3, w * 0.6);
    for (const s of [1, -1]) part(t, cyl, dk, w * 0.12 * s, 0.05, w * 0.6 * Math.sign(z), w * 0.035, w * 0.9, w * 0.035).rotation.x = Math.PI / 2;
    turrets.push(t);
  }
  return { root: g, turrets, len, beam: w };
}

export function makeTug() {
  const g = new THREE.Group();
  part(g, box, M(0x30383c), 0, 0.8, 0, 5, 2.6, 13);
  const bow = part(g, cone, M(0x30383c), 0, 0.8, 8, 1, 1, 1); bow.rotation.x = Math.PI / 2; bow.scale.set(2.5, 4, 1.3);
  part(g, box, M(0xd8d2c0), 0, 3.4, -1, 3.4, 2.6, 4.5);
  part(g, cyl, M(0xa83a22), 0, 5.6, -2.4, 0.6, 2.6, 0.6);
  return { root: g };
}

export function makeMine(r = 1.4) {
  const g = new THREE.Group(), m = M(0x191b1c, { metalness: 0.5, roughness: 0.5 });
  part(g, sph, m, 0, 0, 0, r);
  for (let i = 0; i < 10; i++) {
    const a = i * 2.4, b = Math.acos(1 - (2 * (i + 0.5)) / 10);
    const d = new THREE.Vector3(Math.sin(b) * Math.cos(a), Math.cos(b), Math.sin(b) * Math.sin(a));
    const c = part(g, cyl, m, d.x * r * 1.1, d.y * r * 1.1, d.z * r * 1.1, r * 0.09, r * 0.4, r * 0.09);
    c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
  }
  return g;
}

export function makeBalloon(r = 8) {
  const g = new THREE.Group();
  part(g, sph, M(0xd8a12a, { roughness: 0.6 }), 0, 0, 0, r, r * 0.9, r);
  return g;
}

export function makeGun() {
  const g = new THREE.Group(), dk = M(0x23272a, { metalness: 0.6, roughness: 0.5 });
  part(g, cyl, dk, 0, 0, 1.4, 0.07, 2.8, 0.07).rotation.x = Math.PI / 2;
  part(g, box, dk, 0, 0, 0, 0.3, 0.34, 0.9);
  part(g, cyl, dk, 0, -0.6, 0, 0.1, 1.0, 0.1);
  part(g, box, dk, 0, 0.3, -0.1, 0.03, 0.3, 0.03);
  g.scale.setScalar(0.8);
  return g;
}

export function makeParachute() {
  const g = new THREE.Group();
  const c = part(g, new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), M(0xe8e2d0, { side: THREE.DoubleSide }), 0, 5, 0, 3.4, 2.4, 3.4);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const l = part(g, cyl, M(0x444), Math.cos(a) * 1.6, 2.6, Math.sin(a) * 1.6, 0.02, 5.2, 0.02); l.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6); }
  return { root: g, canopy: c };
}
