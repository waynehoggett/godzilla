import * as THREE from 'three/webgpu';
import { texture, uniform, positionGeometry, smoothstep, vec3, float } from 'three/tsl';
import { makeRig, turnBone, findBones, AX } from './rig.js';

export { turnBone, findBones, AX };

// ---------- small modelling helpers used by the code-built props ----------
export function part(parent, geo, mat, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true;
  parent.add(m);
  return m;
}
export function pivot(parent, x = 0, y = 0, z = 0) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }

// Windows of the rig's clips used as moves: [clip, start, end, speed, seconds until the blow lands].
export const MOVES = {
  claw1: ['Melee 2', 1.3, 2.6, 2.5, 0.24],
  claw2: ['Attack', 1.3, 2.45, 2.6, 0.3],
  bite: ['Bite', 0.8, 2.2, 2.2, 0.27],
  tail: ['Tail Swing', 1.6, 4.4, 2.8, 0.5],
  roar: ['Roar', 6.6, 9.8, 2.0, 0.5],
  stomp: ['Stomp', 0.8, 3.2, 2.2, 0.4],
};
const _v = new THREE.Vector3(), _q = new THREE.Quaternion();

/**
 * Godzilla: rigged model with its own walk, attack, tail, roar and breath clips (see CREDITS.md).
 * ~10 units tall, feet at y=0, facing +Z.
 *   set.walk 0..1 and set.speed (world units/s) drive idle/walk; set.charge 0..1 lights the dorsal
 *   fins from the tail to the neck; set.jaw, set.headPitch, set.lean, set.swim, set.hurt, set.headScale
 *   are layered on top of whatever clip is playing. move(name) plays an attack from MOVES.
 */
export function makeGodzilla(o = {}) {
  const rig = makeRig('godzilla21', { height: 10, idle: 'idle', walk: 'Walk1', stride: 0.66, slide: 0.62, maxWalkRate: 7, pelvis: 'bip_pelvis' });
  const { root, tilt, model } = rig;
  const B = rig.bones({ s0: 'bip_spine_0', s1: 'bip_spine_1', s2: 'bip_spine_2', s3: 'bip_spine_3', n0: 'bip_neck_0', n1: 'bip_neck_1', head: 'bip_head', jaw: 'bip_jaw', breath: 'breath_' });
  if (!B.n0) B.n0 = rig.bones({ n: 'bip_neck' }).n;

  // dorsal spikes: the model's own emissive map, with brightness and the tail-to-neck sweep under game control
  const U = { charge: uniform(0), flicker: uniform(1), idle: uniform(o.idleGlow ?? 0.012) };
  model.traverse((m) => {
    if (!m.isMesh || !m.material.emissiveMap || !/spike/i.test(m.material.name)) return;
    const sm = m.material, mat = new THREE.MeshStandardNodeMaterial();
    for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap']) if (sm[k]) mat[k] = sm[k];
    mat.roughness = sm.roughness; mat.metalness = sm.metalness; mat.side = THREE.DoubleSide;
    mat.transparent = sm.transparent; mat.alphaTest = sm.alphaTest; mat.name = sm.name;
    m.geometry.computeBoundingBox();
    const bb = m.geometry.boundingBox, axis = bb.max.z - bb.min.z > bb.max.y - bb.min.y ? 'z' : 'y';
    // sweep coordinate: 0 at the tail tip, ~1 at the neck (bind pose: tail trails behind, back rises)
    const along = positionGeometry[axis].sub(bb.min[axis]).div(bb.max[axis] - bb.min[axis]);
    const up = positionGeometry.y.sub(bb.min.y).div(bb.max.y - bb.min.y);
    const s = axis === 'z' ? along.mul(0.7).add(up.mul(0.3)) : up;
    const lit = smoothstep(U.charge.mul(1.15), U.charge.mul(1.15).sub(0.12), s);
    mat.emissiveNode = texture(sm.emissiveMap).rgb.mul(vec3(0.6, 0.9, 1.0)).mul(U.idle.add(lit.mul(float(7)).mul(U.flicker)));
    m.material = mat;
  });
  const mouthLight = new THREE.PointLight(0x49b6ff, 0, 0, 1.6);
  root.add(mouthLight);

  const set = { walk: 0, speed: null, charge: 0, jaw: 0, lean: 0, headPitch: 0, hurt: 0, swim: 0, headScale: 1 };
  const rootQ = new THREE.Quaternion();
  let t = Math.random() * 5, flash = 0;

  function update(dt) {
    t += dt;
    rig.loco(set.walk, set.speed ?? set.walk * 22 * root.scale.x / 5);
    rig.update(dt);
    tilt.rotation.x = set.swim * 0.8 - set.hurt * 0.14;
    root.updateMatrixWorld(true);
    tilt.getWorldQuaternion(rootQ);
    const X = AX.x;
    if (set.lean) for (const b of [B.s1, B.s2, B.s3]) turnBone(b, rootQ, X, set.lean / 3);
    const pitch = set.headPitch - set.swim * 0.75;
    if (pitch) for (const b of [B.n0, B.n1, B.head]) turnBone(b, rootQ, X, pitch / 3);
    if (set.jaw) turnBone(B.jaw, rootQ, X, set.jaw * 0.5);
    if (set.headScale !== 1) B.head.scale.multiplyScalar(set.headScale);
    U.charge.value = set.charge; U.flicker.value = 1 + Math.sin(t * 23) * 0.12;
    const mg = Math.max(0, set.charge - 0.8) * 5;
    mouthLight.intensity = mg * 70 * (o.lightScale ?? 1);
    if (mg > 0) { mouthWorld(_v); root.worldToLocal(_v); mouthLight.position.copy(_v); }
    rig.flash(Math.max(0, flash));
  }
  const mouthWorld = (v = new THREE.Vector3()) => (B.breath || B.jaw).getWorldPosition(v);
  // Play one of MOVES; returns { hit, total } in seconds.
  function move(name, speedMul = 1) {
    const m = MOVES[name]; if (!m) return { hit: 0, total: 0 };
    const total = rig.act(m[0], { start: m[1], end: m[2], speed: m[3] * speedMul });
    return { hit: m[4] / speedMul, total };
  }
  return {
    root, set, update, rig, move, height: 10, radius: 2.6,
    mouthWorld, mouths: () => [mouthWorld(new THREE.Vector3())],
    headWorld: (v = new THREE.Vector3()) => B.head.getWorldPosition(v),
    head: B.head, bones: B,
    flash(k) { flash = k; },
    forward(out = new THREE.Vector3()) { root.getWorldQuaternion(_q); return out.set(0, 0, 1).applyQuaternion(_q); },
  };
}
