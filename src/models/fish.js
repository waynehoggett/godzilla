import * as THREE from 'three/webgpu';
import { LoftGeometry } from 'three/addons/geometries/LoftGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Deep-sea fish for the end of chapter 2: a lofted body with fins, big eyes and a pale belly.
// Each species is one merged, vertex-coloured geometry so a whole shoal draws in a few calls.

const V = THREE.Vector3;
function ring(z, hw, hh, cy = 0, n = 14) {
  const pts = [];
  for (let j = 0; j < n; j++) { const a = (j / n) * Math.PI * 2; pts.push(new V(Math.cos(a) * hw, cy + Math.sin(a) * hh * (Math.sin(a) < 0 ? 1.12 : 1), z)); }
  return pts;
}
// A flat fin from outline points [z, y] in the body's centre plane, optionally swung out to one side.
function fin(pts, o = {}) {
  const s = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ShapeGeometry(s).rotateY(-Math.PI / 2); // shape x -> body z
  if (o.swing) { g.translate(0, -o.pivot[1], -o.pivot[0]).rotateZ(o.swing).rotateY(o.sweep || 0).translate(o.side * (o.out || 0), o.pivot[1], o.pivot[0]); }
  return g;
}
function tint(g, fn) {
  if (!g.attributes.normal) g.computeVertexNormals();
  if (g.index) g = g.toNonIndexed(); // keeps the smooth normals
  g.deleteAttribute('uv');
  const p = g.attributes.position, n = g.attributes.normal, col = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) { fn(c, p.getX(i), p.getY(i), p.getZ(i), n.getY(i)); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// Species: body stations are [z, half-width, half-height, centre-y] from snout (z = +) to tail (z = -).
const SPECIES = {
  // splendid alfonsino (kinmedai): deep red body, huge eye, forked tail
  alfonsino: {
    back: 0xa3261c, side: 0xd2523c, belly: 0xf1d6c6, finCol: 0x8c1d16, eye: 0.11,
    body: [[1.0, 0.02, 0.03, 0], [0.9, 0.09, 0.14, 0], [0.7, 0.15, 0.27, 0.01], [0.35, 0.19, 0.36, 0.02], [0, 0.18, 0.37, 0.02], [-0.4, 0.13, 0.27, 0.02], [-0.72, 0.06, 0.12, 0.02], [-0.9, 0.035, 0.08, 0.02]],
    tail: [[-0.86, 0.07], [-1.32, 0.36], [-1.14, 0.02], [-1.32, -0.32], [-0.86, -0.05]],
    dorsal: [[0.3, 0.34], [0.12, 0.6], [-0.2, 0.46], [-0.45, 0.28]], anal: [[-0.1, -0.33], [-0.3, -0.52], [-0.55, -0.22]], eyeAt: [0.72, 0.08],
  },
  // grenadier (rat-tail): heavy grey head tapering to a whip of a tail
  grenadier: {
    back: 0x3d3a3c, side: 0x6b6567, belly: 0xc4bdb6, finCol: 0x2c2a2c, eye: 0.1,
    body: [[1.0, 0.03, 0.04, -0.02], [0.88, 0.12, 0.15, 0], [0.66, 0.19, 0.26, 0.01], [0.4, 0.2, 0.28, 0.01], [0.05, 0.15, 0.22, 0], [-0.4, 0.08, 0.13, 0], [-0.9, 0.035, 0.06, 0], [-1.5, 0.008, 0.015, 0]],
    tail: null,
    dorsal: [[0.42, 0.27], [0.34, 0.56], [0.14, 0.24]], long: [[0.05, 0.21], [-0.5, 0.2], [-1.45, 0.03], [-1.5, 0], [-0.5, 0.1]], anal: [[0.0, -0.21], [-0.5, -0.2], [-1.45, -0.03], [-0.5, -0.1]], eyeAt: [0.7, 0.09],
  },
  // lanternfish: small, blunt and silver-black
  lantern: {
    back: 0x1f2630, side: 0x8d98a2, belly: 0xdfe5e8, finCol: 0x39424c, eye: 0.085,
    body: [[1.0, 0.04, 0.06, 0], [0.9, 0.11, 0.16, 0], [0.62, 0.15, 0.22, 0], [0.2, 0.15, 0.23, 0], [-0.3, 0.1, 0.16, 0], [-0.7, 0.045, 0.08, 0], [-0.88, 0.03, 0.06, 0]],
    tail: [[-0.84, 0.05], [-1.2, 0.26], [-1.06, 0], [-1.2, -0.26], [-0.84, -0.05]],
    dorsal: [[0.15, 0.22], [0.0, 0.4], [-0.25, 0.2]], anal: [[-0.15, -0.2], [-0.32, -0.36], [-0.5, -0.15]], eyeAt: [0.72, 0.05],
  },
};

const cache = {};
export function fishGeometry(kind) {
  if (cache[kind]) return cache[kind];
  const S = SPECIES[kind], back = new THREE.Color(S.back), side = new THREE.Color(S.side), belly = new THREE.Color(S.belly), finC = new THREE.Color(S.finCol);
  const parts = [];
  const body = new LoftGeometry(S.body.map((s) => ring(s[0], s[1], s[2], s[3])), { capStart: true, capEnd: true });
  parts.push(tint(body, (c, x, y, z, ny) => { // dark back, lighter flank, pale belly, darker toward the snout
    const k = THREE.MathUtils.smoothstep(ny, -0.75, 0.1), k2 = THREE.MathUtils.smoothstep(ny, 0.2, 0.9);
    c.copy(belly).lerp(side, k).lerp(back, k2).multiplyScalar(0.9 + 0.1 * Math.sin(z * 37) * Math.sin(y * 41));
  }));
  const fins = [];
  if (S.tail) fins.push(fin(S.tail));
  fins.push(fin(S.dorsal), fin(S.anal));
  if (S.long) fins.push(fin(S.long));
  const hw = S.body[2][1], pz = S.body[2][0] - 0.12;
  for (const sd of [-1, 1]) fins.push(fin([[pz, -0.04], [pz - 0.3, 0.07], [pz - 0.34, -0.1], [pz - 0.1, -0.1]], { swing: sd * 1.0, sweep: sd * -0.25, side: sd, out: hw * 0.92, pivot: [pz, -0.06] }));
  for (const f of fins) parts.push(tint(f, (c, x, y, z) => c.copy(finC).multiplyScalar(0.75 + 0.35 * Math.abs(Math.sin(y * 60 + z * 25))))); // rays
  // eyes: pale iris, dark pupil
  const ew = THREE.MathUtils.lerp(S.body[1][1], S.body[2][1], (S.body[1][0] - S.eyeAt[0]) / (S.body[1][0] - S.body[2][0]));
  for (const sd of [-1, 1]) {
    parts.push(tint(new THREE.SphereGeometry(S.eye, 10, 8).scale(0.45, 1, 1).translate(sd * ew * 0.93, S.eyeAt[1], S.eyeAt[0]), (c) => c.set(0xd9d2b0)));
    parts.push(tint(new THREE.SphereGeometry(S.eye * 0.6, 8, 6).scale(0.45, 1, 1).translate(sd * (ew * 0.93 + S.eye * 0.22), S.eyeAt[1], S.eyeAt[0]), (c) => c.set(0x06080a)));
  }
  return (cache[kind] = mergeGeometries(parts));
}

let _mat = null;
const fishMaterial = () => (_mat ||= new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.05, clearcoat: 0.45, clearcoatRoughness: 0.3, side: THREE.DoubleSide }));

