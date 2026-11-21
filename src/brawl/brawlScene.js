import * as THREE from 'three';
import { GameScene, clamp, damp, turnToward } from '../core/scene.js';
import { Beam } from '../core/fx.js';
import { setupSky, ground } from '../world/sky.js';
import { Ocean } from '../world/ocean.js';
import { City, gridLots } from '../world/city.js';
import { palms } from '../world/props.js';
import { makeGodzilla } from '../models/godzilla.js';
import { makeWarship } from '../models/vehicles.js';
import { RIVALS, LADDER } from './roster.js';

const V = THREE.Vector3;
const ARENA_R = 330;
const _a = new V(), _b = new V(), _c = new V(), _d = new V(), UP = new V(0, 1, 0);
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// Distance from point p to segment ab.
function segDist(p, a, b) {
  _c.subVectors(b, a); const len2 = _c.lengthSq();
  const k = len2 ? clamp(_d.subVectors(p, a).dot(_c) / len2, 0, 1) : 0;
  return _d.copy(a).addScaledVector(_c, k).distanceTo(p);
}

export class BrawlScene extends GameScene {
  constructor(game, opts) {
    super(game, opts);
    this.key = opts.rival; this.cfg = RIVALS[this.key]; this.arena = opts.arena || this.cfg.arena;
    this.diff = opts.diff ?? LADDER.indexOf(this.key);
    this.gy = this.arena === 'bay' ? -15 : 0;
    this.buildArena();

    this.g = makeGodzilla(); this.g.root.scale.setScalar(5); this.scene.add(this.g.root);
    this.P = { pos: new V(0, 0, -115), yaw: 0, hp: opts.hp ?? 300, max: 300, energy: 70, state: 'idle', st: 0, vel: new V(), combo: 0, charge: 0, roarCd: 0, inv: 0, radius: 13, aim: new V(0, 30, 100), hurtT: 0, stepT: 0, blocking: false };

    const c = this.cfg;
    this.m = c.make(); this.m.root.scale.setScalar(c.scale); this.scene.add(this.m.root);
    this.R = { pos: new V(0, 0, 115), alt: c.flying ? c.hover : 0, yaw: Math.PI, hp: c.hp, max: c.hp, state: 'intro', st: 0, vel: new V(), cds: {}, think: 1.2, circ: 1, circT: 3, tire: 15, hurtT: 0, poise: 0, h: this.m.height * c.scale, radius: c.radius, fold: 0 };
    for (const a of c.attacks) this.R.cds[a.id] = Math.random() * 2;

    this.pBeam = new Beam(this.scene);
    this.rBeam = [0, 1, 2].map(() => new Beam(this.scene, c.beamColor, 0xfffbe0));
    this.rWarn = [0, 1, 2].map(() => new Beam(this.scene, 0xff3020, 0xff9080));
    this.shots = []; this.zones = []; this.vig = 0; this.phase = 'intro';
    this.missileGeo = new THREE.ConeGeometry(1.6, 9, 6).rotateX(Math.PI / 2);
    this.missileMat = new THREE.MeshStandardMaterial({ color: 0xd8dde4, metalness: 0.6, roughness: 0.4 });

    this.ui.hud(true);
    this.ui.controls([{ b: 'a', label: 'Claw', key: 'Space' }, { b: 'b', label: 'Tail', key: 'K' }, { b: 'c', label: 'Heat Ray', key: 'Hold E' }, { b: 'd', label: 'Block', key: 'Shift' }, { b: 'e', label: 'Roar', key: 'R' }]);
    this.ui.banner('GODZILLA', 'versus ' + c.name, 2400);
    this.audio.music('battle');
    this.after(0.8, () => this.audio.roar(0.8, c.pitch, 1.6));
    this.after(2.6, () => { this.ui.banner('FIGHT', '', 900); this.audio.roar(1, 1); this.phase = 'fight'; this.R.state = 'move'; this.R.st = 0; });
    this.updateCamera(1, true);
  }

