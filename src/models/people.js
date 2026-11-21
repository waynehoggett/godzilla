import * as THREE from 'three/webgpu';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { PersonGenerator } from 'three/addons/generators/city/PersonGenerator.js';
import { assets } from '../core/assets.js';
import { findBones } from './godzilla.js';

const HEIGHT = 1.8;
const fits = {}, clipSets = {};

// Scale/offset/turn that stand a rigged character HEIGHT tall on y=0 facing +Z.
function fitOf(kind, model) {
  if (!fits[kind]) {
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model, true), k = HEIGHT / (box.max.y - box.min.y);
    const b = findBones(model, { foot: 'mixamorigLeftFoot', toe: 'mixamorigLeftToeBase', hips: 'mixamorigHips' });
    const d = b.toe.getWorldPosition(new THREE.Vector3()).sub(b.foot.getWorldPosition(new THREE.Vector3()));
    fits[kind] = { k, y: -box.min.y * k, yaw: -Math.atan2(d.x, d.z), hipY: b.hips.position.y };
  }
  return fits[kind];
}

// Idle / walk / run clips for a character. Michelle has none of her own, so she borrows the
// Soldier's (same Mixamo bone names). Limb rotations carry over directly; the hip bone sits under a
// differently oriented and scaled armature in each file, so its motion is transferred in world space.
function clipsFor(kind) {
  if (clipSets[kind]) return clipSets[kind];
  const src = assets.soldier.animations, out = {};
  if (kind === 'soldier') { for (const c of src) out[c.name.toLowerCase()] = c; return (clipSets[kind] = out); }
  const S = cloneSkinned(assets.soldier.scene), M = cloneSkinned(assets[kind].scene);
  S.updateMatrixWorld(true); M.updateMatrixWorld(true);
  const fs = fitOf('soldier', S), fm = fitOf(kind, M);
  const hs = findBones(S, { h: 'mixamorigHips' }).h, hm = findBones(M, { h: 'mixamorigHips' }).h;
  const Ps = hs.parent.getWorldQuaternion(new THREE.Quaternion()), Pm = hm.parent.getWorldQuaternion(new THREE.Quaternion());
  const PmInv = Pm.clone().invert();
  const WsRestInv = Ps.clone().multiply(hs.quaternion).invert(), WmRest = Pm.clone().multiply(hm.quaternion);
  // turn that takes the Soldier's facing direction to this model's
  const Y = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), fs.yaw - fm.yaw), Yinv = Y.clone().invert();
  const sScale = hs.parent.getWorldScale(new THREE.Vector3()).x, mScale = hm.parent.getWorldScale(new THREE.Vector3()).x;
  const size = (fs.k / fm.k) * (sScale / mScale); // soldier world units -> this model's hip-parent units
  const q = new THREE.Quaternion(), d = new THREE.Quaternion(), v = new THREE.Vector3(), restS = hs.position.clone(), restM = hm.position.clone();
  for (const c of src) {
    const tracks = [];
    for (const t of c.tracks) {
      if (t.name === 'mixamorigHips.quaternion') {
        const o = t.clone();
        for (let i = 0; i < o.values.length; i += 4) {
          q.fromArray(t.values, i);
          d.copy(Ps).multiply(q).multiply(WsRestInv);            // world-space change from the rest pose
          d.premultiply(Y).multiply(Yinv);                         // expressed for this model's facing
          q.copy(PmInv).multiply(d).multiply(WmRest).toArray(o.values, i);
        }
        tracks.push(o);
      } else if (t.name === 'mixamorigHips.position') {
        const o = t.clone();
        for (let i = 0; i < o.values.length; i += 3) {
          v.fromArray(t.values, i).sub(restS).applyQuaternion(Ps).applyQuaternion(Y).multiplyScalar(size).applyQuaternion(PmInv);
          v.add(restM).toArray(o.values, i);
        }
        tracks.push(o);
      } else if (t.name.endsWith('.quaternion')) tracks.push(t.clone());
    }
    out[c.name.toLowerCase()] = new THREE.AnimationClip(c.name, c.duration, tracks);
  }
  return (clipSets[kind] = out);
}

