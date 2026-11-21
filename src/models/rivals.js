import * as THREE from 'three/webgpu';
import { positionLocal, color, mix, smoothstep, float, mx_worley_noise_float, mx_noise_float } from 'three/tsl';
import { makeRig, turnBone, AX } from './rig.js';

// Every rival is a rigged model (see CREDITS.md). Moves are windows of each rig's own clips:
//   id: [clip, start, end, speed, seconds until the blow lands, speed after the blow]
// The brawl reads these to time its telegraphs, so what you see is what hits you.

const _q = new THREE.Quaternion();

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
  const names = {};
  for (const s of ['l', 'r']) for (const i of ['001', '002', '003', '010', '013', '016']) names[`w${s}${i}`] = `wing_${s}.${i}`;
  const B = rig.bones({ ...names, neck: 'neck_', neck1: 'neck.001', neck2: 'neck.002', head: 'head_', jaw: 'jaw_', spine: 'spine_', tail: 'tail_', tail1: 'tail.001', tail2: 'tail.002', legL: 'leg_l_', legR: 'leg_r_' });
  // which side each wing is on (bone names are not a reliable guide to handedness)
  rig.root.updateMatrixWorld(true);
  const side = (b) => (b ? Math.sign(rig.root.worldToLocal(b.getWorldPosition(new THREE.Vector3())).x) || 1 : 1);
  const wings = [['wl001', 'wl002', 'wl003', ['wl010', 'wl013', 'wl016']], ['wr001', 'wr002', 'wr003', ['wr010', 'wr013', 'wr016']]].map(([a, b, c, f]) => ({ a: B[a], b: B[b], c: B[c], fingers: f.map((n) => B[n]), s: side(B[c] || B[a]) }));
  const rest = new Map();
  rig.model.traverse((o) => { if (o.isBone) rest.set(o, o.quaternion.clone()); });

  // set.fly 1 = level flight, 0 = standing; set.flap wing-beat strength; set.dive pulls the wings in
  const set = { fly: 1, flap: 1, dive: 0, walk: 0, speed: 0, charge: 0, hurt: 0, jaw: 0 };
  const moves = { dive: 1.15, gust: 0.75, peck: 0.55 };
  let t = Math.random() * 6, flash = 0, fly = 1, dive = 0;
  const rootQ = new THREE.Quaternion();
  const api = {
    root: rig.root, rig, set, height: 8.2, radius: 3.0, bones: B, moves,
    update(dt) {
      t += dt * (5.2 + set.flap * 2.4);
      fly += (set.fly - fly) * Math.min(1, dt * 4); dive += (set.dive - dive) * Math.min(1, dt * 8);
      for (const [b, q] of rest) b.quaternion.copy(q);
      // body: upright when standing, laid forward in flight, nose down in a dive
      rig.tilt.rotation.x = fly * 1.32 + dive * 0.5 - set.hurt * 0.2;
      rig.tilt.position.y = rig.fit.hipY + Math.sin(t - 0.9) * 0.3 * fly * (1 - dive);
      rig.root.updateMatrixWorld(true);
      rig.tilt.getWorldQuaternion(rootQ);
      const beat = Math.sin(t), lag = Math.sin(t - 0.8), amp = set.flap * (1 - dive * 0.85) * (0.35 + fly * 0.3);
      for (const W of wings) {
        // spread flat in flight, swept back and half folded on the ground or in a dive
        const fold = (1 - fly) * 0.9 + dive * 0.75;
        turnBone(W.a, rootQ, AX.z, W.s * (beat * amp + 0.08 - fold * 0.5));
        turnBone(W.a, rootQ, AX.y, W.s * -fold * 0.9);
        turnBone(W.b, rootQ, AX.z, W.s * (lag * amp * 0.7 - fold * 0.35));
        turnBone(W.c, rootQ, AX.z, W.s * (Math.sin(t - 1.5) * amp * 0.6));
        for (const f of W.fingers) turnBone(f, rootQ, AX.y, W.s * -fold * 0.5);
      }
      // in flight the head looks ahead instead of at the sky; the tail trails
      for (const b of [B.neck, B.neck1, B.neck2, B.head]) turnBone(b, rootQ, AX.x, -fly * 0.3 + Math.sin(t * 0.5) * 0.02);
      turnBone(B.jaw, rootQ, AX.x, set.jaw * 0.45);
      for (const b of [B.tail, B.tail1, B.tail2]) turnBone(b, rootQ, AX.x, Math.sin(t - 2) * 0.05 * fly);
      for (const b of [B.legL, B.legR]) turnBone(b, rootQ, AX.x, fly * 0.9);
      hide.emissive.setRGB(Math.max(0, flash) * 0.55, Math.max(0, flash) * 0.14, Math.max(0, flash) * 0.08);
    },
    move(id) { const hit = moves[id] ?? 0.6; return { hit, total: hit + 0.6 }; },
    landed() {}, stop() {},
    react() { return false; },
    mouths: () => [(B.jaw || B.head).getWorldPosition(new THREE.Vector3())],
    flash(k) { flash = k; },
  };
  rig.root.getWorldQuaternion(_q);
  return api;
}
