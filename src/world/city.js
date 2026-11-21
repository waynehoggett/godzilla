import * as THREE from 'three';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
const TINTS = [0xb8a98e, 0x9c8f7c, 0xc9bda6, 0x8a7a68, 0xa39a8e, 0x7d766c, 0xb59b7a, 0x6f6a64];

function windowTextures(night) {
  const mk = (fn) => { const c = document.createElement('canvas'); c.width = c.height = 128; fn(c.getContext('2d')); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
  const cells = [];
  for (let y = 0; y < 6; y++) for (let x = 0; x < 4; x++) cells.push([x, y, Math.random()]);
  const map = mk((g) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = 'rgba(0,0,0,.12)'; for (let y = 0; y < 6; y++) g.fillRect(0, y * 21.3, 128, 2);
    for (const [x, y] of cells) { g.fillStyle = night ? '#1b1d22' : '#3b4650'; g.fillRect(8 + x * 30, 5 + y * 21.3, 18, 12); }
  });
  const emis = mk((g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, 128, 128);
    if (!night) return;
    for (const [x, y, r] of cells) if (r > 0.62) { g.fillStyle = r > 0.9 ? '#ffe9b0' : '#d9a550'; g.fillRect(8 + x * 30, 5 + y * 21.3, 18, 12); }
  });
  return { map, emis };
}

// Rectangular lots on a street grid. skip(x, z) lets a scene carve out avenues or plazas.
export function gridLots(o) {
  const lots = [];
  const { nx, nz, lot = 26, street = 16, hMin = 10, hMax = 34, ox = 0, oz = 0, skip } = o;
  const pitch = lot + street;
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const x = ox + (i - (nx - 1) / 2) * pitch, z = oz + (j - (nz - 1) / 2) * pitch;
    if (skip && skip(x, z)) continue;
    const w = lot * (0.7 + Math.random() * 0.3), d = lot * (0.7 + Math.random() * 0.3);
    lots.push({ x, z, w, d, h: hMin + Math.pow(Math.random(), 1.6) * (hMax - hMin) });
  }
  return lots;
}

export class City {
  constructor(scene, lots, night = false) {
    this.b = lots.map((l, i) => ({ ...l, i, alive: true, k: 1, tint: TINTS[(Math.random() * TINTS.length) | 0] }));
    const { map, emis } = windowTextures(night);
    const side = new THREE.MeshStandardMaterial({ map, emissiveMap: emis, emissive: 0xffffff, emissiveIntensity: night ? 1.1 : 0, roughness: 0.95 });
    const roof = new THREE.MeshStandardMaterial({ color: 0x8a847a, roughness: 1 });
    const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    this.mesh = new THREE.InstancedMesh(geo, [side, side, roof, roof, side, side], this.b.length);
    this.mesh.frustumCulled = false;
    this.falling = [];
    for (const b of this.b) { this.place(b); this.mesh.setColorAt(b.i, _c.set(b.tint)); }
    scene.add(this.mesh);
  }
  place(b) {
    _p.set(b.x, 0, b.z); _s.set(b.w, Math.max(0.5, b.h * b.k), b.d); _q.identity();
    if (!b.alive) _q.setFromEuler(new THREE.Euler((1 - b.k) * b.tx, 0, (1 - b.k) * b.tz));
    _m.compose(_p, _q, _s); this.mesh.setMatrixAt(b.i, _m); this.mesh.instanceMatrix.needsUpdate = true;
  }
  destroy(b, fx, audio) {
    if (!b.alive) return;
    b.alive = false; b.tx = (Math.random() - 0.5) * 0.25; b.tz = (Math.random() - 0.5) * 0.25;
    this.falling.push(b);
    this.mesh.setColorAt(b.i, _c.set(b.tint).multiplyScalar(0.45)); this.mesh.instanceColor.needsUpdate = true;
    if (fx) { _p.set(b.x, b.h * 0.4, b.z); fx.debris(_p, 18, Math.max(1, b.h / 14), b.tint); fx.shake(0.6); }
    if (audio) audio.boom(0.5);
  }
  // Buildings (alive) whose footprint touches a circle.
  touching(x, z, r) {
    const out = [];
    for (const b of this.b) if (b.alive && Math.abs(b.x - x) < b.w / 2 + r && Math.abs(b.z - z) < b.d / 2 + r) out.push(b);
    return out;
  }
  smash(x, z, r, fx, audio) { let n = 0; for (const b of this.touching(x, z, r)) { this.destroy(b, fx, audio); n++; } return n; }
  // Push a point out of standing buildings (for people on foot).
  collide(pos, r) {
    for (const b of this.b) {
      if (!b.alive) continue;
      const dx = pos.x - b.x, dz = pos.z - b.z, hx = b.w / 2 + r, hz = b.d / 2 + r;
      if (Math.abs(dx) < hx && Math.abs(dz) < hz) {
        if (hx - Math.abs(dx) < hz - Math.abs(dz)) pos.x = b.x + Math.sign(dx || 1) * hx; else pos.z = b.z + Math.sign(dz || 1) * hz;
      }
    }
  }
  update(dt) {
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const b = this.falling[i];
      b.k = Math.max(0.12, b.k - dt * 1.6); this.place(b);
      if (b.k <= 0.12) this.falling.splice(i, 1);
    }
  }
}
