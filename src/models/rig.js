import * as THREE from 'three/webgpu';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { assets } from '../core/assets.js';

const _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _r = new THREE.Quaternion(), _ax = new THREE.Vector3();
export const AX = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };

// Rotate a bone by `angle` about an axis given in the model's own space (X left, Y up, Z forward),
// whatever the bone's local axes are. Call after the mixer has posed the skeleton.
export function turnBone(bone, rootQ, axis, angle) {
  if (!bone || !angle) return;
  _ax.copy(axis).applyQuaternion(rootQ);
  _r.setFromAxisAngle(_ax, angle);
  bone.parent.getWorldQuaternion(_pq);
  _q.copy(_pq).invert().multiply(_r).multiply(_pq);
  bone.quaternion.premultiply(_q);
}
export function findBones(root, prefixes) {
  const out = {};
  root.traverse((o) => { for (const k in prefixes) if (!out[k] && o.name.startsWith(prefixes[k])) out[k] = o; });
  return out;
}

const fits = {};

/**
 * A rigged model driven by its own animation clips.
 * cfg: { height, idle, walk, stride (ground speed of the walk clip at 1x for a 10-unit-tall model),
 *        pelvis (bone prefix used to centre the model), yaw }
 * API: loco(amount 0..1, worldSpeed), act(clip, { start, end, speed, fade, hold }), stop(), update(dt)
 * Feet at y=0, facing +Z, `height` units tall.
 */
export function makeRig(key, cfg) {
  const src = assets[key];
  const root = new THREE.Group(), tilt = new THREE.Group(), holder = new THREE.Group(), model = cloneSkinned(src.scene);
  holder.add(model); tilt.add(holder); root.add(tilt);
  const mats = [];
  model.traverse((m) => {
    if (!m.isMesh) return;
    m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
    m.material = m.material.clone(); m.material.side = cfg.doubleSided ? THREE.DoubleSide : THREE.FrontSide;
    if (!m.material.emissiveMap && m.material.emissive) mats.push(m.material);
  });
  const mixer = new THREE.AnimationMixer(model), acts = {};
  for (const c of src.animations) acts[c.name] = mixer.clipAction(c);
  const idle = acts[cfg.idle], walk = acts[cfg.walk];
  if (idle) { idle.play(); idle.setEffectiveWeight(1); }
  if (walk) { walk.play(); walk.setEffectiveWeight(0); }
  mixer.update(0); model.updateMatrixWorld(true);
  if (!fits[key]) {
    const box = new THREE.Box3().setFromObject(model, true), k = cfg.height / (box.max.y - box.min.y);
    const b = findBones(model, { p: cfg.pelvis || 'bip_pelvis' }), c = b.p ? b.p.getWorldPosition(new THREE.Vector3()) : box.getCenter(new THREE.Vector3());
    fits[key] = { k, x: -c.x * k, y: -box.min.y * k, z: -c.z * k, hipY: ((b.p ? c.y : (box.max.y + box.min.y) / 2) - box.min.y) * k };
  }
  const fit = fits[key];
  holder.scale.setScalar(fit.k); holder.position.set(fit.x, fit.y - fit.hipY, fit.z); holder.rotation.y = cfg.yaw || 0;
  tilt.position.y = fit.hipY; // tilt (swim, fall, flight) pivots at the hips

  let shot = null, walkW = 0, want = 0, wantSpeed = 0, locoW = 1;
  const ws = new THREE.Vector3();
  const rig = {
    root, tilt, holder, model, mixer, acts, fit, height: cfg.height,
    has: (n) => !!acts[n],
    busy: () => !!shot,
    current: () => (shot ? shot.name : null),
    loco(amount, worldSpeed = 0) { want = amount; wantSpeed = worldSpeed; },
    // Play a clip (or a window of it) once, cross-fading from whatever is playing.
    act(name, o = {}) {
      const a = acts[name];
      if (!a) return 0;
      const speed = o.speed ?? 1, start = o.start ?? 0, end = o.end ?? a.getClip().duration, fade = o.fade ?? 0.12;
      if (shot && shot.a !== a) shot.a.fadeOut(fade);
      a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.timeScale = speed; a.time = start; a.setEffectiveWeight(1);
      a.fadeIn(fade); a.play();
      shot = { a, name, end, hold: !!o.hold, fade };
      return (end - start) / Math.max(0.01, speed);
    },
    speed(k) { if (shot) shot.a.timeScale = k; },
    time() { return shot ? shot.a.time : 0; },
    stop(fade = 0.18) { if (shot) { shot.a.fadeOut(fade); shot = null; } },
    update(dt) {
      if (shot && !shot.hold && shot.a.time >= shot.end - 0.001) rig.stop(shot.fade + 0.06);
      if (shot && shot.hold && shot.a.time >= shot.end) { shot.a.time = shot.end; shot.a.timeScale = 0; }
      // locomotion blend underneath any one-shot
      const k = Math.min(1, dt * 8);
      walkW += (want - walkW) * k; locoW += ((shot ? 0 : 1) - locoW) * Math.min(1, dt * 10);
      if (idle) idle.setEffectiveWeight(walk ? (1 - walkW) * locoW : locoW);
      if (walk) {
        walk.setEffectiveWeight(walkW * locoW);
        if (cfg.stride) { root.getWorldScale(ws); const natural = cfg.stride * (cfg.height / 10) * ws.x; walk.timeScale = THREE.MathUtils.clamp((wantSpeed / natural) * (cfg.slide ?? 1), 0.3, cfg.maxWalkRate ?? 8); }
      }
      mixer.update(dt);
    },
    flash(v) { for (const m of mats) m.emissive.setRGB(v * 0.55, v * 0.14, v * 0.08); },
    bones: (prefixes) => findBones(model, prefixes),
  };
  return rig;
}
