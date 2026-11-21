import * as THREE from 'three/webgpu';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { LoftGeometry } from 'three/addons/geometries/LoftGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PersonGenerator } from 'three/addons/generators/city/PersonGenerator.js';
import { assets } from '../core/assets.js';

// People are built in code as skinned figures in 1940s dress, and animated by the idle / walk / run
// clips of the Mixamo skeleton that ships with the Three.js examples (see CREDITS.md).

const HEIGHT = 1.8, V = THREE.Vector3;
const BONES = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase'];

// colours per outfit
const SKIN = 0xc99a78, HAIR = 0x14100e;
const OUTFITS = {
  pilot: { top: 0x5a4630, legs: 0x5a4630, shoes: 0x1c1612, vest: 0xb39a52, scarf: 0xece6d8, helmet: 0x3a2a1c, gloves: 0x2e2118, belt: 0x241a12 },
  civil: { top: 0xcfc6b0, legs: 0x3d3a34, shoes: 0x1c1612, cap: 0x4a4438, belt: 0x241a12, sleeves: 'rolled' },
  mechanic: { top: 0x70704a, legs: 0x66663f, shoes: 0x2a2218, cap: 0x66663f, belt: 0x3a2c1c, gaiters: 0x8a8460 },
  noriko: { top: 0xe6dfd0, legs: SKIN, shoes: 0x2a1c16, skirt: 0x34506e, hair: 'bob', female: true },
};

// ---- geometry with skin weights ----
class Body {
  constructor(index) { this.index = index; this.geos = []; }
  // Add a geometry coloured `color`; weight(vertexPosition, vertexIndex) -> [[boneName, w], ...]
  add(geo, color, weight) {
    const g = geo.index ? geo.toNonIndexed() : geo, n = g.attributes.position.count, c = new THREE.Color(color);
    const col = new Float32Array(n * 3), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4), p = new V();
    for (let i = 0; i < n; i++) {
      c.toArray(col, i * 3);
      p.fromBufferAttribute(g.attributes.position, i);
      const w = typeof weight === 'string' ? [[weight, 1]] : weight(p, i);
      let sum = 0; for (const x of w) sum += x[1];
      w.slice(0, 4).forEach(([b, x], k) => { si[i * 4 + k] = this.index[b]; sw[i * 4 + k] = x / sum; });
    }
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal'].includes(k)) g.deleteAttribute(k);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    this.geos.push(g);
  }
  // A tube through `stations`: [{ at: Vector3, rx, rz, bone, ax?, az? }]. Each ring follows its bone, and
  // vertices between rings blend between the two, which keeps elbows, knees and the waist continuous.
  tube(stations, color, o = {}) {
    const n = o.sides || 12, rings = stations.map((s, k) => {
      const dir = new V().subVectors(stations[Math.min(k + 1, stations.length - 1)].at, stations[Math.max(k - 1, 0)].at).normalize();
      const ax = (s.ax || o.ax || new V(1, 0, 0)).clone().addScaledVector(dir, -dir.dot(s.ax || o.ax || new V(1, 0, 0))).normalize(), az = new V().crossVectors(ax, dir).normalize();
      const pts = [];
      for (let j = 0; j < n; j++) { const a = (j / n) * Math.PI * 2; pts.push(s.at.clone().addScaledVector(ax, Math.cos(a) * s.rx).addScaledVector(az, Math.sin(a) * (s.rz ?? s.rx))); }
      return pts;
    });
    const geo = new LoftGeometry(rings, { capStart: o.caps !== false, capEnd: o.caps !== false });
    this.add(geo, color, (p) => {
      // nearest station along the tube decides the bone; neighbours share the weight
      let best = 0, bd = 1e9; stations.forEach((s, k) => { const d = p.distanceToSquared(s.at); if (d < bd) { bd = d; best = k; } });
      const s = stations[best], w = [[s.bone, 1]];
      const prev = stations[best - 1], next = stations[best + 1];
      if (prev && prev.bone !== s.bone) w.push([prev.bone, 0.35]);
      if (next && next.bone !== s.bone) w.push([next.bone, 0.35]);
      return w;
    });
  }
  ball(at, rx, ry, rz, color, bone, seg = 12) { this.add(new THREE.SphereGeometry(1, seg, Math.max(6, seg - 4)).scale(rx, ry, rz).translate(at.x, at.y, at.z), color, bone); }
  build(material) { const g = mergeGeometries(this.geos); g.computeVertexNormals(); return new THREE.SkinnedMesh(g, material); }
}

