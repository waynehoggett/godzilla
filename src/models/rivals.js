import * as THREE from 'three/webgpu';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { assets } from '../core/assets.js';
import { blobGeo, part, pivot, findBones } from './godzilla.js';

const coneGeo = new THREE.ConeGeometry(1, 1, 5);
const eyeGeo = new THREE.SphereGeometry(1, 8, 6);
const _v = new THREE.Vector3();

// Flat membrane from outline points [span, chord]; lies in the XZ plane, spanning +X.
function membrane(pts, flip = false) {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts.slice(1)) s.lineTo(p[0], p[1]);
  const g = new THREE.ShapeGeometry(s);
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (const [x, y] of pts) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  const uv = g.attributes.uv, p = g.attributes.position;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) - minX) / (maxX - minX), (p.getY(i) - minY) / (maxY - minY));
  if (!flip) g.rotateX(-Math.PI / 2);
  return g;
}

// ---------------- RODAN ----------------
export function makeRodan() {
  const skin = new THREE.MeshStandardMaterial({ color: 0x6e3520, roughness: 0.95, flatShading: true, emissive: 0x000000 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3d1c12, roughness: 1, flatShading: true });
  const wingM = new THREE.MeshStandardMaterial({ color: 0x8a4a2c, roughness: 0.9, side: THREE.DoubleSide, flatShading: true });
  const bone = new THREE.MeshStandardMaterial({ color: 0xd8c9a8, roughness: 0.7, flatShading: true });
  const B = (seed) => blobGeo(1, 0.1, seed);
  const root = new THREE.Group();
  const body = pivot(root, 0, 3.2, 0);
  part(body, B(1), skin, 0, 0, 0, 1.5, 1.35, 2.7);
  part(body, B(2), dark, 0, -0.5, 0.5, 1.2, 0.9, 1.8);
  for (let i = 0; i < 5; i++) { const c = part(body, coneGeo, bone, (i % 2 ? 0.35 : -0.35), -1.3, 1.6 - i * 0.6, 0.16, 0.55, 0.16); c.rotation.x = Math.PI; }
  const neck = pivot(body, 0, 0.5, 2.2); neck.rotation.x = -0.45;
  part(neck, B(3), skin, 0, 0, 0.8, 0.62, 0.62, 1.2);
  const head = pivot(neck, 0, 0.1, 1.8); head.rotation.x = 0.45;
  part(head, B(4), skin, 0, 0, 0.2, 0.62, 0.56, 0.85);
  const beakU = part(head, coneGeo, bone, 0, 0, 1.6, 0.36, 1.9, 0.3); beakU.rotation.x = Math.PI / 2;
  const jaw = pivot(head, 0, -0.25, 0.5);
  const beakL = part(jaw, coneGeo, bone, 0, 0, 0.9, 0.26, 1.5, 0.16); beakL.rotation.x = Math.PI / 2;
  for (const s of [1, -1]) { const c = part(head, coneGeo, skin, 0.3 * s, 0.5, -0.8, 0.2, 1.7, 0.2); c.rotation.x = -1.2; }
  const eyeM = new THREE.MeshBasicMaterial({ color: 0xffe066 });
  part(head, eyeGeo, eyeM, 0.5, 0.2, 0.5, 0.09); part(head, eyeGeo, eyeM, -0.5, 0.2, 0.5, 0.09);
  const mouth = pivot(head, 0, -0.1, 2.4);
  const tailP = part(body, coneGeo, skin, 0, 0.1, -3.4, 1.1, 2.4, 0.3); tailP.rotation.x = -Math.PI / 2;
  const legs = [];
  for (const s of [1, -1]) {
    const hip = pivot(body, 0.8 * s, -0.8, -0.6);
    part(hip, B(5), skin, 0, -0.9, 0, 0.5, 1.1, 0.55);
    for (let i = -1; i <= 1; i++) { const c = part(hip, coneGeo, bone, i * 0.3, -2.0, 0.4, 0.1, 0.6, 0.1); c.rotation.x = Math.PI * 0.75; }
    legs.push(hip);
  }
  const innerG = membrane([[0, 1.7], [6.2, 1.3], [6.2, -1.7], [3.2, -2.9], [0, -2.3]]);
  const outerG = membrane([[0, 1.3], [7.4, 0.3], [5.4, -1.3], [2.6, -1.1], [0, -1.7]]);
  const wings = [];
  for (const s of [1, -1]) {
    const inner = pivot(body, 1.1 * s, 0.6, 0.5); inner.scale.x = s;
    part(inner, innerG, wingM);
    const arm = part(inner, coneGeo, skin, 3.1, 0.05, 1.3, 0.3, 6.4, 0.3); arm.rotation.z = -Math.PI / 2;
    const outer = pivot(inner, 6.2, 0, 0);
    part(outer, outerG, wingM);
    const arm2 = part(outer, coneGeo, skin, 3.6, 0.05, 0.9, 0.22, 7.4, 0.22); arm2.rotation.z = -Math.PI / 2;
    wings.push({ inner, outer, s });
  }
  const set = { flap: 1, fold: 0, attack: 0, jaw: 0, walk: 0, charge: 0 };
  let t = 0;
  function update(dt) {
    t += dt * (4 + set.flap * 3);
    const f = set.fold, fl = set.flap * (1 - f);
    body.rotation.x = -0.95 * f + set.attack * 0.6 * (1 - f) - Math.sin(t) * 0.03 * fl;
    body.position.y = 3.2 + Math.sin(t - 0.8) * 0.5 * fl + f * 1.2;
    neck.rotation.x = -0.45 + f * 0.9 + set.attack * 0.3;
    jaw.rotation.x = set.jaw * 0.5;
    for (const L of legs) L.rotation.x = f * 0.95;
    for (const W of wings) {
      // top-level pivots are mirrored with scale.x, so their rotations need the sign; children inherit it
      W.inner.rotation.z = W.s * (Math.sin(t) * 0.55 * fl + 0.12 - f * 0.5);
      W.inner.rotation.y = W.s * f * 1.1;
      W.outer.rotation.z = Math.sin(t - 0.7) * 0.75 * fl - f * 0.3;
      W.outer.rotation.y = f * 1.4;
    }
  }
  return { root, set, update, height: 7, radius: 3.2, mouths: () => [mouth.getWorldPosition(_v).clone()], flash(k) { skin.emissive.setRGB(k, k * 0.3, k * 0.2); } };
}