  buildArena() {
    const s = this.scene;
    if (this.arena === 'city') {
      this.sky = setupSky(s, 'night', { near: 180, far: 1500, hi: 2.2, sunI: 1.8 });
      ground(s, 0x24262a, 2400);
      this.city = new City(s, gridLots({ nx: 13, nz: 13, lot: 34, street: 24, hMin: 12, hMax: 44, skip: (x, z) => { const d = Math.hypot(x, z); return d < 100 || d > 400; } }), true);
    } else if (this.arena === 'bay') {
      this.sky = setupSky(s, 'storm');
      this.ocean = new Ocean(s, { amp: 1.5, deep: 0x0a2230, shallow: 0x3a6c7c });
      for (let i = 0; i < 4; i++) {
        const w = makeWarship(70), a = i * 1.6 + 0.5;
        w.root.position.set(Math.cos(a) * 420, 0, Math.sin(a) * 420); w.root.rotation.y = a; s.add(w.root);
      }
    } else {
      this.sky = setupSky(s, 'dusk', { far: 1900 });
      ground(s, 0x9c8a62, 430);
      ground(s, 0x55693a, 250, 0.1);
      this.ocean = new Ocean(s, { y: -4, amp: 0.8, deep: 0x1a2c44, shallow: 0x7a6a78, sunCol: 0xffb072, sunDir: [-0.7, 0.35, -0.5] });
      palms(s, 90, 150, 400, 1);
    }
  }

  groundHit(pos, size = 1) {
    _a.set(pos.x, this.arena === 'bay' ? 1 : 2, pos.z);
    if (this.arena === 'bay') this.fx.splash(_a, size * 3); else this.fx.debris(_a, 12, size * 1.6);
    if (this.city) this.city.smash(pos.x, pos.z, 14 * size, this.fx, this.audio);
  }
  center(F, out) { return out.set(F.pos.x, this.gy + (F.alt || 0) + (F === this.P ? 26 : this.R.h * 0.5), F.pos.z); }

  // ---------- damage ----------
  hurtRival(dmg, from, kb = 0, heavy = false, quiet = false) {
    const R = this.R;
    if (this.phase !== 'fight') return;
    R.hp -= dmg; R.hurtT = 0.2;
    if (!quiet) {
      this.center(R, _a); this.fx.burst(_a, 10, 40, 0.5, 1.6, 0xffe9a0, 0xff6020, { grav: 20 });
      this.audio.hit(heavy ? 1 : 0.7); this.fx.shake(heavy ? 1.2 : 0.5);
      this.P.energy = Math.min(100, this.P.energy + 5);
    }
    if (kb) { _b.set(R.pos.x - from.x, 0, R.pos.z - from.z).normalize(); R.vel.addScaledVector(_b, kb); }
    if ((heavy || dmg >= (this.cfg.armor || 0)) && !quiet && R.poise <= 0 && R.state !== 'stagger') {
      R.state = 'stagger'; R.st = 0; R.stagDur = heavy ? 1.4 : 0.5; this.hideRivalBeams();
      this.m.set.attack = 0; this.m.set.charge = 0;
    }
    if (R.hp <= 0) this.ko(true);
  }
  hurtPlayer(dmg, from, kb = 0, unblockable = false) {
    const P = this.P;
    if (P.inv > 0 || this.phase !== 'fight') return;
    const k = P.state === 'idle' && P.blocking && !unblockable ? 0.25 : 1;
    P.hp -= dmg * k; P.inv = 0.35; P.hurtT = 0.3; this.vig = 0.9 * k;
    _b.set(P.pos.x - from.x, 0, P.pos.z - from.z).normalize(); P.vel.addScaledVector(_b, kb * k);
    this.audio.hit(0.5 + k * 0.5); this.fx.shake(1.6 * k);
    this.center(P, _a); this.fx.burst(_a, 8, 30, 0.5, 1.4, 0xffe9a0, 0xff6020, { grav: 20 });
    if (k === 1 && dmg >= 10 && P.state !== 'beam') { P.state = 'stagger'; P.st = 0; P.charge = 0; }
    if (P.hp <= 0) this.ko(false);
  }
  burnPlayer(amount, blockable) {
    const P = this.P;
    if (this.phase !== 'fight') return;
    P.hp -= amount * (blockable && P.state === 'idle' && P.blocking ? 0.3 : 1); P.hurtT = 0.15; this.vig = Math.max(this.vig, 0.5);
    if (P.hp <= 0) this.ko(false);
  }
  ko(playerWon) {
    if (this.phase !== 'fight') return;
    this.phase = 'ko'; this.won = playerWon; this.hideRivalBeams(); this.pBeam.off();
    this.P.state = playerWon ? 'idle' : 'ko'; this.R.state = playerWon ? 'ko' : 'move'; this.R.st = 0; this.P.charge = 0;
    this.audio.boom(1.2); this.fx.shake(2.5);
    this.ui.banner(playerWon ? 'VICTORY' : 'DEFEATED', playerWon ? this.cfg.name + ' is down' : this.cfg.name + ' wins', 3000);
    if (playerWon) this.after(1.2, () => this.audio.roar(1, 1, 2.4));
    this.audio.music(playerWon ? 'hope' : 'dread');
    this.after(3.6, () => this.game.brawlOver(this, playerWon));
  }

