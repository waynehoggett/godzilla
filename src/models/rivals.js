import * as THREE from 'three/webgpu';
import { positionLocal, color, mix, smoothstep, float, mx_worley_noise_float, mx_noise_float } from 'three/tsl';
import { makeRig, turnBone, AX } from './rig.js';

// Every rival is a rigged model (see CREDITS.md). Moves are windows of each rig's own clips:
//   id: [clip, start, end, speed, seconds until the blow lands, speed after the blow]
// The brawl reads these to time its telegraphs, so what you see is what hits you.

function rival(key, cfg) {
  const rig = makeRig(key, cfg);
  const B = rig.bones(cfg.bones || {});
  const mouthBones = (cfg.mouths || []).map((p) => rig.bones({ m: p }).m).filter(Boolean);
  const set = { walk: 0, speed: 0, charge: 0, hurt: 0 };
  let flash = 0, lastMove = null, alt = 0;
  const api = {
    root: rig.root, rig, set, moves: cfg.moves, height: cfg.height, radius: cfg.radius ?? 2.8, bones: B,
    update(dt) {
      rig.loco(set.walk, set.speed);
      rig.update(dt);
      rig.tilt.rotation.x = -set.hurt * 0.16;
      if (cfg.overlay) cfg.overlay(api, dt);
      rig.flash(Math.max(0, flash));
    },
    // Start a move; returns { hit, total } in seconds (hit = when the blow lands).
    move(id, speedMul = 1) {
      let m = cfg.moves[id];
      if (!m) return { hit: 0.4, total: 0.9 };
      if (Array.isArray(m[0])) { m = m[(alt++) % m.length]; } // alternate between variants
      lastMove = m;
      const total = rig.act(m[0], { start: m[1], end: m[2], speed: m[3] * speedMul, hold: !!m[6] });
      return { hit: m[4] / speedMul, total };
    },
    landed() { if (lastMove && lastMove[5]) rig.speed(lastMove[5]); },
    react(kind) {
      const r = cfg.reacts && cfg.reacts[kind];
      if (r) rig.act(r[0], { start: r[1] ?? 0, end: r[2], speed: r[3] ?? 1, hold: kind === 'death', fade: 0.08 });
      return !!r;
    },
    stop() { rig.stop(); },
    mouths: () => mouthBones.map((b) => b.getWorldPosition(new THREE.Vector3())),
    flash(k) { flash = k; },
  };
  return api;
}

// ---------------- KING KONG ----------------
export function makeKong() {
  return rival('kong', {
    height: 9.4, radius: 2.8, idle: 'idle', walk: 'walk', stride: 4.56, slide: 0.9, pelvis: 'bip_pelvis', mouths: ['def_c_lipLwr01'],
    moves: {
      punch: [['attack2', 0, 1.42, 0.95, 0.44, 1.4], ['attack3', 0, 1.42, 0.95, 0.44, 1.4]],
      leap: ['smash_char', 0, 2.38, 1.0, 0.75, 1.5],
      boulders: ['throw', 0.2, 3.2, 1.9, 0.72, 2.2],
      roar: ['roar', 0.5, 3.4, 1.6, 0.8, 1.6],
    },
    reacts: { death: ['ragdoll', 0, 0, 1] },
  });
}

// ---------------- MECHAGODZILLA ----------------
export function makeMecha() {
  return rival('mecha', {
    height: 10.6, radius: 2.7, idle: 'idle', walk: 'walk', stride: 8.43, slide: 0.9, pelvis: 'Bip_Pelvis', mouths: ['Bip_Jaw'],
    moves: {
      punch: [['common_attack1', 0, 0.75, 0.42, 0.48, 1.3], ['common_attack2', 0, 0.79, 0.5, 0.48, 1.3]],
      slam: ['attack2', 0, 2.08, 0.4, 0.55, 1.5],
      dash: ['attack1', 0, 0.58, 0.3, 0.8, 1.2],
      missiles: ['aoe', 0, 1.13, 0.3, 0.55, 1.0],
      eyebeam: ['beam_start', 0, 0.62, 0.6, 1.0, 1, true],
      roar: ['roar', 0, 1.67, 1, 0.5, 1],
    },
    reacts: { hit: ['hit01', 0, 0.62, 1.2], death: ['death', 0, 2.5, 1], knock: ['fall', 0, 2.46, 1.3] },
  });
}

