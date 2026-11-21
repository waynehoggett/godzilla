import * as THREE from 'three/webgpu';
import { uv, vec3, float, smoothstep, mix, mx_noise_float, instancedDynamicBufferAttribute } from 'three/tsl';

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

// ---- soft particles ----
// Camera-facing sprites with a noisy, feathered edge, drawn in one call per pool. The "fire" pool
// adds light (fireballs, sparks, muzzle flashes, tracers) and is bright enough to bloom; the
// "smoke" pool blends (smoke, dust, spray). Simulation is on the CPU; a few hundred are alive at most.
class Pool {
  constructor(scene, cap, additive) {
    this.cap = cap; this.cursor = 0; this.live = 0; this.additive = additive;
    this.p = [];
    for (let i = 0; i < cap; i++) this.p.push({ alive: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, max: 1, size: 1, grow: 0, grav: 0, drag: 0, c0: new THREE.Color(), c1: new THREE.Color(), a: 1, fadeIn: 0, fadeOut: 0.5, rot: 0, spin: 0, stretch: 0, seed: 0 });
    const attr = (n) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * n), n); a.setUsage(THREE.DynamicDrawUsage); return a; };
    this.aPos = attr(3); this.aShape = attr(4); this.aCol = attr(4); this.aMisc = attr(2); // shape: width, height, rotation, seed; misc: age 0..1, -
    const pos = instancedDynamicBufferAttribute(this.aPos, 'vec3'), shape = instancedDynamicBufferAttribute(this.aShape, 'vec4'), col = instancedDynamicBufferAttribute(this.aCol, 'vec4'), misc = instancedDynamicBufferAttribute(this.aMisc, 'vec2');
    const m = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: !additive });
    m.positionNode = pos; m.scaleNode = shape.xy; m.rotationNode = shape.z;
    const c = uv().sub(0.5).mul(2), d = c.length(), seed = shape.w, age = misc.x;
    // the edge billows: noise that drifts as the particle ages eats into the disc
    const n = mx_noise_float(vec3(c.mul(1.7).add(seed.mul(19)), age.mul(1.6).add(seed.mul(7))));
    const body = smoothstep(float(1), float(0.3), d.add(n.mul(additive ? 0.3 : 0.42))).mul(smoothstep(float(1), float(0.82), d)); // always clear at the quad's edge
    if (additive) {
      m.colorNode = col.rgb.mul(mix(float(1), float(1.7), smoothstep(float(0.7), float(0), d))); // hotter in the middle
      m.opacityNode = body.mul(body).mul(col.a);
    } else {
      const fine = mx_noise_float(vec3(c.mul(4.2).add(seed.mul(31)), age.mul(2.2)));
      m.colorNode = col.rgb.mul(c.y.mul(0.16).add(0.9).add(fine.mul(0.14))); // lighter on top, mottled
      m.opacityNode = body.mul(col.a).mul(fine.mul(0.2).add(0.85));
    }
    this.mesh = new THREE.Sprite(m); this.mesh.count = cap; this.mesh.frustumCulled = false; this.mesh.renderOrder = additive ? 5 : 4;
    this.aShape.array.fill(0); scene.add(this.mesh);
  }
  emit(o) {
    const p = this.p[this.cursor]; this.cursor = (this.cursor + 1) % this.cap;
    p.alive = true; p.pos.copy(o.pos); if (o.vel) p.vel.copy(o.vel); else p.vel.set(0, 0, 0);
    p.life = 0; p.max = o.life ?? 1; p.size = o.size ?? 1; p.grow = o.grow ?? 0; p.grav = o.grav ?? 0; p.drag = o.drag ?? 0;
    p.c0.set(o.c0 ?? 0xffffff); p.c1.set(o.c1 ?? o.c0 ?? 0xffffff); if (o.hdr) { p.c0.multiplyScalar(o.hdr); p.c1.multiplyScalar(o.hdr1 ?? Math.max(1, o.hdr * 0.3)); }
    p.a = o.a ?? 1; p.fadeIn = o.fadeIn ?? 0; p.fadeOut = o.fadeOut ?? 0.5; p.rot = o.rot ?? Math.random() * 6.283; p.spin = o.spin ?? (Math.random() - 0.5) * 1.2; p.stretch = o.stretch ?? 0; p.seed = Math.random();
    return p;
  }
  update(dt, cam) {
    const P = this.aPos.array, S = this.aShape.array, C = this.aCol.array, M = this.aMisc.array;
    let live = 0;
    for (let i = 0; i < this.cap; i++) {
      const p = this.p[i];
      if (!p.alive) continue;
      p.life += dt;
      if (p.life >= p.max) { p.alive = false; S[i * 4] = S[i * 4 + 1] = 0; C[i * 4 + 3] = 0; continue; }
      live++;
      const k = p.life / p.max;
      p.vel.y -= p.grav * dt;
      if (p.drag) p.vel.multiplyScalar(Math.exp(-p.drag * dt));
      p.pos.addScaledVector(p.vel, dt); p.rot += p.spin * dt;
      const sz = p.size * (1 + p.grow * k);
      let w = sz, h = sz, rot = p.rot;
      if (p.stretch && cam) { // lie along the direction of travel as the camera sees it
        const speed = p.vel.length();
        _d.copy(p.vel).transformDirection(cam.matrixWorldInverse); // unit direction in view space
        rot = Math.atan2(_d.y, _d.x); w = sz * (1 + p.stretch * speed * Math.hypot(_d.x, _d.y)); h = sz * 0.55;
      }
      const fade = (p.fadeIn > 0 ? Math.min(1, k / p.fadeIn) : 1) * (k > 1 - p.fadeOut ? (1 - k) / p.fadeOut : 1);
      P[i * 3] = p.pos.x; P[i * 3 + 1] = p.pos.y; P[i * 3 + 2] = p.pos.z;
      S[i * 4] = w; S[i * 4 + 1] = h; S[i * 4 + 2] = rot; S[i * 4 + 3] = p.seed;
      C[i * 4] = p.c0.r + (p.c1.r - p.c0.r) * k; C[i * 4 + 1] = p.c0.g + (p.c1.g - p.c0.g) * k; C[i * 4 + 2] = p.c0.b + (p.c1.b - p.c0.b) * k; C[i * 4 + 3] = p.a * fade;
      M[i * 2] = k;
    }
    if (live || this.live) { this.aPos.needsUpdate = this.aShape.needsUpdate = this.aCol.needsUpdate = this.aMisc.needsUpdate = true; }
    this.live = live;
  }
}