  // ---------- player ----------
  updatePlayer(dt) {
    const P = this.P, R = this.R, inp = this.input, g = this.g;
    const dist = flat(P.pos, R.pos), want = Math.atan2(R.pos.x - P.pos.x, R.pos.z - P.pos.z);
    P.st += dt; P.inv -= dt; P.roarCd -= dt; P.hurtT -= dt;
    const fight = this.phase === 'fight';
    let speed = 0, turn = 3.4;
    const set = g.set;
    let claw = 0, whip = 0, jaw = 0;
    P.blocking = false;
    if (P.state === 'idle') {
      speed = 31;
      if (fight) {
        P.blocking = inp.held('d'); if (P.blocking) speed = 11;
        if (inp.hit('a')) { P.state = 'claw'; P.st = 0; P.combo = 0; P.hitDone = false; P.queue = false; this.audio.whoosh(0.6); }
        else if (inp.hit('b')) { P.state = 'tail'; P.st = 0; P.hitDone = false; this.audio.whoosh(1); }
        else if (inp.hit('e') && P.roarCd <= 0) { P.state = 'roar'; P.st = 0; P.roarCd = 9; this.audio.roar(1, 1, 1.6); this.fx.shake(1.5); if (dist < 130) this.hurtRival(4, P.pos, 20, true); }
        else if (inp.held('c') && P.energy >= 25) { P.state = 'charge'; P.st = 0; P.charge = 0; this.audio.charge(1.5); }
      }
    } else if (P.state === 'claw') {
      speed = 12; turn = 2;
      claw = Math.sin(clamp(P.st / 0.4, 0, 1) * Math.PI);
      if (inp.hit('a')) P.queue = true;
      if (!P.hitDone && P.st >= 0.17) {
        P.hitDone = true;
        if (dist - R.radius < 27 && R.alt < 24) this.hurtRival([9, 9, 17][P.combo], P.pos, P.combo === 2 ? 45 : 8, P.combo === 2);
      }
      if (P.st >= 0.4) { if (P.queue && P.combo < 2) { P.combo++; P.st = 0; P.hitDone = false; P.queue = false; this.audio.whoosh(0.6); } else P.state = 'idle'; }
    } else if (P.state === 'tail') {
      turn = 0.5;
      const k = P.st / 0.95; whip = Math.sin(k * Math.PI * 2) * (k < 1 ? 1 : 0);
      if (!P.hitDone && P.st >= 0.45) {
        P.hitDone = true;
        if (dist - R.radius < 42 && R.alt < 30) this.hurtRival(24, P.pos, 70, true);
        this.groundHit(_a.set(P.pos.x - Math.sin(P.yaw) * 30, 0, P.pos.z - Math.cos(P.yaw) * 30), 1.2);
      }
      if (P.st >= 0.95) P.state = 'idle';
    } else if (P.state === 'roar') {
      turn = 1; jaw = 1;
      if (P.st >= 1.0) P.state = 'idle';
    } else if (P.state === 'charge') {
      speed = 9; turn = 2.4;
      P.charge = Math.min(1, P.charge + dt / 1.4);
      if (!inp.held('c') || P.st > 2.4 || !fight) {
        if (P.charge >= 0.3 && fight) { P.state = 'beam'; P.st = 0; P.beamDur = 0.5 + P.charge * 0.9; P.energy -= 25 + 45 * P.charge; P.beamStag = false; this.audio.beam(P.beamDur); this.center(R, P.aim); }
        else { P.state = 'idle'; P.charge = 0; }
      }
    } else if (P.state === 'beam') {
      turn = 1.6; jaw = 1;
      const from = g.mouthWorld(_a).clone();
      this.center(R, _b);
      P.aim.x = damp(P.aim.x, _b.x, 7, dt); P.aim.y = damp(P.aim.y, _b.y, 7, dt); P.aim.z = damp(P.aim.z, _b.z, 7, dt);
      const dir = _c.subVectors(P.aim, from).normalize().clone();
      let len = 620; if (dir.y < -0.02) len = Math.min(len, (from.y - this.gy) / -dir.y);
      const end = from.clone().addScaledVector(dir, len);
      const hit = segDist(_b, from, end) < R.radius * 1.05;
      if (hit) {
        end.copy(_b);
        this.hurtRival(50 * dt * (0.6 + P.charge * 0.5), P.pos, 0, false, true);
        if (!P.beamStag && P.charge >= 0.7) { P.beamStag = true; this.hurtRival(6, P.pos, 30, true); }
        if (Math.random() < 0.5) this.fx.burst(end, 2, 50, 0.5, 2, 0xbfe6ff, 0x2a6cff, { grav: 10 });
      } else if (len < 619 && Math.random() < 0.2) { this.fx.explosion(end, 1.6); this.groundHit(end, 1.3); this.audio.boom(0.4); }
      this.pBeam.set(from, end, 1.6 + P.charge * 2.6);
      this.fx.shake(0.5);
      if (P.st >= P.beamDur) { P.state = 'idle'; P.charge = 0; this.pBeam.off(); }
    } else if (P.state === 'stagger') {
      this.pBeam.off();
      if (P.st >= 0.45) P.state = 'idle';
    } else if (P.state === 'ko') {
      g.root.rotation.z = damp(g.root.rotation.z, 1.45, 2, dt);
    }
    if (P.state !== 'beam') this.pBeam.off();
    if (P.state !== 'charge' && P.state !== 'beam') P.energy = Math.min(100, P.energy + 6 * dt);

    if (P.state !== 'ko') P.yaw = turnToward(P.yaw, want, turn * dt);
    const mx = inp.move.x, my = inp.move.y, moving = speed > 0 && (mx || my) && this.phase !== 'ko';
    if (moving) {
      const s = Math.sin(P.yaw), c = Math.cos(P.yaw);
      P.pos.x += (s * my - c * mx) * speed * dt; P.pos.z += (c * my + s * mx) * speed * dt;
      P.stepT -= dt; if (P.stepT <= 0) { P.stepT = 0.62; this.audio.step(0.35); this.fx.shake(0.25); }
    }
    P.pos.addScaledVector(P.vel, dt); P.vel.multiplyScalar(Math.exp(-4 * dt));

    set.walk = damp(set.walk, moving ? 1 : 0, 8, dt);
    set.clawR = P.state === 'claw' && P.combo !== 1 ? claw : 0; set.clawL = P.state === 'claw' && P.combo >= 1 ? claw : 0;
    set.whip = whip; set.charge = P.charge; set.jaw = damp(set.jaw, jaw, 12, dt);
    set.hurt = Math.max(0, P.hurtT * 3); set.lean = P.blocking ? -0.12 : 0;
    const dy = this.gy + R.alt + R.h * 0.5 - (this.gy + 45);
    set.headPitch = damp(set.headPitch, clamp(-Math.atan2(dy, Math.max(30, dist)) * 0.7, -0.7, 0.3), 5, dt);
    g.flash(Math.max(0, P.hurtT * 2.5));
    if (this.city && this.phase !== 'intro') this.city.smash(P.pos.x, P.pos.z, 9, this.fx, this.audio);
  }