// ---------------- MOTHRA ----------------
function mothWingTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0, '#f2d27a'); grad.addColorStop(0.45, '#e8862a'); grad.addColorStop(1, '#b8421a');
  g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#17110c'; g.lineWidth = 7;
  for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo(0, 128); g.quadraticCurveTo(120, 20 + i * 28, 256, i * 32); g.stroke(); }
  const spot = (x, y, r) => { for (const [k, col] of [[1, '#17110c'], [0.78, '#f6efd8'], [0.55, '#2a7fd0'], [0.3, '#17110c']]) { g.fillStyle = col; g.beginPath(); g.arc(x, y, r * k, 0, 7); g.fill(); } };
  spot(150, 96, 44); spot(200, 190, 24);
  g.lineWidth = 22; g.strokeRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export function makeMothra() {
  const fur = new THREE.MeshStandardMaterial({ color: 0xe9dfc6, roughness: 1, flatShading: true, emissive: 0x000000 });
  const brown = new THREE.MeshStandardMaterial({ color: 0x7a4a22, roughness: 1, flatShading: true });
  const wingM = new THREE.MeshStandardMaterial({ map: mothWingTexture(), roughness: 0.8, side: THREE.DoubleSide, emissive: 0x402008, emissiveIntensity: 0.6 });
  const eyeM = new THREE.MeshBasicMaterial({ color: 0x37a6ff });
  const B = (seed) => blobGeo(2, 0.08, seed);
  const root = new THREE.Group();
  const body = pivot(root, 0, 3, 0);
  part(body, B(1), fur, 0, 0, 0.4, 1.5, 1.4, 1.7);
  part(body, B(2), fur, 0, 0.1, 2.2, 1.0, 0.95, 0.95);
  part(body, eyeGeo, eyeM, 0.62, 0.35, 2.75, 0.42); part(body, eyeGeo, eyeM, -0.62, 0.35, 2.75, 0.42);
  for (let i = 0; i < 5; i++) part(body, blobGeo(1, 0.05, 3), i % 2 ? brown : fur, 0, -0.1, -1.1 - i * 0.85, 1.35 - i * 0.2, 1.25 - i * 0.18, 0.62);
  for (const s of [1, -1]) {
    const a = part(body, coneGeo, brown, 0.4 * s, 1.5, 2.9, 0.06, 2.2, 0.06); a.rotation.set(0.7, 0, -0.35 * s);
    for (let i = 0; i < 3; i++) { const l = part(body, coneGeo, brown, 0.9 * s, -1.4, 1.2 - i * 0.8, 0.12, 1.5, 0.12); l.rotation.set(0.2, 0, Math.PI + 0.5 * s); }
  }
  const mouth = pivot(body, 0, 0, 3.4);
  const foreG = membrane([[0, 1.2], [5, 4.6], [11, 5.4], [12.6, 2.6], [10.5, -1.6], [5.5, -2.6], [0, -1.6]]);
  const hindG = membrane([[0, 1.4], [6, 1.0], [8.2, -2.6], [6.4, -6.4], [2.6, -6.0], [0, -2.4]]);
  const wings = [];
  for (const s of [1, -1]) {
    const fw = pivot(body, 0.9 * s, 0.7, 1.0); fw.scale.x = s; part(fw, foreG, wingM);
    const hw = pivot(body, 0.9 * s, 0.6, -0.6); hw.scale.x = s; part(hw, hindG, wingM);
    wings.push({ fw, hw, s });
  }
  const set = { flap: 1, fold: 0, attack: 0, jaw: 0, walk: 0, charge: 0 };
  let t = 0;
  function update(dt) {
    t += dt * (3.2 + set.flap * 2.5);
    const fl = 0.35 + set.flap * 0.65 * (1 - set.fold * 0.7);
    body.position.y = 3 + Math.sin(t - 1) * 0.6 * fl;
    body.rotation.x = set.attack * 0.5 - 0.1;
    for (const W of wings) {
      W.fw.rotation.z = W.s * (Math.sin(t) * 0.7 * fl + 0.25);
      W.hw.rotation.z = W.s * (Math.sin(t - 0.4) * 0.6 * fl + 0.2);
    }
    wingM.emissiveIntensity = 0.6 + set.charge * 2.5;
  }
  return { root, set, update, height: 6, radius: 3.4, mouths: () => [mouth.getWorldPosition(_v).clone()], flash(k) { fur.emissive.setRGB(k, k * 0.3, k * 0.2); } };
}