let rest = null; // bone positions of the skeleton's rest pose, measured once
function measure(model) {
  model.updateMatrixWorld(true);
  const b = {}; model.traverse((o) => { if (o.isBone && o.name.startsWith('mixamorig')) b[o.name.slice(9)] = o; });
  const P = {}; for (const n of BONES) P[n] = b[n].getWorldPosition(new V());
  const head = b.Head.getWorldPosition(new V()), foot = Math.min(P.LeftToeBase.y, P.RightToeBase.y);
  // the armature is not in metres: u converts metres to its units; fwd is the way the toes point
  const neckToHead = head.y - P.Neck.y, top = head.y + neckToHead * 1.75, u = (top - foot) / HEIGHT;
  const fwd = new V().subVectors(P.LeftToeBase, P.LeftFoot).setY(0).normalize(), side = new V().crossVectors(new V(0, 1, 0), fwd).normalize();
  return { P, u, fwd, side, foot, k: 1 / u, yaw: -Math.atan2(fwd.x, fwd.z) };
}

function buildFigure(model, bones, o) {
  const R = rest, P = R.P, u = R.u, F = R.fwd, S = R.side, UP = new V(0, 1, 0);
  const index = {}; bones.forEach((b, i) => { index[b.name.slice(9)] = i; });
  const B = new Body(index), fem = !!o.female, m = (x) => x * u;
  const at = (p, f = 0, up = 0, s = 0) => p.clone().addScaledVector(F, m(f)).addScaledVector(UP, m(up)).addScaledVector(S, m(s));
  const lerp = (a, b, t) => a.clone().lerp(b, t);

  // torso: hips to neck
  const sh = fem ? 0.165 : 0.19, waist = fem ? 0.125 : 0.155, hip = fem ? 0.165 : 0.16;
  B.tube([
    { at: at(P.Hips, 0, -0.1), rx: m(hip * 0.85), rz: m(0.1), bone: 'Hips' },
    { at: at(P.Hips, 0, 0.02), rx: m(hip), rz: m(0.128), bone: 'Hips' },
    { at: at(P.Spine, 0, 0.02), rx: m(waist), rz: m(0.118), bone: 'Spine' },
    { at: at(P.Spine1), rx: m((waist + sh) / 2), rz: m(0.128), bone: 'Spine1' },
    { at: at(P.Spine2, 0.005), rx: m(sh), rz: m(fem ? 0.125 : 0.14), bone: 'Spine2' },
    { at: at(P.Neck, 0, -0.03), rx: m(sh * 0.8), rz: m(0.1), bone: 'Spine2' },
    { at: at(P.Neck, 0, 0.0), rx: m(0.062), rz: m(0.062), bone: 'Neck' },
  ], o.top, { ax: S, sides: 16 });
  // neck and head
  const head = at(P.Head, 0.012, 0.1);
  B.tube([{ at: at(P.Neck, 0, -0.02), rx: m(0.052), bone: 'Neck' }, { at: at(P.Head, 0, 0.02), rx: m(0.05), bone: 'Head' }], SKIN, { ax: S, sides: 10 });
  B.ball(head, m(0.082), m(0.108), m(0.098), SKIN, 'Head', 16);
  B.ball(at(head, 0.062, -0.05), m(0.055), m(0.05), m(0.05), SKIN, 'Head', 10);                 // jaw
  B.ball(at(head, 0.098, -0.008), m(0.014), m(0.022), m(0.018), 0xb98a6a, 'Head', 8);            // nose
  for (const s of [1, -1]) {
    B.ball(at(head, 0.082, 0.022, 0.034 * s), m(0.011), m(0.008), m(0.006), 0x120c0a, 'Head', 6); // eyes
    B.ball(at(head, 0.006, 0, 0.084 * s), m(0.012), m(0.026), m(0.018), SKIN, 'Head', 6);         // ears
  }
  // arms and legs
  for (const side of ['Left', 'Right']) {
    const a = P[side + 'Arm'], e = P[side + 'ForeArm'], h = P[side + 'Hand'];
    const armDir = new V().subVectors(h, a).normalize(), handEnd = h.clone().addScaledVector(armDir, m(0.17));
    const upper = fem ? 0.045 : 0.058, sleeve = o.sleeves === 'rolled' ? 0.5 : 1;
    B.tube([
      { at: lerp(P[side + 'Shoulder'], a, 0.6), rx: m(upper * 1.25), bone: 'Spine2' },
      { at: a, rx: m(upper * 1.15), bone: side + 'Arm' },
      { at: lerp(a, e, 0.55), rx: m(upper), bone: side + 'Arm' },
      { at: e, rx: m(upper * 0.9), bone: side + 'ForeArm' },
      ...(sleeve === 1 ? [{ at: lerp(e, h, 0.6), rx: m(upper * 0.78), bone: side + 'ForeArm' }, { at: lerp(e, h, 0.97), rx: m(upper * 0.7), bone: side + 'ForeArm' }] : [{ at: lerp(e, h, 0.12), rx: m(upper * 0.95), bone: side + 'ForeArm' }]),
    ], o.top, { ax: F });
    if (sleeve !== 1) B.tube([{ at: lerp(e, h, 0.08), rx: m(upper * 0.75), bone: side + 'ForeArm' }, { at: lerp(e, h, 0.97), rx: m(upper * 0.6), bone: side + 'ForeArm' }], SKIN, { ax: F });
    B.tube([{ at: lerp(e, h, 0.95), rx: m(0.034), rz: m(0.026), bone: side + 'Hand' }, { at: lerp(h, handEnd, 0.5), rx: m(0.044), rz: m(0.02), bone: side + 'Hand' }, { at: handEnd, rx: m(0.03), rz: m(0.014), bone: side + 'Hand' }], o.gloves ?? SKIN, { ax: F, sides: 8 });

    const t = P[side + 'UpLeg'], k = P[side + 'Leg'], f = P[side + 'Foot'], toe = P[side + 'ToeBase'];
    const thigh = fem ? 0.085 : 0.096, calf = fem ? 0.052 : 0.064, legCol = o.legs;
    B.tube([
      { at: at(t, 0, 0.04), rx: m(thigh * 1.05), bone: 'Hips' },
      { at: lerp(t, k, 0.15), rx: m(thigh), bone: side + 'UpLeg' },
      { at: lerp(t, k, 0.6), rx: m(thigh * 0.82), bone: side + 'UpLeg' },
      { at: k, rx: m(calf * 1.12), bone: side + 'Leg' },
      { at: lerp(k, f, 0.35), rx: m(calf * 1.08), bone: side + 'Leg' },
      { at: lerp(k, f, 0.92), rx: m(calf * 0.72), bone: side + 'Leg' },
    ], legCol, { ax: S });
    if (o.gaiters || o.helmet) B.tube([{ at: lerp(k, f, 0.3), rx: m(calf * 1.16), bone: side + 'Leg' }, { at: lerp(k, f, 0.93), rx: m(calf * 0.84), bone: side + 'Leg' }], o.gaiters ?? o.shoes, { ax: S });
    // shoe: heel to toe along the ground
    const heel = at(f, -0.06, 0), sole = R.foot + m(0.045), tip = toe.clone().addScaledVector(F, m(0.035)); heel.y = sole; tip.y = R.foot + m(0.03);
    B.tube([{ at: heel, rx: m(0.04), rz: m(0.042), bone: side + 'Foot' }, { at: lerp(heel, tip, 0.45).setY(sole + m(0.012)), rx: m(0.046), rz: m(0.045), bone: side + 'Foot' }, { at: lerp(heel, tip, 0.8), rx: m(0.044), rz: m(0.034), bone: side + 'ToeBase' }, { at: tip, rx: m(0.03), rz: m(0.022), bone: side + 'ToeBase' }], o.shoes, { ax: S, sides: 10 });
  }
  // belt
  if (o.belt) B.tube([{ at: at(P.Hips, 0, 0.075), rx: m(hip * 1.04), rz: m(0.121), bone: 'Hips' }, { at: at(P.Hips, 0, 0.12), rx: m(hip * 1.02), rz: m(0.119), bone: 'Hips' }], o.belt, { ax: S, sides: 16 });

  // ---- outfit pieces ----
  if (o.vest) {
    // kapok life vest: ribbed panels across the chest and back
    for (const z of [1, -1]) for (let i = 0; i < 5; i++) {
      const y = 0.03 + i * 0.062, p = lerp(P.Spine, P.Neck, 0.18).addScaledVector(UP, m(y - 0.02));
      B.tube([{ at: p.clone().addScaledVector(S, m(-0.15)).addScaledVector(F, m(0.1 * z)), rx: m(0.03), rz: m(0.034), bone: 'Spine2' }, { at: p.clone().addScaledVector(F, m(0.135 * z)), rx: m(0.03), rz: m(0.04), bone: 'Spine2' }, { at: p.clone().addScaledVector(S, m(0.15)).addScaledVector(F, m(0.1 * z)), rx: m(0.03), rz: m(0.034), bone: 'Spine2' }], o.vest, { ax: UP, sides: 8 });
    }
  }
  if (o.scarf) {
    B.add(new THREE.TorusGeometry(m(0.075), m(0.032), 8, 16).rotateX(Math.PI / 2).translate(P.Neck.x, P.Neck.y + m(0.0), P.Neck.z), o.scarf, 'Neck');
    B.tube([{ at: at(P.Neck, 0.08, -0.02, 0.03), rx: m(0.03), rz: m(0.012), bone: 'Spine2' }, { at: at(P.Neck, 0.13, -0.2, 0.05), rx: m(0.036), rz: m(0.01), bone: 'Spine2' }], o.scarf, { ax: S, sides: 8 });
  }
  if (o.helmet) {
    // leather flying helmet with ear flaps, goggles pushed up on the brow
    B.add(new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.62).scale(m(0.09), m(0.116), m(0.105)).translate(head.x, head.y + m(0.004), head.z), o.helmet, 'Head');
    for (const s of [1, -1]) {
      B.ball(at(head, -0.005, -0.045, 0.084 * s), m(0.02), m(0.062), m(0.05), o.helmet, 'Head', 8);
      const g = at(head, 0.075, 0.07, 0.036 * s);
      B.add(new THREE.TorusGeometry(m(0.026), m(0.008), 6, 14).rotateX(-0.5).translate(g.x, g.y, g.z), 0x15120f, 'Head');
      B.ball(g, m(0.022), m(0.02), m(0.008), 0x6f8fa0, 'Head', 8);
    }
    B.tube([{ at: at(head, 0.05, 0.075, 0.085), rx: m(0.012), rz: m(0.004), bone: 'Head' }, { at: at(head, -0.09, 0.06, 0), rx: m(0.012), rz: m(0.004), bone: 'Head' }, { at: at(head, 0.05, 0.075, -0.085), rx: m(0.012), rz: m(0.004), bone: 'Head' }], 0x15120f, { ax: UP, sides: 6 });
  } else if (o.cap) {
    B.add(new THREE.CylinderGeometry(m(0.088), m(0.092), m(0.07), 14).translate(head.x, head.y + m(0.085), head.z), o.cap, 'Head');
    const brim = at(head, 0.1, 0.055); B.ball(brim, m(0.07), m(0.008), m(0.05), o.cap, 'Head', 10);
    B.add(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, Math.PI * 0.3, Math.PI * 0.32).scale(m(0.088), m(0.112), m(0.103)).translate(head.x, head.y, head.z), HAIR, 'Head'); // hair below the cap
  } else {
    // hair
    B.add(new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.52).scale(m(0.089), m(0.116), m(0.105)).translate(head.x - F.x * m(0.008), head.y + m(0.004), head.z - F.z * m(0.008)), HAIR, 'Head');
    if (o.hair === 'bob') { B.ball(at(head, -0.035, -0.02), m(0.092), m(0.1), m(0.085), HAIR, 'Head', 12); for (const s of [1, -1]) B.ball(at(head, 0.0, -0.045, 0.078 * s), m(0.022), m(0.07), m(0.05), HAIR, 'Head', 8); }
  }
  if (o.skirt) {
    // knee-length skirt hangs from the hips and swings a little with each thigh
    const top = at(P.Hips, 0, 0.09), knee = (P.LeftLeg.y + P.RightLeg.y) / 2 - m(0.04), mid = (top.y + knee) / 2;
    const ring = (y, rx, rz) => ({ at: new V(P.Hips.x, y, P.Hips.z), rx: m(rx), rz: m(rz), bone: 'Hips' });
    const geo = new LoftGeometry([ring(top.y, 0.168, 0.125), ring(mid, 0.21, 0.185), ring(knee, 0.25, 0.225)].map((s) => { const pts = []; for (let j = 0; j < 18; j++) { const a = (j / 18) * Math.PI * 2; pts.push(s.at.clone().addScaledVector(S, Math.cos(a) * s.rx).addScaledVector(F, Math.sin(a) * s.rz)); } return pts; }));
    B.add(geo, o.skirt, (p) => { const down = THREE.MathUtils.clamp((top.y - p.y) / (top.y - knee), 0, 1), sideAmt = (p.clone().sub(P.Hips).dot(S)) / m(0.2); return [['Hips', 1 - down * 0.72], [sideAmt > 0 ? 'LeftUpLeg' : 'RightUpLeg', down * 0.72]]; });
  }
  const mesh = B.build(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, side: THREE.DoubleSide }));
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
  model.add(mesh);
  mesh.bind(new THREE.Skeleton(bones), new THREE.Matrix4());
  return mesh;
}