  // ---------- rival ----------
  hideRivalBeams() { for (const b of this.rBeam) b.off(); for (const b of this.rWarn) b.off(); }

  updateRival(dt) {
    const R = this.R, P = this.P, m = this.m, c = this.cfg, set = m.set;
    const dx = P.pos.x - R.pos.x, dz = P.pos.z - R.pos.z, dist = Math.hypot(dx, dz) || 1, want = Math.atan2(dx, dz);
    R.st += dt; R.hurtT -= dt; R.poise -= dt;
    for (const k in R.cds) R.cds[k] -= dt;
    let walk = 0;
    if (R.state === 'move' && this.phase === 'fight') {
      R.yaw = turnToward(R.yaw, want, 2.4 * dt);
      R.circT -= dt; if (R.circT < 0) { R.circ = Math.random() < 0.3 ? 0 : Math.random() < 0.5 ? 1 : -1; R.circT = 2 + Math.random() * 3; }
      const radial = dist > c.range + 12 ? 1 : dist < c.range - 14 ? -0.7 : 0, sp = c.speed * (0.85 + this.diff * 0.06);
      const nx = dx / dist, nz = dz / dist;
      R.pos.x += (nx * radial - nz * R.circ * 0.6) * sp * dt; R.pos.z += (nz * radial + nx * R.circ * 0.6) * sp * dt;
      walk = radial || R.circ ? 1 : 0;
      if (c.flying) { R.alt = damp(R.alt, c.hover, 1.3, dt); R.fold = damp(R.fold, 0, 4, dt); }
      R.think -= dt;
      if (R.think <= 0) {
        R.think = Math.max(0.25, 0.55 + Math.random() * 0.7 - this.diff * 0.1);
        const ok = c.attacks.filter((a) => R.cds[a.id] <= 0 && dist >= a.min && dist <= a.max);
        if (ok.length) { R.state = 'attack'; R.st = 0; R.atk = { d: ok[(Math.random() * ok.length) | 0], target: new V(), aim: this.center(P, new V()), from: new V(), fired: false, warned: false, alt0: R.alt }; }
      }
      if (c.flying) { R.tire -= dt; if (R.tire <= 0 && R.state === 'move') { R.state = 'land'; R.st = 0; R.tire = 15 + Math.random() * 7; } }
    } else if (R.state === 'attack') {
      this.updateAttack(dt, dist, want);
    } else if (R.state === 'stagger') {
      if (c.flying) { R.alt = Math.max(0, R.alt - 75 * dt); R.fold = damp(R.fold, 0.7, 6, dt); }
      if (R.st >= R.stagDur) { R.state = 'move'; R.st = 0; R.poise = 1.6; R.think = 0.5; }
    } else if (R.state === 'land') {
      R.alt = damp(R.alt, 0, 2.6, dt); R.fold = damp(R.fold, 1, 3, dt);
      if (R.st >= 4.2) { R.state = 'move'; R.st = 0; }
    } else if (R.state === 'ko') {
      R.alt = Math.max(0, R.alt - 60 * dt);
      m.root.rotation.z = damp(m.root.rotation.z, 1.4, 2, dt); R.fold = damp(R.fold, 1, 3, dt);
      if (R.alt <= 0 && !R.fell) { R.fell = true; this.groundHit(R.pos, 2.5); this.audio.boom(1); this.fx.shake(2); }
    }
    R.pos.addScaledVector(R.vel, dt); R.vel.multiplyScalar(Math.exp(-4 * dt));
    set.walk = damp(set.walk, walk, 8, dt); set.fold = R.fold; set.flap = c.flying ? 1 : 0.3;
    m.flash(Math.max(0, R.hurtT * 4));
    if (this.city && R.alt < 12 && this.phase !== 'intro') this.city.smash(R.pos.x, R.pos.z, 9, this.fx, this.audio);
  }