const rnd = (a, b) => a + Math.random() * (b - a);

export class FX {
  constructor(scene) {
    this.scene = scene; this.shakeAmt = 0; this.items = []; this.hdr = 1;
    this.smoke = new Pool(scene, 700, false); this.fire = new Pool(scene, 1100, true);
    // One reusable light for flashes (adding lights at runtime forces shader recompiles).
    this.light = new THREE.PointLight(0xffaa55, 0, 0, 1.2);
    scene.add(this.light);
    this.ringGeo = new THREE.RingGeometry(0.9, 1, 40).rotateX(-Math.PI / 2);
    this.waveGeo = new THREE.RingGeometry(0.8, 1, 48, 1).rotateX(-Math.PI / 2);
    this.discGeo = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);
  }

  // General-purpose particle (kept for scene code): bright warm or HDR colours glow, the rest are smoke-like.
  spawn(pos, vel, life, size, c0, c1, grav = 0, grow = 0, drag = 0, o = {}) {
    _c.set(c0);
    const glow = o.kind ? o.kind === 'fire' : this.hdr > 1 || (_c.r > 0.8 && _c.b < _c.r * 0.78);
    return (glow ? this.fire : this.smoke).emit({ pos, vel, life, size: size * 2.3, c0, c1, grav, grow, drag, hdr: glow ? (this.hdr > 1 ? this.hdr * 0.85 : 1.7) : 0, hdr1: glow ? 0.6 : 0, a: glow ? 1 : 0.85, fadeIn: glow ? 0 : 0.08, fadeOut: glow ? 0.6 : 0.5, stretch: o.stretch ?? 0 });
  }
  burst(pos, n, speed, life, size, c0, c1, o = {}) {
    for (let i = 0; i < n; i++) {
      _d.set(Math.random() * 2 - 1, Math.random() * 2 - 1 + (o.up || 0), Math.random() * 2 - 1).normalize().multiplyScalar(speed * (0.35 + Math.random() * 0.65));
      _s.copy(pos); if (o.spread) _s.x += (Math.random() - 0.5) * o.spread, _s.y += (Math.random() - 0.5) * o.spread * 0.5, _s.z += (Math.random() - 0.5) * o.spread;
      this.spawn(_s, _d, life * (0.6 + Math.random() * 0.6), size * (0.5 + Math.random()), c0, c1, o.grav || 0, o.grow || 0, o.drag || 0, { kind: o.kind, stretch: o.stretch ?? (o.grav && size < 2.2 ? 2.5 / Math.max(6, speed) : 0) });
    }
  }
  // Flash, fireball that cools from white-yellow to deep red, rising smoke, embers, ground shockwave.
  explosion(pos, s = 1) {
    const F = this.fire, K = this.smoke;
    F.emit({ pos, life: 0.14, size: 6.5 * s, grow: 0.7, c0: 0xfff6d8, c1: 0xffb050, hdr: 3.2, hdr1: 1.2, fadeOut: 0.8, spin: 0 });
    for (let i = 0; i < 13; i++) { // fireball
      _d.set(Math.random() * 2 - 1, Math.random() * 1.6 - 0.45, Math.random() * 2 - 1).normalize();
      const size = rnd(2.4, 4.0) * s;
      _s.copy(pos).addScaledVector(_d, rnd(0.2, 1.3) * s); _s.y = Math.max(_s.y, pos.y + size * 0.42 - s); // sit on the ground, not half buried in it
      F.emit({ pos: _s, vel: _d.multiplyScalar(rnd(4, 11) * s).setY(Math.max(_d.y, 0)), life: rnd(0.55, 1.0), size, grow: 1.1, drag: 3.2, grav: -3 * s, c0: 0xffdc8a, c1: 0xb81c06, hdr: 2.1, hdr1: 0.8, a: 0.62, fadeIn: 0.06, fadeOut: 0.55 });
    }
    for (let i = 0; i < 5; i++) { _d.set(rnd(-1, 1) * s, rnd(5, 10) * s, rnd(-1, 1) * s); F.emit({ pos, vel: _d, life: rnd(0.9, 1.3), size: rnd(2.2, 3.4) * s, grow: 0.9, drag: 1.6, c0: 0xffb650, c1: 0x8a1404, hdr: 1.9, hdr1: 0.5, a: 0.6, fadeIn: 0.1, fadeOut: 0.6 }); } // flame licking upward
    for (let i = 0; i < 13; i++) { // smoke column
      _d.set(rnd(-1, 1), rnd(0.1, 1.5), rnd(-1, 1)).normalize();
      const size = rnd(3, 4.8) * s;
      _s.copy(pos).addScaledVector(_d, rnd(0.3, 1.8) * s); _s.y = Math.max(_s.y, pos.y + size * 0.42 - s);
      K.emit({ pos: _s, vel: _d.multiplyScalar(rnd(1.5, 4.5) * s).setY(_d.y + rnd(1, 3) * s), life: rnd(2.4, 4.2), size, grow: 1.5, drag: 1.1, grav: -0.8 * s, c0: 0x1d1a17, c1: 0x57524c, a: 0.8, fadeIn: 0.22, fadeOut: 0.55 });
    }
    for (let i = 0; i < 16; i++) { // embers
      _d.set(Math.random() * 2 - 1, Math.random() * 1.5 - 0.2, Math.random() * 2 - 1).normalize().multiplyScalar(rnd(14, 36) * s);
      F.emit({ pos, vel: _d, life: rnd(0.8, 1.7), size: rnd(0.22, 0.4) * s, grav: 24 * s, drag: 0.5, c0: 0xffd070, c1: 0xff3a08, hdr: 3.5, hdr1: 1.5, fadeOut: 0.35, stretch: 0.09 / s, spin: 0 });
    }
    this.wave(pos, 10 * s, 0.45, 0xffc890, 0.3);
    this.glare(pos, s);
    this.shake(Math.min(2.5, 0.5 * s));
  }
  // An expanding ring lying on the ground or water.
  wave(pos, radius, dur, color = 0xffffff, opacity = 0.5) {
    const m = new THREE.Mesh(this.waveGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }));
    m.position.copy(pos); m.position.y += 0.3; this.scene.add(m);
    this.items.push({ m, t: 0, dur, tick: (it, k) => { m.scale.setScalar(Math.max(0.01, radius * (1 - (1 - k) ** 2.2))); m.material.opacity = opacity * (1 - k) ** 1.5; } });
  }
  glare(pos, s = 1, color = 0xffaa55) { this.light.position.copy(pos); this.light.color.set(color); this.light.intensity = Math.max(this.light.intensity, 420 * s * s); }
  flash(pos, s = 1, color = 0xffaa55) {
    this.glare(pos, s, color);
    this.fire.emit({ pos, life: 0.3, size: 5 * s, grow: 3.5, c0: color, c1: color, hdr: 4, hdr1: 1, fadeOut: 0.9, spin: 0 });
  }
  // Gun muzzle: a hot core and a tongue of flame along the barrel.
  muzzle(pos, dir, s = 1) {
    this.fire.emit({ pos, life: 0.06, size: 1.5 * s, c0: 0xfff2c0, c1: 0xffa040, hdr: 6, hdr1: 2, fadeOut: 0.9, spin: 0 });
    _d.copy(dir).multiplyScalar(26 * s);
    this.fire.emit({ pos, vel: _d, life: 0.07, size: 0.75 * s, c0: 0xffd890, c1: 0xff7020, hdr: 5, hdr1: 1.5, fadeOut: 0.9, stretch: 0.12, spin: 0 });
    this.glare(pos, 0.16 * s, 0xffc070);
  }
  // A streak of tracer fire.
  tracer(pos, vel, life = 0.3, color = 0xffe890, size = 0.42) {
    this.fire.emit({ pos, vel, life, size, c0: color, c1: 0xff8020, hdr: 6, hdr1: 3, fadeOut: 0.2, stretch: 0.045, spin: 0 });
  }
  // Water thrown up: a white column, hanging mist, droplets and a ring spreading on the surface.
  splash(pos, s = 1) {
    const K = this.smoke;
    for (let i = 0; i < 9; i++) { _d.set(rnd(-3, 3) * s, rnd(9, 20) * s, rnd(-3, 3) * s); _s.copy(pos); _s.x += rnd(-1, 1) * s; _s.z += rnd(-1, 1) * s; K.emit({ pos: _s, vel: _d, life: rnd(0.9, 1.5), size: rnd(1.6, 2.6) * s, grow: 1.0, grav: 24 * s, drag: 0.4, c0: 0xf6fbff, c1: 0xbdd6e2, a: 0.9, fadeIn: 0.05, fadeOut: 0.45 }); }
    for (let i = 0; i < 5; i++) { const size = rnd(2.6, 4) * s; _d.set(rnd(-4, 4) * s, rnd(1, 4) * s, rnd(-4, 4) * s); _s.copy(pos); _s.y += size * 0.4; K.emit({ pos: _s, vel: _d, life: rnd(1.4, 2.2), size, grow: 1.4, drag: 1.6, c0: 0xe4eef4, c1: 0xb4c8d2, a: 0.45, fadeIn: 0.15, fadeOut: 0.7 }); }
    for (let i = 0; i < 10; i++) { _d.set(rnd(-9, 9) * s, rnd(8, 22) * s, rnd(-9, 9) * s); K.emit({ pos, vel: _d, life: rnd(0.8, 1.4), size: rnd(0.35, 0.6) * s, grav: 30 * s, c0: 0xffffff, c1: 0xd6e6ee, a: 0.9, fadeOut: 0.3, stretch: 0.08 / s, spin: 0 }); }
    if (s >= 0.6) this.wave(pos, 6 * s, 0.9, 0xcfe4ee, 0.3);
  }
  // Earth and masonry thrown up: chunks that fall back, and a dust cloud that hangs.
  debris(pos, n = 14, s = 1, color = 0x6a6258) {
    const K = this.smoke;
    for (let i = 0; i < n; i++) { _d.set(rnd(-1, 1), rnd(0.3, 1.9), rnd(-1, 1)).normalize().multiplyScalar(rnd(7, 19) * s); _s.copy(pos); _s.x += rnd(-2, 2) * s; _s.z += rnd(-2, 2) * s; K.emit({ pos: _s, vel: _d, life: rnd(1.1, 2.0), size: rnd(0.5, 1.0) * s, grav: 38, c0: color, c1: 0x2a2622, a: 1, fadeOut: 0.25, stretch: 0.03, spin: 0 }); }
    const puffs = Math.ceil(n * 0.6);
    for (let i = 0; i < puffs; i++) { _d.set(rnd(-5, 5) * s, rnd(1, 5) * s, rnd(-5, 5) * s); const size = rnd(3.5, 6) * s; _s.copy(pos); _s.x += rnd(-2.5, 2.5) * s; _s.z += rnd(-2.5, 2.5) * s; _s.y += size * 0.42; K.emit({ pos: _s, vel: _d, life: rnd(1.8, 3.0), size, grow: 1.3, drag: 1.4, c0: 0x8a8478, c1: 0x4a4640, a: 0.62, fadeIn: 0.12, fadeOut: 0.65 }); }
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

  update(dt, cam) {
    this.shakeAmt *= Math.exp(-3.5 * dt);
    this.light.intensity *= Math.exp(-9 * dt);
    this.smoke.update(dt, cam); this.fire.update(dt, cam);
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i]; it.t += dt;
      if (it.t >= it.dur) { this.scene.remove(it.m); this.items.splice(i, 1); continue; }
      it.tick(it, it.t / it.dur);
    }
  }
}
