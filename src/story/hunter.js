import * as THREE from 'three/webgpu';
import { Beam } from '../core/fx.js';
import { clamp, damp, turnToward, segDist } from '../core/scene.js';
import { makeGodzilla } from '../models/godzilla.js';

const V = THREE.Vector3;
const _a = new V(), _b = new V();

// Godzilla as he behaves against the Shinden: attention meter, bite, and a heat ray you can out-turn.
export class Hunter {
  constructor(S, plane, x, z, yaw) {
    this.S = S; this.plane = plane;
    this.g = makeGodzilla(); this.g.root.scale.setScalar(5); S.scene.add(this.g.root);
    this.pos = new V(x, 0, z); this.yaw = yaw; this.aggro = 0; this.biteCd = 0; this.rayCd = 9; this.buzzCd = 0; this.ray = null; this.moving = 0;
    this.head = new V(); this.chest = new V(); this.beam = new Beam(S.scene); this.rayEvery = 15; this.canRay = true;
    this.hitTargets = [
      { pos: this.head, r: 15, onHit: (p) => this.shot(p, 0.04) },
      { pos: this.chest, r: 22, onHit: (p) => this.shot(p, 0.025) },
    ];
  }
  shot(p, k) { this.aggro = Math.min(1, this.aggro + k); if (Math.random() < 0.5) this.S.fx.burst(p, 3, 26, 0.4, 1.2, 0xfff0a0, 0xff7020); }
  face(target, rate, dt) { this.yaw = turnToward(this.yaw, Math.atan2(target.x - this.pos.x, target.z - this.pos.z), rate * dt); }
  advance(d) { this.pos.x += Math.sin(this.yaw) * d; this.pos.z += Math.cos(this.yaw) * d; this.moving = 1; }
  facing(target) { let d = Math.atan2(target.x - this.pos.x, target.z - this.pos.z) - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); return Math.abs(d); }

  update(dt, attack = true) {
    const S = this.S, g = this.g, pl = this.plane, set = g.set;
    g.root.position.copy(this.pos); g.root.rotation.y = this.yaw;
    set.walk = damp(set.walk, this.moving, 5, dt); this.moving = 0;
    g.update(dt);
    g.headWorld(this.head); this.chest.set(this.pos.x, this.pos.y + 28, this.pos.z);
    const dHead = this.head.distanceTo(pl.pos), flatD = Math.hypot(pl.pos.x - this.pos.x, pl.pos.z - this.pos.z);
    this.dHead = dHead; this.flatD = flatD;
    this.aggro = Math.max(0, this.aggro - dt * (flatD > 750 ? 0.13 : 0.032));
    this.biteCd -= dt; this.buzzCd -= dt; this.rayCd -= dt;
    set.headPitch = damp(set.headPitch, clamp(-Math.atan2(pl.pos.y - this.head.y, Math.max(40, flatD)) * 0.7, -0.8, 0.25), 3, dt);
    if (S.over) { this.beam.off(); return; }
    if (dHead < 95 && this.buzzCd <= 0) { this.buzzCd = 2.5; this.aggro = Math.min(1, this.aggro + 0.4); S.audio.roar(0.8, 1, 1.4); }
    if (attack && this.aggro > 0.3 && dHead < 42 && this.biteCd <= 0) { this.biteCd = 3; this.jawT = 0.5; S.damage(22, 'Godzilla snatched the Shinden out of the air.'); }
    if (pl.pos.distanceTo(this.chest) < 24) S.damage(30, 'You flew straight into him.');
    this.jawT = Math.max(0, (this.jawT || 0) - dt);
    let jaw = this.jawT > 0 ? 1 : 0;

    if (this.ray) {
      const r = this.ray; r.t += dt;
      if (r.t < r.wind) { set.charge = r.t / r.wind; r.aim.lerp(pl.pos, 1 - Math.exp(-4 * dt)); jaw = set.charge; }
      else if (r.t < r.wind + 1.5) {
        if (!r.fired) { r.fired = true; S.audio.beam(1.5); }
        r.aim.lerp(pl.pos, 1 - Math.exp(-0.85 * dt)); jaw = 1;
        const from = g.mouthWorld(_a).clone(), end = _b.subVectors(r.aim, from).normalize().multiplyScalar(1500).add(from);
        this.beam.set(from, end, 6); S.fx.shake(0.4);
        if (segDist(pl.pos, from, end) < 16) S.damage(30, 'The heat ray caught the Shinden.');
      } else { this.beam.off(); set.charge = 0; this.ray = null; this.rayCd = this.rayEvery; }
    } else if (attack && this.canRay && this.aggro > 0.3 && this.rayCd <= 0 && flatD > 200 && flatD < 950) {
      this.ray = { t: 0, wind: 2.8, aim: pl.pos.clone(), fired: false };
      S.audio.charge(2.8); S.say('Noda', 'His fins are lit — break away, now!', 2.6);
    }
    set.jaw = damp(set.jaw, jaw, 10, dt);
  }
  cancelRay() { this.ray = null; this.beam.off(); this.g.set.charge = 0; }
}