  updateAttack(dt, dist, want) {
    const R = this.R, P = this.P, A = R.atk, d = A.d, t = R.st, m = this.m, set = m.set, c = this.cfg;
    const wk = clamp(t / d.wind, 0, 1), ph = t < d.wind ? 0 : t < d.wind + d.act ? 1 : t < d.wind + d.act + d.rec ? 2 : 3;
    const ak = clamp((t - d.wind) / d.act, 0, 1);
    if (ph === 3) {
      R.cds[d.id] = d.cd * (1.3 - this.diff * 0.1); R.state = 'move'; R.st = 0; R.think = 0.4;
      set.attack = 0; set.charge = 0; set.jaw = 0; this.hideRivalBeams(); return;
    }
    if (ph === 0) R.yaw = turnToward(R.yaw, want, 3 * dt);

    if (d.type === 'melee') {
      if (ph === 0) {
        set.attack = wk; set.jaw = wk;
        if (c.flying) R.alt = damp(R.alt, 5, 5, dt);
        if (dist > R.radius + P.radius + 6) { R.pos.x += Math.sin(R.yaw) * c.speed * 0.9 * dt; R.pos.z += Math.cos(R.yaw) * c.speed * 0.9 * dt; }
        if (!A.warned && wk > 0.2) { A.warned = true; A.target.copy(P.pos); this.fx.warn(_a.set(P.pos.x, this.gy < 0 ? 0.5 : 0, P.pos.z), d.r, d.wind * 0.8 + 0.05); }
      } else if (ph === 1 && !A.fired) {
        A.fired = true; this.audio.whoosh(1);
        if (!A.warned) A.target.copy(P.pos);
        if (flat(P.pos, A.target) < d.r) this.hurtPlayer(d.dmg, R.pos, 35);
      } else if (ph === 2) { set.attack = damp(set.attack, 0, 6, dt); set.jaw = damp(set.jaw, 0, 6, dt); }
    } else if (d.type === 'dive') {
      if (ph === 0) {
        set.attack = wk;
        if (c.flying && d.up) R.alt = damp(R.alt, d.up, 3, dt);
        if (wk < 0.62) A.target.copy(P.pos);
        else if (!A.warned) {
          A.warned = true; A.from.copy(R.pos); A.alt0 = R.alt;
          this.fx.warn(_a.set(A.target.x, this.gy < 0 ? 0.5 : 0, A.target.z), d.r, d.wind * 0.38 + d.act * 0.8);
          this.audio.roar(0.5, c.pitch, 0.9);
        }
      } else if (ph === 1) {
        if (!A.warned) { A.warned = true; A.from.copy(R.pos); A.alt0 = R.alt; }
        R.pos.lerpVectors(A.from, A.target, ak); R.alt = A.alt0 + (d.low - A.alt0) * ak;
        if (!A.fired && ak > 0.8) {
          A.fired = true;
          if (flat(P.pos, A.target) < d.r) this.hurtPlayer(d.dmg, A.from, d.kb);
          this.groundHit(A.target, 2); this.fx.shake(1.5); this.audio.boom(0.7);
        }
      } else { if (c.flying) { R.alt = damp(R.alt, d.low, 5, dt); if (d.low === 0) R.fold = damp(R.fold, 1, 5, dt); } set.attack = damp(set.attack, 0, 4, dt); }
    } else if (d.type === 'gust') {
      if (ph === 0) {
        set.flap = 2; set.attack = wk * 0.5;
        if (c.flying) R.alt = damp(R.alt, 18, 3, dt);
        if (!A.warned) { A.warned = true; this.fx.warn(_a.set(R.pos.x, this.gy < 0 ? 0.5 : 0, R.pos.z), d.r, d.wind, 0xffd27a); }
      } else if (ph === 1 && !A.fired) {
        A.fired = true; this.audio.whoosh(1.6);
        this.center(R, _a); _b.set(P.pos.x - R.pos.x, 0, P.pos.z - R.pos.z).normalize();
        for (let i = 0; i < 40; i++) { _c.copy(_b).multiplyScalar(140 + Math.random() * 120); _c.x += (Math.random() - 0.5) * 120; _c.y = (Math.random() - 0.5) * 40; _c.z += (Math.random() - 0.5) * 120; this.fx.spawn(_a, _c, 0.9, 2.2, 0xe8e0d0, 0x8a8478, 0, 0.5, 1); }
        if (dist < d.r) this.hurtPlayer(d.dmg, R.pos, d.kb);
      }
    } else if (d.type === 'zone') {
      if (ph === 0) { set.charge = wk; R.pos.x = damp(R.pos.x, P.pos.x, 1.6, dt); R.pos.z = damp(R.pos.z, P.pos.z, 1.6, dt); }
      else if (ph === 1 && !A.fired) {
        A.fired = true; this.audio.whoosh(0.8);
        const pos = P.pos.clone();
        this.zones.push({ pos, r: d.r, t: 0, dur: d.dur, dps: d.dps });
        this.fx.warn(_a.set(pos.x, this.gy < 0 ? 0.5 : 0, pos.z), d.r, d.dur, 0xffe27a);
      } else if (ph === 2) set.charge = damp(set.charge, 0, 4, dt);
    } else if (d.type === 'beam') {
      const mouths = m.mouths(), n = d.n, origin = this.center(R, _a).clone();
      origin.y = mouths[0].y;
      if (ph === 0) {
        set.charge = wk; set.jaw = wk;
        if (!A.snd) { A.snd = true; this.audio.charge(d.wind); }
        if (wk < 0.72) { this.center(P, _b); A.aim.x = damp(A.aim.x, _b.x, 6, dt); A.aim.y = _b.y; A.aim.z = damp(A.aim.z, _b.z, 6, dt); }
      } else if (ph === 1 && !A.fired) { A.fired = true; this.audio.beam(d.act); }
      const spread = ph === 0 ? 0.5 : 0.5 - 0.42 * ak;
      this.center(P, _b);
      for (let i = 0; i < 3; i++) {
        if (i >= n || ph === 2) { this.rBeam[i].off(); this.rWarn[i].off(); continue; }
        const off = (i - (n - 1) / 2) * spread;
        const dir = new V().subVectors(A.aim, origin); dir.applyAxisAngle(UP, off).normalize();
        const from = mouths[i] || mouths[0];
        let len = 560; if (dir.y < -0.02) len = Math.min(len, (from.y - this.gy) / -dir.y);
        const end = from.clone().addScaledVector(dir, len);
        if (ph === 0) { this.rWarn[i].set(from, end, 0.35); this.rBeam[i].off(); }
        else {
          this.rWarn[i].off(); this.rBeam[i].set(from, end, 3);
          if (segDist(_b, from, end) < 13) this.burnPlayer(d.dps * dt, true);
          if (Math.random() < 0.12 && len < 559) { this.fx.explosion(end, 1.2); this.groundHit(end, 1); }
        }
      }
      if (ph === 2) { set.charge = damp(set.charge, 0, 5, dt); set.jaw = damp(set.jaw, 0, 5, dt); }
    } else if (d.type === 'volley') {
      if (ph === 0) { set.attack = wk; set.charge = d.bolt ? wk : 0; }
      else if (ph === 1 && !A.fired) {
        A.fired = true;
        const lead = _b.set(this.input.move.x, 0, this.input.move.y).length() > 0.2 ? 1 : 0;
        for (let i = 0; i < d.n; i++) {
          const target = P.pos.clone();
          if (i > 0) { target.x += (Math.random() - 0.5) * 70 + Math.sin(P.yaw) * this.input.move.y * 30 * lead; target.z += (Math.random() - 0.5) * 70 + Math.cos(P.yaw) * this.input.move.y * 30 * lead; }
          const s = { target, t: -i * (d.bolt ? 0.3 : 0.22), dur: d.fly, r: d.r, dmg: d.dmg, bolt: !!d.bolt, from: this.center(R, new V()), warned: false, mesh: null };
          if (!d.bolt) { s.mesh = new THREE.Mesh(this.missileGeo, this.missileMat); s.mesh.visible = false; this.scene.add(s.mesh); }
          this.shots.push(s);
        }
      } else if (ph === 2) { set.attack = damp(set.attack, 0, 4, dt); set.charge = damp(set.charge, 0, 4, dt); }
    }
  }

