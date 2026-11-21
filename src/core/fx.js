import * as THREE from 'three/webgpu';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _c = new THREE.Color();
const _up = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3();

// A heat-ray style beam between two points.
export class Beam {
  constructor(scene, color = 0x4db8ff, core = 0xeaf6ff) {
    this.g = new THREE.Group();
    const geo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
    const hot = (c, k) => new THREE.Color(c).multiplyScalar(k);
    this.outer = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: hot(color, 2.2), transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    this.inner = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: hot(core, 5), fog: false }));
    this.inner.scale.set(0.4, 1, 0.4);
    this.tip = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: hot(core, 4), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.g.add(this.outer, this.inner);
    this.g.visible = this.tip.visible = false;
    this.g.frustumCulled = false;
    scene.add(this.g, this.tip);
  }
  set(from, to, w = 2) {
    _d.subVectors(to, from);
    const len = _d.length();
    this.g.position.copy(from).addScaledVector(_d, 0.5);
    this.g.quaternion.setFromUnitVectors(_up, _d.normalize());
    const j = 1 + Math.random() * 0.25;
    this.g.scale.set(w * j, len, w * j);
    this.tip.position.copy(to); this.tip.scale.setScalar(w * 2.4 * j);
    this.g.visible = this.tip.visible = true;
  }
  off() { this.g.visible = this.tip.visible = false; }
}

