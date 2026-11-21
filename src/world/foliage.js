import * as THREE from 'three/webgpu';
import { positionLocal, positionWorld, time, sin, vec3, smoothstep, float } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TreeGenerator, createTreeMaterial } from 'three/addons/generators/TreeGenerator.js';

// Trees for the island: branch structure from Three.js's TreeGenerator with leaf sprays hung on
// it, and coconut palms with a curved trunk and drooping fronds. Every tree is a pair of
// instanced meshes (wood + leaves) and uses ordinary lit, fog-aware materials.

export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---- leaf textures, painted once ----
let _tex = null;
function textures() {
  if (_tex) return _tex;
  const make = (w, h, paint) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    paint(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return t;
  };
  const r = rng(7);
  // a spray of broad leaves around a twig
  const spray = make(256, 256, (g, w, h) => {
    g.translate(w / 2, h / 2);
    g.strokeStyle = '#2b2116'; g.lineWidth = 3;
    for (let i = 0; i < 7; i++) { const a = r() * 6.28, l = 40 + r() * 70; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(Math.cos(a + 0.4) * l * 0.5, Math.sin(a + 0.4) * l * 0.5, Math.cos(a) * l, Math.sin(a) * l); g.stroke(); }
    for (let i = 0; i < 150; i++) {
      const a = r() * 6.28, d = Math.sqrt(r()) * 112, x = Math.cos(a) * d, y = Math.sin(a) * d, len = 15 + r() * 13, wd = len * (0.34 + r() * 0.14);
      g.save(); g.translate(x, y); g.rotate(a + (r() - 0.5) * 1.6);
      const light = 15 + r() * 22;
      g.fillStyle = `hsl(${88 + r() * 34}, ${34 + r() * 22}%, ${light}%)`;
      g.beginPath(); g.moveTo(-len, 0); g.quadraticCurveTo(0, -wd, len, 0); g.quadraticCurveTo(0, wd, -len, 0); g.fill();
      g.strokeStyle = `hsla(95, 40%, ${light + 12}%, 0.7)`; g.lineWidth = 1; g.beginPath(); g.moveTo(-len, 0); g.lineTo(len, 0); g.stroke();
      g.restore();
    }
  });
  // one palm frond: rib along x, leaflets raked toward the tip
  const frond = make(512, 160, (g, w, h) => {
    const mid = h / 2;
    for (let i = 0; i < 46; i++) {
      const u = i / 45, x = 14 + u * (w - 40), len = (h * 0.5 - 4) * Math.sin(Math.min(1, u * 1.25 + 0.12) * Math.PI) ** 0.6 * (1 - u * 0.35), rake = 0.5 + u * 0.45;
      for (const side of [-1, 1]) {
        const light = 17 + r() * 16;
        g.fillStyle = `hsl(${78 + r() * 26}, ${36 + r() * 16}%, ${light}%)`;
        const tx = x + Math.sin(rake) * len * 0.75, ty = mid + side * Math.cos(rake) * len;
        g.beginPath(); g.moveTo(x - 5, mid); g.quadraticCurveTo(x + 2, mid + side * len * 0.5, tx, ty); g.quadraticCurveTo(x + 9, mid + side * len * 0.35, x + 6, mid); g.fill();
      }
    }
    g.strokeStyle = '#5c5a2c'; g.lineWidth = 5; g.beginPath(); g.moveTo(0, mid); g.lineTo(w - 18, mid); g.stroke();
  });
  return (_tex = { spray, frond });
}

let _mats = null;
function materials() {
  if (_mats) return _mats;
  const t = textures();
  const leaf = (map) => {
    const m = new THREE.MeshStandardNodeMaterial({ map, alphaTest: 0.42, roughness: 0.96, metalness: 0, side: THREE.DoubleSide, vertexColors: true });
    // a slow sway, stronger toward the top of the tree
    const k = smoothstep(float(2), float(14), positionLocal.y).mul(0.22);
    const ph = time.mul(1.1).add(positionWorld.x.mul(0.07)).add(positionWorld.z.mul(0.05));
    m.positionNode = positionLocal.add(vec3(sin(ph).mul(k), 0, sin(ph.mul(0.8).add(1.7)).mul(k)));
    return m;
  };
  return (_mats = { spray: leaf(t.spray), frond: leaf(t.frond), bark: createTreeMaterial({ barkColor: 0x4a3c2c }), palmBark: createTreeMaterial({ barkColor: 0x6a5a44, barkScale: new THREE.Vector3(1.2, 6, 1.2) }) });
}

// A flat card with uv, a shading normal and a tint, appended to raw arrays.
function card(out, centre, right, up, normal, tint, uv = [0, 0, 1, 1]) {
  const base = out.pos.length / 3, c = centre;
  for (const [sx, sy, u, v] of [[-1, -1, uv[0], uv[1]], [1, -1, uv[2], uv[1]], [1, 1, uv[2], uv[3]], [-1, 1, uv[0], uv[3]]]) {
    out.pos.push(c.x + right.x * sx + up.x * sy, c.y + right.y * sx + up.y * sy, c.z + right.z * sx + up.z * sy);
    out.nor.push(normal.x, normal.y, normal.z); out.uv.push(u, v); out.col.push(tint, tint, tint);
  }
  out.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}