  updateHazards(dt) {
    const P = this.P;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i]; s.t += dt;
      if (s.t < 0) continue;
      const gyv = this.gy < 0 ? 0.5 : 0;
      if (!s.warned) { s.warned = true; this.fx.warn(_a.set(s.target.x, gyv, s.target.z), s.r, s.dur - s.t); if (!s.bolt) this.audio.whoosh(0.5); }
      const k = s.t / s.dur;
      if (s.mesh) {
        s.mesh.visible = true;
        _a.lerpVectors(s.from, s.target, k); _a.y = s.from.y * (1 - k) + this.gy * k + Math.sin(k * Math.PI) * 70;
        s.mesh.lookAt(_a); s.mesh.position.copy(_a);
        if (Math.random() < 0.6) this.fx.spawn(_a, _b.set(0, 4, 0), 0.6, 1.4, 0xffc070, 0x555050, 0, 1.5, 1);
      }
      if (k >= 1) {
        _a.set(s.target.x, this.gy + 3, s.target.z);
        if (s.bolt) {
          const bolt = new Beam(this.scene, 0xffe24a, 0xffffff); bolt.set(_b.set(s.target.x + 20, 420, s.target.z - 30), _a, 2.4);
          this.fx.items.push({ m: bolt.g, t: 0, dur: 0.22, tick: () => {} }); this.fx.items.push({ m: bolt.tip, t: 0, dur: 0.22, tick: () => {} });
          this.audio.zap(0.5);
        }
        this.fx.explosion(_a, 1.7); this.audio.boom(0.5); this.groundHit(s.target, 1);
        if (flat(P.pos, s.target) < s.r + 3) this.hurtPlayer(s.dmg, s.target, 25);
        if (s.mesh) this.scene.remove(s.mesh);
        this.shots.splice(i, 1);
      }
    }
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i]; z.t += dt;
      for (let j = 0; j < 3; j++) { const a = Math.random() * 7, r = Math.sqrt(Math.random()) * z.r; this.fx.spawn(_a.set(z.pos.x + Math.cos(a) * r, this.gy + 55 + Math.random() * 25, z.pos.z + Math.sin(a) * r), _b.set(0, -22, 0), 2.2, 1.1, 0xffe9a0, 0xd98a20); }
      if (flat(P.pos, z.pos) < z.r) this.burnPlayer(z.dps * dt, false);
      if (z.t >= z.dur) this.zones.splice(i, 1);
    }
  }

  updateCamera(dt, snap) {
    const P = this.P, R = this.R;
    let dx = P.pos.x - R.pos.x, dz = P.pos.z - R.pos.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
    const back = 98 + clamp((d - 150) * 0.15, -10, 40);
    _a.set(P.pos.x + dx * back - dz * 20, this.gy + 48 + clamp(R.alt * 0.25, 0, 20), P.pos.z + dz * back + dx * 20);
    _b.set(P.pos.x + (R.pos.x - P.pos.x) * 0.42, this.gy + 30 + R.alt * 0.42, P.pos.z + (R.pos.z - P.pos.z) * 0.42);
    if (!this.look) this.look = _b.clone();
    if (snap) { this.camera.position.copy(_a); this.look.copy(_b); }
    else { const k = 1 - Math.exp(-4 * dt); this.camera.position.lerp(_a, k); this.look.lerp(_b, 1 - Math.exp(-6 * dt)); }
    if (this.camera.position.y < 6) this.camera.position.y = 6;
    this.camera.lookAt(this.look);
  }

  update(dt) {
    const P = this.P, R = this.R;
    this.updatePlayer(dt);
    this.updateRival(dt);
    this.updateHazards(dt);
    // keep fighters apart and inside the arena
    if (R.alt < 25 && R.state !== 'ko' && P.state !== 'ko') {
      const d = flat(P.pos, R.pos), min = P.radius + R.radius;
      if (d < min && d > 0.01) { const k = (min - d) / d, ax = (P.pos.x - R.pos.x) * k, az = (P.pos.z - R.pos.z) * k; P.pos.x += ax * 0.6; P.pos.z += az * 0.6; R.pos.x -= ax * 0.4; R.pos.z -= az * 0.4; }
    }
    for (const F of [P, R]) { const d = Math.hypot(F.pos.x, F.pos.z); if (d > ARENA_R) { F.pos.x *= ARENA_R / d; F.pos.z *= ARENA_R / d; } }

    this.g.root.position.set(P.pos.x, this.gy, P.pos.z); this.g.root.rotation.y = P.yaw; this.g.update(dt);
    this.m.root.position.set(R.pos.x, this.gy + R.alt, R.pos.z); this.m.root.rotation.y = R.yaw; this.m.update(dt);
    this.updateCamera(dt);
    if (this.ocean) this.ocean.update(dt, this.camera);
    if (this.city) this.city.update(dt);
    if (this.arena === 'bay' && Math.random() < 0.3) { this.fx.splash(_a.set(P.pos.x + (Math.random() - 0.5) * 24, 1, P.pos.z + (Math.random() - 0.5) * 24), 0.8); if (R.alt < 10) this.fx.splash(_a.set(R.pos.x + (Math.random() - 0.5) * 30, 1, R.pos.z + (Math.random() - 0.5) * 30), 0.8); }

    this.vig = Math.max(0, this.vig - dt * 2); this.ui.vignette(this.vig);
    this.ui.bar('L', 'Godzilla', P.hp / P.max, P.energy / 100);
    this.ui.bar('R', this.cfg.name, R.hp / R.max);
  }
}
