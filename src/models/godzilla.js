import * as THREE from 'three/webgpu';
import { texture, uniform, positionGeometry, smoothstep, vec3, float } from 'three/tsl';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { assets } from '../core/assets.js';

// ---------- shared modelling helpers ----------
function hash3(x, y, z) { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); }

// Roughen a geometry so flat shading reads as craggy hide. Same position -> same offset, so no cracks.
export function craggy(geo, amt = 0.12, seed = 0) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + (hash3(Math.round(x * 40) + seed, Math.round(y * 40), Math.round(z * 40)) - 0.5) * 2 * amt;
    p.setXYZ(i, x * k, y * k, z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

const geoCache = new Map();
export function blobGeo(detail = 2, amt = 0.12, seed = 0) {
  const key = `${detail}|${amt}|${seed}`;
  if (!geoCache.has(key)) geoCache.set(key, amt ? craggy(new THREE.IcosahedronGeometry(1, detail), amt, seed) : new THREE.IcosahedronGeometry(1, detail));
  return geoCache.get(key);
}
export function part(parent, geo, mat, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true;
  parent.add(m);
  return m;
}
export function pivot(parent, x = 0, y = 0, z = 0) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }


// ---------- rig helpers (shared with the other rigged monsters) ----------
const _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _r = new THREE.Quaternion(), _ax = new THREE.Vector3(), _v = new THREE.Vector3();
export const AX = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };

// Rotate a bone by `angle` about an axis given in the model's own space (X left, Y up, Z forward),
// whatever the bone's local axes happen to be. Call after the mixer and an updateMatrixWorld.
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

const TAIL = 'A B C D E F G H I J K L M N O P Q R S T U V W X Y Z AA AB AC AD AE AF AG AH AI AJ AK AL'.split(' ');
const IDLE_FROM = 8.5, IDLE_SPAN = 2.8; // a calm stretch of the clip (it also contains a roar and a stomp)
let fit = null; // scale and offset that put the model 10 units tall, feet on y=0, facing +Z

/**
 * Godzilla: rigged model (see CREDITS.md). ~10 units tall, feet at y=0, facing +Z.
 * Drive it through `set` and call update(dt).
 *   set.walk 0..1, set.charge 0..1 (fins light up from the tail to the neck), set.jaw 0..1,
 *   set.clawL/clawR/attack 0..1, set.whip -1..1 (tail sweep), set.lean, set.headPitch (radians),
 *   set.swim 0..1 (leaning forward in water), set.hurt 0..1
 * o.mecha: chrome Mechagodzilla variant.
 */
