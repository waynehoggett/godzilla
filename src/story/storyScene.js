import * as THREE from 'three/webgpu';
import { GameScene, clamp, damp, angleTo } from '../core/scene.js';

const V = THREE.Vector3;
const _a = new V(), _b = new V(), _c = new V();

// Base for story chapters: health, checkpoints, win/fail.
export class StoryScene extends GameScene {
  constructor(game, opts) {
    super(game, opts);
    this.index = opts.index; this.cp = opts.checkpoint || 0;
    this.hp = 100; this.inv = 0; this.vig = 0; this.hpName = 'Koichi'; this.phase = '';
    this.ui.hud(true);
  }
  damage(n, why) {
    if (this.over || this.inv > 0) return false;
    this.hp -= n; this.inv = 0.9; this.vig = 1;
    this.audio.hit(1); this.fx.shake(1.6);
    if (this.hp <= 0) this.fail(why);
    return true;
  }
  fail(text) {
    if (this.over) return;
    this.over = true; this.ui.prompt(null);
    this.after(1.0, () => this.game.storyFail(this.index, text, this.cp));
  }
  win(delay = 0) {
    if (this.over) return;
    this.over = true; this.ui.prompt(null);
    this.after(delay, () => this.game.chapterDone(this.index));
  }
  go(phase) { this.phase = phase; this.pt = 0; }
  tick(dt) {
    this.pt = (this.pt || 0) + dt;
    super.tick(dt);
    this.inv -= dt; this.vig = Math.max(0, this.vig - dt * 1.5);
    this.ui.vignette(Math.min(1, this.vig + (this.hp < 35 ? 0.35 : 0)));
    if (this.hpName) this.ui.bar('L', this.hpName, this.hp / 100);
  }
}

// On-foot controller with a chase camera. Hold D-button (Shift) to sprint.
export class Walker {
  constructor(scene, person, x, z) {
    this.p = person; this.pos = new V(x, 0, z); this.yaw = 0; this.stamina = 1; this.speed = 0; this.camYaw = 0;
    scene.add(person.root);
  }
  update(dt, input, enabled = true) {
    const mx = enabled ? input.move.x : 0, my = enabled ? input.move.y : 0, moving = !!(mx || my);
    const sprint = moving && input.held('d') && this.stamina > 0.04;
    this.stamina = clamp(this.stamina + (sprint ? -dt / 5.5 : dt / 3.5), 0, 1);
    const target = moving ? (sprint ? 15.5 : 9.5) * Math.min(1, Math.hypot(mx, my)) : 0;
    this.speed = damp(this.speed, target, 10, dt);
    if (moving) {
      const s = Math.sin(this.camYaw), c = Math.cos(this.camYaw);
      const vx = s * my - c * mx, vz = c * my + s * mx, l = Math.hypot(vx, vz) || 1;
      this.yaw += angleTo(this.yaw, Math.atan2(vx, vz)) * Math.min(1, dt * 12);
      this.pos.x += (vx / l) * this.speed * dt; this.pos.z += (vz / l) * this.speed * dt;
    }
    this.sync(dt);
  }
  // set .ground = (x, z) => height to walk on uneven land
  sync(dt) { if (this.ground) this.pos.y = this.ground(this.pos.x, this.pos.z); this.p.root.position.copy(this.pos); this.p.root.rotation.y = this.yaw; this.p.update(dt, this.speed); }
  cam(camera, dt, dist = 11, h = 5, snap = false) {
    const s = Math.sin(this.camYaw), c = Math.cos(this.camYaw);
    _a.set(this.pos.x - s * dist, this.pos.y + h, this.pos.z - c * dist);
    if (this.ground) _a.y = Math.max(_a.y, this.ground(_a.x, _a.z) + 1.6);
    if (snap) camera.position.copy(_a); else camera.position.lerp(_a, 1 - Math.exp(-6 * dt));
    camera.lookAt(this.pos.x + s * 5, this.pos.y + 2.2, this.pos.z + c * 5);
  }
}

// Fixed gun: the reticle moves over the view (mouse, touch or stick); A fires.
export class Turret {
  constructor(S, gun) {
    this.S = S; this.aim = { x: 0, y: 0 }; this.cool = 0; this.targets = []; this.ray = new THREE.Raycaster(); this.gun = gun; this.jitter = 0;
    S.input.tapFire = true;
    if (gun) { S.camera.add(gun); gun.position.set(0.55, -0.75, -1.9); gun.rotation.y = Math.PI; }
    S.scene.add(S.camera);
  }
  add(pos, r, onHit) { const t = { pos, r, onHit, on: true }; this.targets.push(t); return t; }
  update(dt, canFire = true) {
    const S = this.S, inp = S.input, a = this.aim;
    if (inp.aimTouch !== null || (!inp.isTouch && inp.pointerFresh(3))) { a.x = damp(a.x, inp.pointer.x, 25, dt); a.y = damp(a.y, inp.pointer.y, 25, dt); }
    else { a.x += inp.move.x * dt * 1.15; a.y += inp.move.y * dt * 1.15; }
    a.x = clamp(a.x, -0.95, 0.95); a.y = clamp(a.y, -0.9, 0.9);
    const jx = a.x + (Math.random() - 0.5) * this.jitter, jy = a.y + (Math.random() - 0.5) * this.jitter;
    this.ray.setFromCamera(_a.set(jx, jy, 0), S.camera);
    const o = this.ray.ray.origin, d = this.ray.ray.direction;
    let best = null, bestT = 1e9;
    for (const t of this.targets) {
      if (!t.on) continue;
      _b.subVectors(t.pos, o); const along = _b.dot(d);
      if (along < 0) continue;
      const off = _c.copy(o).addScaledVector(d, along).distanceTo(t.pos);
      if (off < t.r && along < bestT) { best = t; bestT = along; }
    }
    S.ui.reticle(jx, jy, !!best);
    if (this.gun) { this.gun.rotation.x = -a.y * 0.4; this.gun.rotation.y = Math.PI - a.x * 0.6; }
    this.cool -= dt; this.fired = false;
    if (canFire && inp.held('a') && this.cool <= 0) {
      this.cool = 0.1; this.fired = true;
      S.audio.gun();
      const muzzle = _b.copy(o).addScaledVector(d, 4); muzzle.y -= 0.7;
      S.fx.spawn(muzzle, _c.copy(d).multiplyScalar(420), 0.28, 0.28, 0xfff0a0, 0xffa030);
      if (this.gun) this.gun.position.z = -1.75;
      if (best) { const p = _c.copy(o).addScaledVector(d, bestT); S.fx.burst(p, 4, 14, 0.35, 0.5, 0xfff0a0, 0xff7020); best.onHit(p.clone()); }
      else if (d.y < -0.01) { const k = -o.y / d.y; if (k < 700) S.fx.splash(_c.copy(o).addScaledVector(d, k), 0.5); }
    }
    if (this.gun) this.gun.position.z = damp(this.gun.position.z, -1.9, 18, dt);
  }
  hide() { this.S.ui.reticle(null); }
}