/**
 * A rigged, animated person ~1.8 units tall, feet at y=0, facing +Z.
 * o.kind: 'soldier' | 'michelle'; o.tint: colour multiplied into the clothing.
 * update(dt, speed) blends idle -> walk -> run from the ground speed.
 */
export function makePerson(o = {}) {
  const kind = o.kind || 'soldier', src = assets[kind];
  const root = new THREE.Group(), holder = new THREE.Group(), model = cloneSkinned(src.scene);
  holder.add(model); root.add(holder);
  const f = fitOf(kind, model);
  holder.scale.setScalar(f.k); holder.position.y = f.y; holder.rotation.y = f.yaw;
  model.traverse((m) => {
    if (!m.isMesh) return;
    m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
    m.material = m.material.clone();
    if (o.tint) m.material.color.set(o.tint);
  });
  const mixer = new THREE.AnimationMixer(model), clips = clipsFor(kind);
  const act = { idle: mixer.clipAction(clips.idle), walk: mixer.clipAction(clips.walk), run: mixer.clipAction(clips.run) };
  const w = { idle: 1, walk: 0, run: 0 };
  for (const k in act) { act[k].play(); act[k].setEffectiveWeight(w[k]); }
  act.idle.time = Math.random() * 1.5;
  mixer.update(0);
  function update(dt, speed = 0) {
    const run = THREE.MathUtils.smoothstep(speed, 3.5, 7), walk = speed > 0.3 ? 1 - run : 0, idle = 1 - run - walk, k = Math.min(1, dt * 9);
    w.idle += (idle - w.idle) * k; w.walk += (walk - w.walk) * k; w.run += (run - w.run) * k;
    for (const n in act) act[n].setEffectiveWeight(w[n]);
    act.walk.timeScale = THREE.MathUtils.clamp(speed / 2.2, 0.8, 1.8);
    act.run.timeScale = THREE.MathUtils.clamp(speed / 9, 0.85, 1.7);
    mixer.update(dt);
  }
  return { root, update, model };
}

export const makeKoichi = () => makePerson({ kind: 'soldier' });
export const makeSoldier = () => makePerson({ kind: 'soldier', tint: 0xb8b890 });
export const makeNoriko = () => makePerson({ kind: 'michelle', tint: 0xa9b0c4 });
export const makeCivilian = (i = 0) => makePerson({ kind: i % 2 ? 'michelle' : 'soldier', tint: [0xffffff, 0x9a8a78, 0xc8b8a0, 0x7a8a9a][i % 4] });

/**
 * A crowd of walking civilians from Three.js's PersonGenerator (two instanced draw calls).
 * Each member has { x, z, yaw, speed }; move them, then call update(dt).
 */
export class Crowd {
  constructor(scene, count) {
    this.gen = new PersonGenerator();
    // the generator deals poses by index (about a third stand still); use only the walking slots
    this.slots = [];
    for (let i = 0; this.slots.length < count && i < 400; i++) if ((((i * 2654435761) >>> 0) % 1000) / 1000 < 0.65) this.slots.push(i);
    this.n = this.slots[this.slots.length - 1] + 1;
    this.members = this.slots.map(() => ({ x: 0, z: 0, yaw: 0, speed: 0, phase: Math.random() * 6 }));
    this.mats = Array.from({ length: this.n }, () => new THREE.Matrix4().makeScale(0, 0, 0));
    this.visible = true;
    this.group = this.gen.build(this.mats);
    scene.add(this.group);
    this._p = new THREE.Vector3(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(1, 1, 1); this._e = new THREE.Euler();
  }
  update(dt) {
    this.members.forEach((m, j) => {
      m.phase += dt * (3 + m.speed);
      // a hurried bob and forward lean sell the motion of the fixed walking pose
      this._p.set(m.x, Math.abs(Math.sin(m.phase)) * 0.07, m.z);
      this._q.setFromEuler(this._e.set(0.16, m.yaw, Math.sin(m.phase) * 0.05, 'YXZ'));
      this.mats[this.slots[j]].compose(this._p, this._q, this._s);
    });
    this.group.visible = this.visible;
    this.gen.build(this.mats);
  }
  dispose() { this.gen.dispose(); }
}