// A shoal of dead fish that rise from the deep, roll belly-up and ride the swell.
// place(i) -> [x, z]. Returns { update(dt, ocean, onSurface) }.
export function makeShoal(scene, n, place) {
  const kinds = Object.keys(SPECIES), per = Math.ceil(n / kinds.length), fish = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new V(), s = new V(), col = new THREE.Color();
  const meshes = kinds.map((k) => { const im = new THREE.InstancedMesh(fishGeometry(k), fishMaterial(), per); im.frustumCulled = false; im.castShadow = true; scene.add(im); return im; });
  for (let i = 0; i < per * kinds.length; i++) {
    const [x, z] = place(i), k = i % kinds.length, size = (k === 2 ? 0.9 : 1.4) * (0.75 + Math.random() * 0.9);
    const f = { x, z, y: -5 - Math.random() * 11, size, yaw: Math.random() * 6.283, roll: 0, rollTo: Math.PI + (Math.random() - 0.5) * 0.9, pitch: (Math.random() - 0.5) * 0.3, ph: Math.random() * 6.283, up: false, mesh: meshes[k], i: Math.floor(i / kinds.length), speed: 1.6 + Math.random() * 1.4 };
    const v = 0.82 + Math.random() * 0.3; f.mesh.setColorAt(f.i, col.setRGB(v, v, v));
    fish.push(f);
  }
  let t = 0;
  return {
    fish,
    update(dt, ocean, onSurface) {
      t += dt;
      for (const f of fish) {
        const top = ocean.height(f.x, f.z) + 0.1 * f.size;
        if (!f.up) { f.y += dt * f.speed; f.roll += (f.rollTo * 0.6 - f.roll) * Math.min(1, dt * 0.8); if (f.y >= top) { f.up = true; if (onSurface) onSurface(f); } }
        if (f.up) {
          f.y = top; f.roll += (f.rollTo + Math.sin(t * 0.9 + f.ph) * 0.16 - f.roll) * Math.min(1, dt * 2);
          f.yaw += Math.sin(t * 0.3 + f.ph) * dt * 0.08; f.x += Math.cos(f.ph) * dt * 0.15; f.z += Math.sin(f.ph) * dt * 0.15;
        }
        e.set(f.pitch + (f.up ? Math.sin(t * 1.1 + f.ph) * 0.07 : -0.5), f.yaw, f.roll, 'YXZ'); q.setFromEuler(e);
        m4.compose(p.set(f.x, f.y, f.z), q, s.setScalar(f.size)); f.mesh.setMatrixAt(f.i, m4);
      }
      for (const im of meshes) im.instanceMatrix.needsUpdate = true;
    },
  };
}