// Arcade flight: stick steers (up = climb), D-button boosts, A fires.
export class Plane {
  constructor(S, model, x, y, z, yaw) {
    this.S = S; this.m = model; this.pos = new V(x, y, z); this.yaw = yaw; this.pitch = 0; this.roll = 0; this.speed = 82; this.cool = 0;
    this.minAlt = 10; this.maxAlt = 460; this.bound = 2600; this.centre = new V(); this.auto = null;
    model.root.rotation.order = 'YXZ';
    S.scene.add(model.root);
  }
  fwd(out = new V()) { const cp = Math.cos(this.pitch); return out.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp); }
  update(dt, input, enabled = true) {
    let mx = enabled ? input.move.x : 0, my = enabled ? input.move.y : 0, boost = enabled && input.held('d');
    if (this.auto) { const r = this.auto(dt); mx = r.x; my = r.y; boost = false; }
    // nudge back inside the play area
    const dx = this.centre.x - this.pos.x, dz = this.centre.z - this.pos.z;
    this.outside = Math.hypot(dx, dz) > this.bound;
    if (this.outside) mx = clamp(-angleTo(this.yaw, Math.atan2(dx, dz)) * 2, -1, 1);
    this.yaw -= mx * 1.25 * dt;
    this.roll = damp(this.roll, mx * 0.95, 5, dt);
    let wantPitch = my * 0.6;
    if (this.pos.y < this.minAlt + 14) wantPitch = Math.max(wantPitch, (this.minAlt + 14 - this.pos.y) * 0.05);
    if (this.pos.y > this.maxAlt - 30) wantPitch = Math.min(wantPitch, -0.15);
    this.pitch = damp(this.pitch, wantPitch, 3, dt);
    this.speed = damp(this.speed, boost ? 128 : 84, 2, dt);
    this.pos.addScaledVector(this.fwd(_a), this.speed * dt);
    if (this.pos.y < this.minAlt) { this.pos.y = this.minAlt; this.pitch = Math.max(this.pitch, 0.1); }
    this.sync(dt);
    this.S.audio.engineSet(0.9 + (this.speed - 84) / 90, enabled || this.auto ? 0.16 : 0.08);
  }
  sync(dt) {
    this.m.root.position.copy(this.pos); this.m.root.rotation.set(-this.pitch, this.yaw, this.roll);
    this.m.prop.rotation.z += dt * 40;
  }
  cam(camera, dt, snap = false) {
    const f = this.fwd(_a);
    _b.set(this.pos.x - Math.sin(this.yaw) * 30, this.pos.y + 12 - f.y * 12, this.pos.z - Math.cos(this.yaw) * 30);
    if (snap) camera.position.copy(_b); else camera.position.lerp(_b, 1 - Math.exp(-7 * dt));
    camera.lookAt(_c.copy(this.pos).addScaledVector(f, 70).setY(this.pos.y + f.y * 70 + 9));
    camera.rotation.z += this.roll * 0.25;
  }
  // Fire the nose cannons; targets: [{ pos, r, onHit }] hit when inside the aim cone.
  fire(dt, input, targets, range = 650) {
    const S = this.S, f = this.fwd(new V());
    let best = null, bestAlong = 0;
    for (const t of targets) {
      _b.subVectors(t.pos, this.pos); const along = _b.dot(f);
      if (along < 0 || along > range) continue;
      const off = _c.copy(this.pos).addScaledVector(f, along).distanceTo(t.pos);
      if (off < t.r + along * 0.13) { best = t; bestAlong = along; break; }
    }
    const sight = S.project(_b.copy(this.pos).addScaledVector(f, 400));
    if (sight) S.ui.reticle(sight.x, sight.y, !!best); else S.ui.reticle(null);
    this.cool -= dt;
    if (!input.held('a') || this.cool > 0) return false;
    this.cool = 0.09;
    S.audio.gun();
    S.fx.spawn(_b.copy(this.pos).addScaledVector(f, 6), _c.copy(f).multiplyScalar(this.speed + 520), 0.5, 0.5, 0xfff0a0, 0xffa030);
    if (best) best.onHit(best.pos.clone().addScaledVector(f, -best.r * 0.8));
    return true;
  }
}