const arrays = () => ({ pos: [], nor: [], uv: [], col: [], idx: [] });
function toGeometry(o) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(o.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(o.nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(o.uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(o.col, 3));
  g.setIndex(o.idx);
  return g;
}
const _c = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _n = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);

// ---- broadleaf jungle tree ----
// shape: { height, spread 0..1, leaves }
export function broadleaf(seed, shape = {}) {
  const R = rng(seed * 977 + 13), H = shape.height ?? 9;
  const gen = new TreeGenerator(null).setSeed(seed).setLevels(3).setChildren([4, 4]).setTrunkLength(H).setTrunkRadius(0.36 + H * 0.022)
    .setBranchAngle([44 + (shape.spread ?? 0.5) * 22, 52]).setLengthRatio(0.66).setTrunkClear(0.42).setRadialSegments(6).setSectionLength(1.7).setUpPull(0.22).setDroop(0.04).setRootFlare(0.9);
  const mesh = gen.build(), wood = mesh.geometry; mesh.material.dispose?.();
  wood.computeBoundingBox();
  const top = wood.boundingBox.max.y, p = wood.attributes.position;
  // hang leaf sprays on the outer branches
  const centre = new THREE.Vector3(0, top * 0.72, 0), out = arrays(), picks = [];
  for (let tries = 0; tries < 4000 && picks.length < (shape.leaves ?? 34); tries++) {
    const i = Math.floor(R() * p.count), y = p.getY(i), x = p.getX(i), z = p.getZ(i);
    if (y < top * 0.5 || Math.hypot(x, z) < 0.9) continue;
    if (picks.some((q) => (q.x - x) ** 2 + (q.y - y) ** 2 + (q.z - z) ** 2 < 2.2)) continue;
    picks.push(new THREE.Vector3(x, y, z));
  }
  for (const a of picks) {
    _n.subVectors(a, centre).normalize().lerp(UP, 0.35).normalize();
    const size = 2.5 + R() * 1.5;
    _c.copy(a).addScaledVector(_n, 0.7);
    // face mostly outward, with a random twist so the cards never line up
    _u.set(R() - 0.5, R() - 0.5, R() - 0.5).cross(_n).normalize(); _r.crossVectors(_u, _n).normalize();
    const tilt = (R() - 0.5) * 1.3; _r.applyAxisAngle(_u, tilt);
    card(out, _c, _r.clone().multiplyScalar(size), _u.clone().multiplyScalar(size), _n, 0.72 + R() * 0.42);
    // a second card across the first gives the spray some depth
    _r.crossVectors(_u, _r).normalize();
    card(out, _c, _r.clone().multiplyScalar(size * 0.85), _u.clone().multiplyScalar(size * 0.85), _n, 0.62 + R() * 0.4);
  }
  return { wood, leaves: toGeometry(out), bark: 'bark', leaf: 'spray', height: top };
}