// ---------------- KING GHIDORAH ----------------
export function makeGhidorah() {
  const gold = new THREE.MeshStandardMaterial({ color: 0xd2a424, roughness: 0.55, metalness: 0.25, flatShading: true, emissive: 0x000000 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x8a6412, roughness: 0.7, metalness: 0.3, flatShading: true });
  const wingM = new THREE.MeshStandardMaterial({ color: 0xd8b040, roughness: 0.7, metalness: 0.2, side: THREE.DoubleSide, flatShading: true });
  const bone = new THREE.MeshStandardMaterial({ color: 0xf0e6c8, roughness: 0.6, flatShading: true });
  const eyeM = new THREE.MeshBasicMaterial({ color: 0xff3020 });
  const glowM = new THREE.MeshBasicMaterial({ color: 0xfff27a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const B = (seed) => blobGeo(1, 0.1, seed);
  const root = new THREE.Group();
  const body = pivot(root, 0, 6.2, 0);
  part(body, B(1), gold, 0, 0, 0, 2.5, 2.7, 2.5);
  part(body, B(2), gold, 0, 1.9, 0.5, 2.2, 1.7, 1.9);
  part(body, B(3), dark, 0, 0.3, 1.9, 1.5, 2.3, 0.8);
  const legs = [];
  for (const s of [1, -1]) {
    const hip = pivot(root, 1.7 * s, 5.6, 0);
    part(hip, B(4), gold, 0, -1.6, 0.2, 1.3, 2.3, 1.6);
    const knee = pivot(hip, 0, -3.1, 0.4);
    part(knee, B(5), gold, 0, -1.0, -0.2, 0.85, 1.4, 0.95);
    part(knee, B(6), gold, 0, -2.2, 0.5, 1.05, 0.42, 1.6);
    for (let i = -1; i <= 1; i++) { const c = part(knee, coneGeo, bone, i * 0.55, -2.25, 1.9, 0.17, 0.6, 0.17); c.rotation.x = Math.PI / 2; }
    legs.push({ hip, knee, s });
  }
  // three necks
  const necks = [];
  const curve = [0.12, 0.05, -0.05, -0.15, -0.2, 0.1, 0.3, 0.5];
  [[0, 2.9, 1.0, 0, 0.42], [1.6, 2.5, 0.8, -0.5, 0.5], [-1.6, 2.5, 0.8, 0.5, 0.5]].forEach(([x, y, z, rz, rx], n) => {
    const base = pivot(body, x, y, z); base.rotation.set(rx, 0, rz);
    const segs = []; let prev = base, r = 0.72, c = rx;
    curve.forEach((b, i) => {
      const seg = i === 0 ? base : pivot(prev, 0, 1.05, 0);
      if (i > 0) seg.rotation.x = b; else seg.rotation.x += b;
      c += b;
      part(seg, B(10 + i), gold, 0, 0.5, 0, r, 0.75, r);
      if (i % 2 === 0) { const sp = part(seg, coneGeo, dark, 0, 0.5, -r, 0.14, 0.7, 0.14); sp.rotation.x = -Math.PI / 2; }
      segs.push({ seg, b: seg.rotation.x }); prev = seg; r *= 0.95;
    });
    const head = pivot(prev, 0, 1.25, 0); head.rotation.x = -c + 0.15; head.rotation.z = -rz;
    part(head, B(20), gold, 0, 0, 0.2, 0.62, 0.55, 0.95);
    part(head, B(21), gold, 0, -0.05, 1.05, 0.45, 0.36, 0.75);
    part(head, eyeGeo, eyeM, 0.42, 0.22, 0.6, 0.09); part(head, eyeGeo, eyeM, -0.42, 0.22, 0.6, 0.09);
    for (const s of [1, -1]) { const h = part(head, coneGeo, bone, 0.32 * s, 0.6, -0.55, 0.11, 1.6, 0.11); h.rotation.set(-1.0, 0, -0.25 * s); }
    for (let i = 0; i < 3; i++) { const h = part(head, coneGeo, bone, 0, 0.55, -0.1 - i * 0.3, 0.08, 0.6, 0.08); h.rotation.x = -0.6; }
    const jaw = pivot(head, 0, -0.28, 0.15);
    part(jaw, B(22), gold, 0, -0.08, 0.75, 0.42, 0.2, 0.85);
    part(head, eyeGeo, glowM, 0, -0.25, 1.3, 0.5);
    const mouth = pivot(head, 0, -0.2, 1.9);
    necks.push({ segs, head, jaw, mouth, n, baseHeadX: head.rotation.x });
  });
  // wings
  const wingG = membrane([[0, 0], [3, 6.5], [7.5, 8.4], [12, 7.2], [9.6, 4], [11.2, 1.2], [7.4, 0.8], [6.4, -2.2], [3, -1.2], [0, -2.4]], true);
  const wings = [];
  for (const s of [1, -1]) {
    const w = pivot(body, 1.6 * s, 2.2, -1.2); w.scale.x = s;
    part(w, wingG, wingM);
    for (const [x, y] of [[7.5, 8.4], [12, 7.2], [11.2, 1.2]]) {
      const len = Math.hypot(x, y), b = part(w, coneGeo, gold, x / 2, y / 2, 0.05, 0.2, len, 0.2); b.rotation.z = -Math.atan2(x, y);
    }
    wings.push({ w, s });
  }
  // twin tails
  const tails = [];
  for (const s of [1, -1]) {
    let prev = pivot(body, 0.7 * s, -1.2, -1.8), r = 1.0; prev.rotation.y = -0.22 * s;
    const segs = [];
    const bend = [-0.35, -0.3, -0.2, 0.25, 0.3, 0.2, 0.05, 0.05, 0.05];
    bend.forEach((b, i) => {
      const seg = i === 0 ? prev : pivot(prev, 0, 0, -1.7);
      seg.rotation.x = b;
      part(seg, B(30 + i), gold, 0, 0, -0.85, r, r, 1.25);
      segs.push(seg); prev = seg; r *= 0.84;
    });
    for (let i = 0; i < 6; i++) { const sp = part(prev, coneGeo, bone, 0, 0, -1.6, 0.12, 0.9, 0.12); sp.rotation.set(Math.PI / 2 + Math.cos(i) * 0.8, 0, Math.sin(i * 1.05) * 0.8); }
    tails.push({ segs, s });
  }
  const set = { flap: 0.3, fold: 0, attack: 0, jaw: 0, walk: 0, charge: 0 };
  let t = 0, ph = 0;
  function update(dt) {
    t += dt; ph += dt * (1.4 + set.walk * 2) * (set.walk > 0.02 ? 1 : 0);
    body.position.y = 6.2 + Math.abs(Math.cos(ph)) * 0.2 * set.walk + Math.sin(t * 1.2) * 0.06;
    body.rotation.x = set.attack * 0.35;
    for (const L of legs) {
      const a = Math.sin(ph + (L.s > 0 ? 0 : Math.PI));
      L.hip.rotation.x = -a * 0.38 * set.walk; L.knee.rotation.x = Math.max(0, a) * 0.5 * set.walk;
    }
    for (const N of necks) {
      N.segs.forEach((s, i) => {
        s.seg.rotation.x = s.b + Math.sin(t * 1.6 - i * 0.6 + N.n * 2.1) * 0.07 * (1 - set.charge * 0.6) + (i > 4 ? set.attack * 0.12 : 0);
        if (i > 0) s.seg.rotation.z = Math.sin(t * 1.1 - i * 0.5 + N.n * 1.3) * 0.06;
      });
      N.jaw.rotation.x = Math.max(set.jaw, set.charge) * 0.6;
      N.head.rotation.x = N.baseHeadX - set.attack * 0.3;
    }
    glowM.opacity = set.charge * 0.9;
    for (const W of wings) {
      W.w.rotation.y = W.s * (-0.5 + Math.sin(t * (2 + set.flap * 4)) * (0.12 + set.flap * 0.35));
      W.w.rotation.z = W.s * -0.15;
    }
    for (const T of tails) T.segs.forEach((s, i) => { s.rotation.y = Math.sin(t * 1.3 - i * 0.6 + T.s) * 0.1; });
  }
  return { root, set, update, height: 15, radius: 3.6, mouths: () => necks.map((n) => n.mouth.getWorldPosition(new THREE.Vector3())), flash(k) { gold.emissive.setRGB(k, k * 0.3, k * 0.2); } };
}

// ---------------- KING KONG (rigged model with its own animation clips, see CREDITS.md) ----------------
let kongFit = null;
const KONG_MOVES = { punch: ['attack2', 1], leap: ['smash_char', 1.3], boulders: ['throw', 2], roar: ['roar', 1.7] };
export function makeKong() {
  const src = assets.kong;
  const root = new THREE.Group(), holder = new THREE.Group(), model = cloneSkinned(src.scene);
  holder.add(model); root.add(holder);
  const mats = [];
  model.traverse((m) => { if (m.isMesh) { m.material = m.material.clone(); m.material.side = THREE.FrontSide; mats.push(m.material); m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; } });
  const mixer = new THREE.AnimationMixer(model), act = {};
  for (const c of src.animations) act[c.name.split('|').pop()] = mixer.clipAction(c);
  act.idle.play(); mixer.update(0); model.updateMatrixWorld(true);
  if (!kongFit) {
    const box = new THREE.Box3().setFromObject(model, true), k = 9.4 / (box.max.y - box.min.y);
    kongFit = { k, y: -box.min.y * k };
  }
  holder.scale.setScalar(kongFit.k); holder.position.y = kongFit.y;
  const B = findBones(model, { head: 'bip_head', lip: 'def_c_lipLwr01', hand: 'bip_hand_r' });
  const set = { flap: 0, fold: 0, attack: 0, jaw: 0, walk: 0, charge: 0, move: null };
  let cur = 'idle', once = false, lastMove = null, punch = 0;
  const go = (name, fade = 0.18, loop = true, speed = 1) => {
    if (name === cur && loop) return;
    const a = act[name], prev = act[cur];
    a.reset(); a.timeScale = speed; a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); a.clampWhenFinished = !loop;
    a.play(); if (prev && prev !== a) prev.crossFadeTo(a, fade, false);
    cur = name; once = !loop;
  };
  mixer.addEventListener('finished', () => { once = false; });
  function update(dt) {
    if (set.fold > 0.9 && !set.move) { if (cur !== 'ragdoll') go('ragdoll', 0.5, false, 1); }
    else if (set.move && set.move !== lastMove) {
      let [clip, speed] = KONG_MOVES[set.move] || ['attack3', 1];
      if (set.move === 'punch') clip = punch++ % 2 ? 'attack3' : 'attack2';
      go(clip, 0.1, false, speed);
    } else if (!once) go(set.walk > 0.3 ? 'walk' : 'idle', 0.25, true, set.walk > 0.3 ? 1.25 : 1);
    lastMove = set.move;
    mixer.update(dt);
  }
  const v = new THREE.Vector3();
  return {
    root, set, update, height: 9.4, radius: 2.8,
    mouths: () => [B.lip.getWorldPosition(new THREE.Vector3())],
    handWorld: (out = v) => B.hand.getWorldPosition(out),
    flash(k) { for (const m of mats) m.emissive.setRGB(k * 0.6, k * 0.15, k * 0.1); },
  };
}
