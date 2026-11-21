import * as THREE from 'three/webgpu';
import { part, pivot } from './godzilla.js';

const box = new THREE.BoxGeometry(1, 1, 1);
const sph = new THREE.SphereGeometry(1, 8, 6);
const cone = new THREE.ConeGeometry(1, 1, 8);
const M = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, flatShading: true });
const SKIN = M(0xd9a983), HAIR = M(0x16110e);

// ~1.8 units tall, feet at y=0, facing +Z. opts: { shirt, legs, skirt, cap }
export function makePerson(o = {}) {
  const root = new THREE.Group(), shirt = M(o.shirt ?? 0x8a6a45), pants = M(o.legs ?? 0x3a3a34);
  const body = pivot(root, 0, 0.95, 0);
  part(body, box, shirt, 0, 0.33, 0, 0.44, 0.62, 0.26);
  part(body, sph, SKIN, 0, 0.82, 0, 0.15, 0.17, 0.15);
  part(body, sph, o.cap ? M(o.cap) : HAIR, 0, 0.88, -0.02, 0.16, 0.13, 0.16);
  if (o.skirt) { const s = part(body, cone, M(o.skirt), 0, -0.2, 0, 0.36, 0.7, 0.3); s.position.y = -0.12; }
  const limbs = [];
  for (const s of [1, -1]) {
    const arm = pivot(body, 0.28 * s, 0.58, 0); part(arm, box, shirt, 0, -0.27, 0, 0.12, 0.56, 0.13);
    const leg = pivot(body, 0.12 * s, 0, 0); part(leg, box, o.skirt ? SKIN : pants, 0, -0.46, 0, 0.15, 0.92, 0.16);
    limbs.push({ arm, leg, s });
  }
  let ph = Math.random() * 6;
  function update(dt, speed = 0) {
    const k = Math.min(1, speed / 6);
    ph += dt * (4 + speed * 0.9) * (k > 0.02 ? 1 : 0);
    for (const L of limbs) {
      const a = Math.sin(ph + (L.s > 0 ? 0 : Math.PI)) * k;
      L.leg.rotation.x = a * 0.95; L.arm.rotation.x = -a * 1.0;
    }
    body.position.y = 0.95 + Math.abs(Math.sin(ph)) * 0.06 * k;
    body.rotation.x = 0.22 * k;
  }
  return { root, update, body };
}

export const makeKoichi = () => makePerson({ shirt: 0x6a4a2c, legs: 0x4a4636 });
export const makeNoriko = () => makePerson({ shirt: 0xe0d8c8, skirt: 0x34506e, legs: 0x34506e });
const CROWD = [0x6e6a5c, 0x8a7a60, 0x4a5058, 0x9a8f7a, 0x5a4a3c, 0x7a7468];
export const makeCivilian = (i = 0) => makePerson({ shirt: CROWD[i % CROWD.length], legs: CROWD[(i + 3) % CROWD.length], skirt: i % 3 === 0 ? CROWD[(i + 1) % CROWD.length] : null, cap: i % 4 === 1 ? 0x3a3630 : null });
export const makeSoldier = () => makePerson({ shirt: 0x6b6a45, legs: 0x5a5a3a, cap: 0x5a5a3a });