export function makeGodzilla(o = {}) {
  const mecha = !!o.mecha;
  const src = assets.godzilla;
  const root = new THREE.Group(), tilt = new THREE.Group(), holder = new THREE.Group();
  const model = cloneSkinned(src.scene);
  holder.add(model); tilt.add(holder); root.add(tilt);
  const mixer = new THREE.AnimationMixer(model);
  mixer.clipAction(src.animations[0]).play();
  mixer.setTime(IDLE_FROM); model.updateMatrixWorld(true);
  if (!fit) {
    const box = new THREE.Box3().setFromObject(model, true), k = 10 / (box.max.y - box.min.y);
    const hips = findBones(model, { l: 'l_legJA', r: 'r_legJA' });
    const c = hips.l.getWorldPosition(new THREE.Vector3()).add(hips.r.getWorldPosition(new THREE.Vector3())).multiplyScalar(0.5);
    fit = { k, x: -c.x * k, y: -box.min.y * k, z: -c.z * k, hipY: (c.y - box.min.y) * k };
  }
  holder.scale.setScalar(fit.k); holder.position.set(fit.x, fit.y, fit.z);
  // pivot the swim/hurt tilt at the hips
  tilt.position.y = fit.hipY; holder.position.y -= fit.hipY;

  const B = findBones(model, {
    hips: 'spineJA', s1: 'spineJB', s2: 'spineJC', s3: 'spineJD', s4: 'spineJE', s5: 'spineJF',
    n1: 'neckJA', n2: 'neckJB', n3: 'neckJC', head: 'headJA', jaw: 'jawJA',
    armL: 'l_armJA_', foreL: 'l_armJB_', armR: 'r_armJA_', foreR: 'r_armJB_',
    legL: 'l_legJA', shinL: 'l_legJB', footL: 'l_footJA', legR: 'r_legJA', shinR: 'r_legJB', footR: 'r_footJA',
  });
  const tail = TAIL.map((n) => findBones(model, { b: `tailJ${n}_JNT` }).b).filter(Boolean);

  // --- material: the model's own textures, with the fin glow under game control ---
  const U = { charge: uniform(0), hurt: uniform(0), flicker: uniform(1) };
  let skin = null;
  model.traverse((m) => {
    if (!m.isMesh) return;
    const sm = m.material, mat = (skin = new THREE.MeshPhysicalNodeMaterial());
    for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'clearcoatNormalMap']) if (sm[k]) mat[k] = sm[k];
    mat.roughness = sm.roughness; mat.metalness = sm.metalness; mat.clearcoat = 0.35; mat.clearcoatRoughness = 0.45; mat.side = THREE.FrontSide;
    if (mecha) { mat.map = null; mat.color.set(0xc6ced6); mat.metalness = 1; mat.metalnessMap = null; mat.roughnessMap = null; mat.roughness = 0.24; mat.clearcoat = 0; }
    // glow front sweeps from the tail tip (s=0) up the back to the neck (s~0.9), in bind-pose space
    m.geometry.computeBoundingBox();
    const bb = m.geometry.boundingBox, pos = m.geometry.attributes.position, den = pos.normalized ? (pos.array instanceof Int16Array ? 32767 : pos.array instanceof Uint16Array ? 65535 : pos.array instanceof Int8Array ? 127 : 255) : 1;
    // (the compressed mesh stores positions as normalised integers, so measure the range rather than assume it)
    const z0 = bb.min.z, zr = bb.max.z - bb.min.z, y0 = bb.min.y, yr = bb.max.y - bb.min.y; void den;
    const s = positionGeometry.z.sub(z0).div(zr).mul(0.7).add(positionGeometry.y.sub(y0).div(yr).mul(0.3));
    const lit = smoothstep(U.charge.mul(1.15), U.charge.mul(1.15).sub(0.12), s);
    const glow = float(mecha ? 2.5 : 0.06).add(lit.mul(mecha ? 14 : 34).mul(U.flicker));
    const tint = mecha ? vec3(1.0, 0.22, 0.1) : vec3(0.55, 0.85, 1.0);
    mat.emissiveNode = texture(sm.emissiveMap).rgb.dot(vec3(0.33)).mul(tint).mul(glow).add(vec3(1, 0.25, 0.15).mul(U.hurt));
    m.material = mat; m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
  });

  const mouthLight = new THREE.PointLight(mecha ? 0xff5030 : 0x49b6ff, 0, 0, 1.6);
  root.add(mouthLight);

  const set = { walk: 0, charge: 0, jaw: 0, clawL: 0, clawR: 0, whip: 0, lean: 0, headPitch: 0, hurt: 0, swim: 0, attack: 0, flap: 0, fold: 0, headScale: 1 };
  let phase = 0, t = Math.random() * 5, idle = Math.random() * IDLE_SPAN;
  const rootQ = new THREE.Quaternion(), dur = src.animations[0].duration;

  function update(dt) {
    t += dt; idle += dt * 0.6;
    const w = set.walk;
    phase += dt * (1.5 + w * 2.0) * (w > 0.02 ? 1 : 0);
    // base pose: ping-pong through the calm part of the clip
    const pp = idle % (IDLE_SPAN * 2), tt = IDLE_FROM + (pp < IDLE_SPAN ? pp : IDLE_SPAN * 2 - pp);
    mixer.setTime(tt % dur);
    tilt.rotation.x = set.swim * 0.85 - set.hurt * 0.18;
    tilt.position.y = fit.hipY + Math.abs(Math.cos(phase)) * 0.16 * w;
    tilt.rotation.z = Math.sin(phase) * 0.035 * w;
    root.updateMatrixWorld(true);
    root.getWorldQuaternion(rootQ);
    const X = AX.x, Y = AX.y;
    // spine: lean, tail-sweep twist
    const lean = set.lean + w * 0.05;
    for (const b of [B.s1, B.s2, B.s3, B.s4]) { turnBone(b, rootQ, X, lean / 4); turnBone(b, rootQ, Y, set.whip * -0.14); }
    // neck + head
    const pitch = set.headPitch - set.swim * 0.7 - set.jaw * 0.12;
    for (const b of [B.n1, B.n2, B.n3, B.head]) turnBone(b, rootQ, X, pitch / 4);
    turnBone(B.jaw, rootQ, X, set.jaw * 0.55);
    if (set.headScale !== 1) B.head.scale.multiplyScalar(set.headScale);
    // legs
    for (const [leg, shin, foot, off] of [[B.legL, B.shinL, B.footL, 0], [B.legR, B.shinR, B.footR, Math.PI]]) {
      const a = Math.sin(phase + off);
      turnBone(leg, rootQ, X, -a * 0.4 * w - set.swim * 0.5);
      turnBone(shin, rootQ, X, Math.max(0, a) * 0.65 * w + set.swim * 0.3);
      turnBone(foot, rootQ, X, -Math.max(0, a) * 0.25 * w);
    }
    // arms
    for (const [arm, fore, c, sgn] of [[B.armL, B.foreL, Math.max(set.clawL, set.attack), 1], [B.armR, B.foreR, Math.max(set.clawR, set.attack), -1]]) {
      turnBone(arm, rootQ, X, -c * 1.25 + Math.sin(phase) * 0.08 * w * sgn);
      turnBone(arm, rootQ, Y, -sgn * c * 0.5);
      turnBone(fore, rootQ, X, -c * 0.5);
    }
    // tail: slow sway plus the whip
    const n = tail.length;
    for (let i = 0; i < n; i++) turnBone(tail[i], rootQ, Y, Math.sin(t * 1.1 - i * 0.22) * (0.012 + w * 0.012) + (set.whip * 2.4) / n + (i < 6 ? set.whip * 0.05 : 0));
    // glow
    U.charge.value = set.charge; U.hurt.value = Math.max(0, hurtFlash); U.flicker.value = 1 + Math.sin(t * 23) * 0.12;
    const mg = Math.max(0, set.charge - 0.8) * 5;
    mouthLight.intensity = mg * 70 * (o.lightScale ?? 1);
    if (mg > 0) { B.jaw.getWorldPosition(_v); root.worldToLocal(_v); mouthLight.position.copy(_v); }
  }
  let hurtFlash = 0;
  const fwd = new THREE.Vector3();
  const mouthWorld = (v = new THREE.Vector3()) => {
    B.head.getWorldPosition(v);
    const sc = root.getWorldScale(_v).x; root.getWorldQuaternion(_q);
    return v.add(fwd.set(0, -0.55, 1.5).multiplyScalar(sc).applyQuaternion(_q));
  };
  return {
    root, set, update, mecha, height: 10, radius: 2.6,
    mouthWorld, mouths: () => [mouthWorld(new THREE.Vector3())],
    headWorld: (v = new THREE.Vector3()) => B.head.getWorldPosition(v),
    head: B.head, bones: B, material: skin,
    flash(k) { hurtFlash = k * 0.6; },
  };
}