export class FX {
  constructor(scene, cap = 900) {
    this.scene = scene; this.cap = cap; this.shakeAmt = 0; this.items = []; this.cursor = 0; this.hdr = 1;
    this.mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), cap);
    this.mesh.frustumCulled = false;
    this.p = [];
    _m.makeScale(0, 0, 0);
    for (let i = 0; i < cap; i++) {
      this.p.push({ alive: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, max: 1, size: 1, grow: 0, grav: 0, drag: 0, c0: new THREE.Color(), c1: new THREE.Color() });
      this.mesh.setMatrixAt(i, _m); this.mesh.setColorAt(i, _c.set(0));
    }
    scene.add(this.mesh);
    // One reusable light for flashes (adding lights at runtime forces shader recompiles).
    this.light = new THREE.PointLight(0xffaa55, 0, 0, 1.2);
    scene.add(this.light);
    this.ringGeo = new THREE.RingGeometry(0.9, 1, 40).rotateX(-Math.PI / 2);
    this.discGeo = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);
    this.sphereGeo = new THREE.IcosahedronGeometry(1, 2);
  }

  spawn(pos, vel, life, size, c0, c1, grav = 0, grow = 0, drag = 0) {
    const p = this.p[this.cursor]; this.cursor = (this.cursor + 1) % this.cap;
    p.alive = true; p.pos.copy(pos); p.vel.copy(vel); p.life = 0; p.max = life; p.size = size; p.grav = grav; p.grow = grow; p.drag = drag;
    p.c0.set(c0); p.c1.set(c1 ?? c0);
    if (this.hdr !== 1) p.c0.multiplyScalar(this.hdr);
    return p;
  }
  burst(pos, n, speed, life, size, c0, c1, o = {}) {
    for (let i = 0; i < n; i++) {
      _d.set(Math.random() * 2 - 1, Math.random() * 2 - 1 + (o.up || 0), Math.random() * 2 - 1).normalize().multiplyScalar(speed * (0.35 + Math.random() * 0.65));
      _s.copy(pos); if (o.spread) _s.x += (Math.random() - 0.5) * o.spread, _s.y += (Math.random() - 0.5) * o.spread * 0.5, _s.z += (Math.random() - 0.5) * o.spread;
      this.spawn(_s, _d, life * (0.6 + Math.random() * 0.6), size * (0.5 + Math.random()), c0, c1, o.grav || 0, o.grow || 0, o.drag || 0);
    }
  }
  explosion(pos, s = 1) {
    this.hdr = 4;
    this.burst(pos, 26, 22 * s, 0.9, 1.5 * s, 0xfff2a0, 0xd4380d, { up: 0.5, grow: 1.6, drag: 1.5, spread: 2 * s });
    this.hdr = 1;
    this.burst(pos, 16, 12 * s, 2.2, 2.2 * s, 0x4a4038, 0x15130f, { up: 0.9, grow: 1.2, drag: 0.8, spread: 3 * s });
    this.burst(pos, 12, 34 * s, 1.4, 0.5 * s, 0xffc060, 0x402010, { up: 0.8, grav: 30 });
    this.flash(pos, s);
    this.shake(Math.min(2.5, 0.5 * s));
  }
  flash(pos, s = 1, color = 0xffaa55) {
    this.light.position.copy(pos); this.light.color.set(color); this.light.intensity = 900 * s * s;
    const m = new THREE.Mesh(this.sphereGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(3), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    m.position.copy(pos); this.scene.add(m);
    this.items.push({ m, t: 0, dur: 0.35, tick: (it, k) => { m.scale.setScalar(s * (2 + k * 9)); m.material.opacity = 0.9 * (1 - k); } });
  }
  splash(pos, s = 1) {
    this.burst(pos, 22, 16 * s, 1.3, 0.9 * s, 0xf4fbff, 0x9fc4d8, { up: 1.6, grav: 26 * s, spread: 2 * s });
  }
  debris(pos, n = 14, s = 1, color = 0x6a6258) {
    this.burst(pos, n, 18 * s, 1.8, 1.1 * s, color, 0x2a2622, { up: 0.9, grav: 40, spread: 4 * s });
    this.burst(pos, Math.ceil(n / 2), 7 * s, 2.4, 3 * s, 0x8a8478, 0x3a3630, { up: 0.5, grow: 1, drag: 1, spread: 5 * s });
  }
  // Ground telegraph: ring + disc that fills as the impact approaches.
  warn(pos, radius, dur, color = 0xff3b1f, fill = true) {
    // drawn over the ground and water (no depth test) so waves and rubble never cut it up
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, depthWrite: false, depthTest: false, fog: false });
    const ring = new THREE.Mesh(this.ringGeo, mat), disc = new THREE.Mesh(this.discGeo, mat.clone());
    disc.material.opacity = 0.16; disc.visible = fill; ring.renderOrder = disc.renderOrder = 6;
    const g = new THREE.Group(); g.add(ring, disc);
    g.position.copy(pos); g.position.y += 0.25; ring.scale.setScalar(radius);
    this.scene.add(g);
    this.items.push({ m: g, t: 0, dur, tick: (it, k) => { disc.scale.setScalar(Math.max(0.01, radius * k)); } });
    return g;
  }
  shake(a) { this.shakeAmt = Math.max(this.shakeAmt, a); }
  applyShake(cam) {
    if (this.shakeAmt < 0.01) return;
    cam.position.x += (Math.random() - 0.5) * this.shakeAmt; cam.position.y += (Math.random() - 0.5) * this.shakeAmt; cam.position.z += (Math.random() - 0.5) * this.shakeAmt;
  }

  update(dt) {
    this.shakeAmt *= Math.exp(-3.5 * dt);
    this.light.intensity *= Math.exp(-9 * dt);
    let dirty = false;
    for (let i = 0; i < this.cap; i++) {
      const p = this.p[i];
      if (!p.alive) continue;
      dirty = true;
      p.life += dt;
      if (p.life >= p.max) { p.alive = false; _m.makeScale(0, 0, 0); this.mesh.setMatrixAt(i, _m); continue; }
      const k = p.life / p.max;
      p.vel.y -= p.grav * dt;
      if (p.drag) p.vel.multiplyScalar(Math.exp(-p.drag * dt));
      p.pos.addScaledVector(p.vel, dt);
      const sz = p.size * (1 + p.grow * k) * (k > 0.75 ? (1 - k) * 4 : 1);
      _s.setScalar(sz); _q.set(k, i * 0.37, 0.3, 1).normalize();
      _m.compose(p.pos, _q, _s); this.mesh.setMatrixAt(i, _m);
      this.mesh.setColorAt(i, _c.copy(p.c0).lerp(p.c1, k));
    }
    if (dirty) { this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true; }
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i]; it.t += dt;
      if (it.t >= it.dur) { this.scene.remove(it.m); this.items.splice(i, 1); continue; }
      it.tick(it, it.t / it.dur);
    }
  }
}