// ---- coconut palm ----
export function palm(seed, shape = {}) {
  const R = rng(seed * 331 + 5), H = shape.height ?? 11 + R() * 3, lean = shape.lean ?? 1.2 + R() * 2.6, rings = 10, seg = 8;
  const at = (t) => new THREE.Vector3(lean * t * t, H * t, 0);
  const pos = [], nor = [], idx = [];
  for (let j = 0; j <= rings; j++) {
    const t = j / rings, c = at(t), tan = at(Math.min(1, t + 0.01)).sub(at(Math.max(0, t - 0.01))).normalize();
    const bx = new THREE.Vector3(0, 0, 1), by = new THREE.Vector3().crossVectors(bx, tan).normalize();
    // swollen foot, slim neck, and a faint ring at each old leaf scar
    const rad = (0.5 - t * 0.2 + Math.max(0, 0.2 - t) * 1.1) * (1 + (j % 2) * 0.05);
    for (let i = 0; i < seg; i++) { const a = (i / seg) * Math.PI * 2, n = bx.clone().multiplyScalar(Math.cos(a)).addScaledVector(by, Math.sin(a)); pos.push(c.x + n.x * rad, c.y + n.y * rad, c.z + n.z * rad); nor.push(n.x, n.y, n.z); }
  }
  for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) { const a = j * seg + i, b = j * seg + ((i + 1) % seg), c = a + seg, d = b + seg; idx.push(a, c, b, b, c, d); }
  let wood = new THREE.BufferGeometry();
  wood.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); wood.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); wood.setIndex(idx);
  const head = at(1);
  const nuts = new THREE.SphereGeometry(0.55, 8, 6).translate(head.x, head.y - 0.25, head.z); nuts.deleteAttribute('uv');
  wood = mergeGeometries([wood, nuts]);

  // fronds: a strip bent over under its own weight, folded slightly along the rib
  const out = arrays(), count = shape.fronds ?? 19, steps = 7;
  for (let f = 0; f < count; f++) {
    const yaw = (f / count) * Math.PI * 2 + R() * 0.5, tier = f % 3, rise = [0.95, 0.45, -0.05][tier] + (R() - 0.5) * 0.25, len = 7.4 + R() * 2.2, droop = 1.0 + tier * 0.32 + R() * 0.3, half = 1.5 + R() * 0.3;
    const dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), side = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const tint = 0.75 + R() * 0.4, base = out.pos.length / 3;
    let p = head.clone(), ang = rise;
    for (let s = 0; s <= steps; s++) {
      const u = s / steps, fwd = dir.clone().multiplyScalar(Math.cos(ang)).addScaledVector(UP, Math.sin(ang)), nrm = new THREE.Vector3().crossVectors(side, fwd).normalize();
      if (nrm.y < 0) nrm.negate();
      for (const [k, v] of [[-1, 0], [0, 0.5], [1, 1]]) {
        const q = p.clone().addScaledVector(side, k * half).addScaledVector(nrm, k === 0 ? 0.22 : 0);
        out.pos.push(q.x, q.y, q.z); out.nor.push(nrm.x, nrm.y, nrm.z); out.uv.push(u, v); out.col.push(tint, tint, tint);
      }
      if (s < steps) for (let k = 0; k < 2; k++) { const a = base + s * 3 + k; out.idx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4); }
      p.addScaledVector(fwd, len / steps); ang -= (droop / steps) * (0.4 + u * 1.4);
    }
  }
  return { wood, leaves: toGeometry(out), bark: 'palmBark', leaf: 'frond', height: H };
}

// ---- undergrowth: a few crossed sprays at ground level ----
export function bush(seed) {
  const R = rng(seed * 53 + 1), out = arrays();
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI + R() * 0.4, s = 1.2 + R() * 0.7, lean = (R() - 0.5) * 0.6;
    _r.set(Math.cos(a) * s, 0, Math.sin(a) * s); _u.set(-Math.sin(a) * lean * s, s, Math.cos(a) * lean * s);
    _c.set((R() - 0.5) * 0.8, s * 0.82, (R() - 0.5) * 0.8);
    card(out, _c, _r.clone(), _u.clone(), _n.set(0, 1, 0), 0.6 + R() * 0.4);
  }
  return { leaves: toGeometry(out), leaf: 'spray', height: 2.4 };
}

// ---- distant tree: a trunk and three big crossed sprays, for far slopes ----
export function farTree(seed) {
  const R = rng(seed * 71 + 3), out = arrays(), H = 11 + R() * 3, W = 6 + R() * 1.5;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI + R() * 0.5;
    _r.set(Math.cos(a) * W, 0, Math.sin(a) * W); _u.set(0, W * 0.92, 0); _c.set(0, H, 0);
    card(out, _c, _r.clone(), _u.clone(), _n.set(Math.sin(a) * 0.4, 0.9, Math.cos(a) * 0.4).normalize(), 0.7 + R() * 0.3);
  }
  _r.set(W, 0, 0); _u.set(0, 0.25 * W, -W); _c.set(0, H + 1.5, 0);
  card(out, _c, _r.clone(), _u.clone(), _n.set(0, 1, 0), 0.85);
  const wood = new THREE.CylinderGeometry(0.3, 0.55, H, 5, 1, true).translate(0, H / 2, 0); wood.deleteAttribute('uv');
  return { wood, leaves: toGeometry(out), bark: 'bark', leaf: 'spray', height: H + W };
}

// Plant one tree model at many spots. spots: [{ x, y, z, s (scale), yaw, tint }]
export function plant(scene, model, spots, o = {}) {
  if (!spots.length) return [];
  const M = materials(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), col = new THREE.Color(), made = [];
  const parts = [];
  if (model.wood) parts.push(new THREE.InstancedMesh(model.wood, M[model.bark], spots.length));
  const leaves = new THREE.InstancedMesh(model.leaves, M[model.leaf], spots.length); parts.push(leaves);
  spots.forEach((t, i) => {
    q.setFromAxisAngle(UP, t.yaw ?? 0); p.set(t.x, t.y, t.z); s.setScalar(t.s ?? 1); m4.compose(p, q, s);
    for (const im of parts) im.setMatrixAt(i, m4);
    const k = t.tint ?? 1; leaves.setColorAt(i, col.setRGB(k, k * (0.95 + ((i * 7) % 10) * 0.012), k * 0.92));
  });
  for (const im of parts) {
    im.castShadow = !!o.shadow; im.receiveShadow = !!o.shadow; im.frustumCulled = false; im.instanceMatrix.needsUpdate = true;
    scene.add(im); made.push(im);
  }
  return made;
}