/**
 * A rigged, animated person ~1.8 units tall, feet at y=0, facing +Z.
 * outfit: 'pilot' | 'civil' | 'mechanic' | 'noriko'. update(dt, speed) blends idle -> walk -> run.
 */
export function makePerson(outfit = 'civil') {
  const src = assets.soldier, root = new THREE.Group(), holder = new THREE.Group(), model = cloneSkinned(src.scene);
  if (!rest) rest = measure(model);
  model.updateMatrixWorld(true);
  const bones = []; model.traverse((o) => { if (o.isBone && BONES.includes(o.name.slice(9))) bones.push(o); else if (o.isMesh) o.visible = false; });
  buildFigure(model, bones, OUTFITS[outfit] || OUTFITS.civil);
  holder.add(model); root.add(holder);
  holder.scale.setScalar(rest.k); holder.position.y = -rest.foot * rest.k; holder.rotation.y = rest.yaw;
  if (outfit === 'noriko') holder.scale.multiplyScalar(0.93);

  const mixer = new THREE.AnimationMixer(model), clip = (n) => src.animations.find((c) => c.name.toLowerCase() === n);
  const act = { idle: mixer.clipAction(clip('idle')), walk: mixer.clipAction(clip('walk')), run: mixer.clipAction(clip('run')) };
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

export const makeKoichi = (outfit = 'pilot') => makePerson(outfit);
export const makeSoldier = () => makePerson('mechanic');
export const makeNoriko = () => makePerson('noriko');

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