// ---------------- KING GHIDORAH ----------------
export function makeGhidorah() {
  return rival('ghidorah', {
    height: 13, radius: 3.4, idle: 'idle', walk: 'run', stride: 1.45, slide: 0.8, pelvis: 'bip_pelvis', mouths: ['jaw_M', 'jaw_L', 'jaw_R'],
    moves: {
      bite: [['attack1', 0.5, 3.2, 1.9, 0.53, 2.2], ['attack2', 0.6, 3.3, 1.9, 0.57, 2.2]],
      tailwhip: ['tailwhip', 1.0, 3.3, 2.0, 0.7, 2.0],
      gravity: ['beam', 0.0, 5.4, 1.0, 1.15, 1.25],
      storm: ['ultimate', 0.8, 4.9, 1.7, 0.9, 1.7],
      hurricane: ['roar', 0.0, 4.2, 1.5, 0.75, 1.6],
    },
    reacts: { block: ['block', 0.4, 2.6, 2] },
  });
}

// ---------------- RODAN ----------------
// This rig ships without animation clips, so flight is driven through its wing, neck and tail bones.
function volcanicHide() {
  const m = new THREE.MeshPhysicalNodeMaterial({ metalness: 0, clearcoat: 0.2, clearcoatRoughness: 0.5 });
  const cell = mx_worley_noise_float(positionLocal.mul(3.2)), blotch = mx_noise_float(positionLocal.mul(0.12)).mul(0.5).add(0.5), k = smoothstep(0.05, 0.4, cell);
  m.colorNode = mix(color(0x4a1f12), color(0x7e3c24), k).mul(blotch.mul(0.4).add(0.7));
  m.roughnessNode = mix(float(0.85), float(0.55), k);
  m.side = THREE.DoubleSide;
  return m;
}
export function makeRodan() {
  const rig = makeRig('rodan', { height: 8.2, pelvis: 'bod_', doubleSided: true });
  const hide = volcanicHide();
  rig.model.traverse((m) => { if (m.isMesh && !m.material.map) { hide.normalMap = m.material.normalMap; m.material = hide; } });
  // Bone names as the loader delivers them (it strips the dots: "wing_l.001" arrives as "wing_l001").
  // Wing chain: shoulder 001 -> 002 -> elbow 003 -> wrist 008 -> outer wing 004 -> 006 -> 005 -> tip 007.
  const find = (prefix) => rig.bones({ b: prefix }).b;
  const wing = (s) => ({ shoulder: find(`wing_${s}001`), upper: find(`wing_${s}002`), elbow: find(`wing_${s}003`), wrist: find(`wing_${s}008`), outer: [find(`wing_${s}004`), find(`wing_${s}006`), find(`wing_${s}005`)] });
  const B = { neck: [find('neck_'), find('neck001'), find('neck002')], head: find('head_'), jaw: find('jaw_'), spine: [find('spine_'), find('spine002'), find('spine001'), find('spine003')], tail: [find('tail_'), find('tail002'), find('tail001'), find('tail003')], legs: [find('leg_l_'), find('leg_r_')] };
  rig.root.updateMatrixWorld(true);
  const sideOf = (b) => Math.sign(rig.root.worldToLocal(b.getWorldPosition(new THREE.Vector3())).x) || 1;
  const wings = ['l', 'r'].map((s) => { const w = wing(s); w.s = sideOf(w.elbow); return w; });
  for (const w of wings) for (const k of ['shoulder', 'upper', 'elbow', 'wrist']) if (!w[k]) console.error('rodan: wing bone missing:', k);
  const rest = new Map();
  rig.model.traverse((o) => { if (o.isBone) rest.set(o, o.quaternion.clone()); });

  // set.fly 1 = level flight, 0 = standing; set.flap wing-beat strength; set.dive tucks the wings
  const set = { fly: 1, flap: 1, dive: 0, walk: 0, speed: 0, charge: 0, hurt: 0, jaw: 0 };
  const moves = { dive: 1.15, gust: 0.75, peck: 0.55 };
  let t = Math.random() * 6, flash = 0, fly = 1, dive = 0;
  const rootQ = new THREE.Quaternion();
  const api = {
    root: rig.root, rig, set, height: 8.2, radius: 3.0, bones: B, moves,
    update(dt) {
      t += dt * (4.6 + set.flap * 2.2);
      fly += (set.fly - fly) * Math.min(1, dt * 4); dive += (set.dive - dive) * Math.min(1, dt * 8);
      for (const [b, q] of rest) b.quaternion.copy(q);
      // The rig stands upright with its wings spread in front of it like a cloak. Laying the body
      // forward turns that into level flight: the spine (Y) points ahead and the wings lie flat.
      const beat = Math.sin(t), amp = set.flap * (1 - dive * 0.8);
      rig.tilt.rotation.x = fly * 1.34 + dive * 0.45 - set.hurt * 0.2;
      rig.tilt.position.y = rig.fit.hipY - beat * 0.32 * fly * amp; // the body rises on the down-stroke
      rig.root.updateMatrixWorld(true);
      rig.tilt.getWorldQuaternion(rootQ);
      const Y = AX.y, Z = AX.z, X = AX.x;
      for (const W of wings) {
        const s = W.s;
        // up and down stroke: about the spine axis, each joint lagging the one before so the tip whips
        const stroke = (lag, k) => s * (Math.sin(t - lag) * k * amp) * (0.25 + fly * 0.75);
        turnBone(W.shoulder, rootQ, Y, stroke(0, 0.42) + s * 0.1 * fly);
        turnBone(W.upper, rootQ, Y, stroke(0.25, 0.3));
        turnBone(W.elbow, rootQ, Y, stroke(0.55, 0.3));
        turnBone(W.wrist, rootQ, Y, stroke(0.85, 0.34));
        W.outer.forEach((b, i) => turnBone(b, rootQ, Y, stroke(1.1 + i * 0.25, 0.26)));
        // open the outer wing wider in flight; sweep everything back in a dive; half-fold on the ground
        const open = fly * 0.2 * (1 - dive), sweep = dive * 0.55 + (1 - fly) * 0.12;
        W.outer.forEach((b) => turnBone(b, rootQ, Z, s * (open - sweep * 0.5)));
        turnBone(W.shoulder, rootQ, Z, -s * sweep); turnBone(W.elbow, rootQ, Z, -s * sweep * 0.7);
        // the wrist folds a little on the up-stroke, like a real wing
        turnBone(W.wrist, rootQ, Z, -s * Math.max(0, beat) * 0.18 * amp * fly);
      }
      // head looks where it is going instead of at the sky; tail and legs trail
      B.neck.forEach((b) => turnBone(b, rootQ, X, -fly * 0.36 + Math.sin(t - 1.2) * 0.03 * amp));
      turnBone(B.head, rootQ, X, -fly * 0.3);
      turnBone(B.jaw, rootQ, X, set.jaw * 0.45);
      B.spine.forEach((b, i) => turnBone(b, rootQ, X, Math.sin(t - 0.4 - i * 0.2) * 0.025 * amp * fly));
      B.tail.forEach((b, i) => turnBone(b, rootQ, X, Math.sin(t - 1.6 - i * 0.4) * 0.07 * fly));
      B.legs.forEach((b) => turnBone(b, rootQ, X, fly * 0.8));
      const f = Math.max(0, flash); hide.emissive.setRGB(f * 0.55, f * 0.14, f * 0.08);
    },
    move(id) { const hit = moves[id] ?? 0.6; return { hit, total: hit + 0.6 }; },
    landed() {}, stop() {},
    react() { return false; },
    mouths: () => [(B.jaw || B.head).getWorldPosition(new THREE.Vector3())],
    flash(k) { flash = k; },
  };
  return api;
}
