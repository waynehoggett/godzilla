import * as THREE from 'three/webgpu';
import { GameScene, clamp, damp, turnToward, segDist } from '../core/scene.js';
import { Beam } from '../core/fx.js';
import { setupSky } from '../world/sky.js';
import { Ocean } from '../world/ocean.js';
import { generatedCity } from '../world/city.js';
import { makeGodzilla } from '../models/godzilla.js';
import { makeWarship } from '../models/vehicles.js';
import { RIVALS, LADDER, ARENAS } from './roster.js';
import { Bot } from './bot.js';

const V = THREE.Vector3;
const ARENA_R = 330;
const _a = new V(), _b = new V(), _c = new V(), UP = new V(0, 1, 0);
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// Godzilla's moves: damage, reach, poise damage (how hard it staggers), knockback.
const PLAYER = {
  speed: 26, hp: 300,
  claw1: { dmg: 9, reach: 27, poise: 12, kb: 8 },
  claw2: { dmg: 10, reach: 27, poise: 14, kb: 10 },
  bite: { dmg: 18, reach: 29, poise: 34, kb: 45, heavy: true },
  tail: { dmg: 24, reach: 44, poise: 45, kb: 70, heavy: true },
};
const COMBO = ['claw1', 'claw2', 'bite'];

export class BrawlScene extends GameScene {
  constructor(game, opts) {
    super(game, opts);
    this.key = opts.rival; this.cfg = RIVALS[this.key]; this.arena = ARENAS[opts.arena] ? opts.arena : this.cfg.arena;
    this.diff = opts.diff ?? LADDER.indexOf(this.key);
    this.gy = this.arena === 'bay' ? -15 : 0;
    this.buildArena();

    this.g = makeGodzilla(); this.g.root.scale.setScalar(5); this.scene.add(this.g.root);
    this.P = { pos: new V(0, 0, -115), yaw: 0, hp: opts.hp ?? PLAYER.hp, max: PLAYER.hp, energy: 70, state: 'idle', st: 0, vel: new V(), combo: 0, charge: 0, roarCd: 0, dashCd: 0, inv: 0, radius: 13, aim: new V(0, 30, 100), hurtT: 0, stepT: 0, blocking: false, buf: null, bufT: 0, hits: 0, hitsT: 0, speedNow: 0 };

    const c = this.cfg;
    this.m = c.make(); this.m.root.scale.setScalar(c.scale); this.scene.add(this.m.root);
    this.R = { pos: new V(0, 0, 115), alt: c.flying ? c.hover : 0, yaw: Math.PI, hp: c.hp, max: c.hp, state: 'intro', st: 0, vel: new V(), cds: {}, think: 1.0, circ: 1, circT: 3, tire: 15, hurtT: 0, poise: c.poise, h: this.m.height * c.scale, radius: c.radius, fly: c.flying ? 1 : 0, last: null, rest: 0, rage: false, speedNow: 0, inv: 0, lock: 0 };
    for (const a of c.attacks) this.R.cds[a.id] = Math.random() * 2;

    this.pBeam = new Beam(this.scene);
    this.rBeam = [0, 1, 2].map(() => new Beam(this.scene, c.beamColor, 0xfffbe0));
    this.rWarn = [0, 1, 2].map(() => new Beam(this.scene, 0xff3020, 0xff9080));
    this.shots = []; this.vig = 0; this.phase = 'intro';
    this.stats = { dealt: 0, taken: 0, hitsLanded: 0, hitsTaken: 0, blocked: 0, knockdowns: 0, beam: 0 };
    if (opts.bot) { this.bot = new Bot(this, opts.bot); this.input = this.bot; }
    this.stop = 0; this.slow = 1; this.kick = new V(); this.fov = 0; this.scorch = [];
    this.missileGeo = new THREE.ConeGeometry(1.6, 9, 8).rotateX(Math.PI / 2);
    this.missileMat = new THREE.MeshStandardMaterial({ color: 0xd8dde4, metalness: 0.6, roughness: 0.4 });
    this.rockGeo = new THREE.DodecahedronGeometry(6, 1); this.rockMat = new THREE.MeshStandardMaterial({ color: 0x6a6258, roughness: 1, flatShading: true });
    this.ringGeo = new THREE.RingGeometry(0.82, 1, 48).rotateX(-Math.PI / 2);

    this.ui.hud(true);
    this.ui.controls([{ b: 'a', label: 'Claw', key: 'Space' }, { b: 'b', label: 'Tail', key: 'K' }, { b: 'c', label: 'Heat Ray', key: 'Hold E' }, { b: 'd', label: 'Block / Dash', key: 'Shift' }, { b: 'e', label: 'Roar', key: 'R' }]);
    this.ui.banner('GODZILLA', 'versus ' + c.name, 2400);
    this.audio.music('battle');
    this.after(0.8, () => this.audio.roar(0.8, c.pitch, 1.6, this.key));
    this.after(2.6, () => { this.ui.banner('FIGHT', '', 900); this.audio.roar(1, 1); this.g.move('roar'); this.phase = 'fight'; this.R.state = 'space'; this.R.st = 0; });
    this.updateCamera(1, true);
  }

  buildArena() {
    const s = this.scene;
    if (this.arena === 'city') {
      this.sky = setupSky(s, 'night', { near: 200, far: 1500, sunI: 4.2, amb: 2.2, env: 3, bot: 0x33405e, shadow: 280 }, this.game.renderer);
      this.city = generatedCity(s, { interiors: this.game.lite ? false : 'average', clear: (x, z) => Math.hypot(x, z) < 60 || (Math.abs(x) < 20 && Math.abs(z) < 140) });
      this.arenaR = this.city.radius - 14;
    } else {
      this.sky = setupSky(s, 'storm', { shadow: 260 }, this.game.renderer);
      this.ocean = new Ocean(s, { amp: 1.5, deep: 0x0a2230, shallow: 0x3a6c7c });
      for (let i = 0; i < 4; i++) {
        const w = makeWarship(70), a = i * 1.6 + 0.5;
        w.root.position.set(Math.cos(a) * 420, 0, Math.sin(a) * 420); w.root.rotation.y = a; s.add(w.root);
      }
    }
  }

  groundHit(pos, size = 1) {
    _a.set(pos.x, this.arena === 'bay' ? 1 : 2, pos.z);
    if (this.arena === 'bay') this.fx.splash(_a, size * 3); else this.fx.debris(_a, 12, size * 1.6);
    if (this.city) this.city.smash(pos.x, pos.z, 14 * size, this.fx, this.audio);
  }
  center(F, out) { return out.set(F.pos.x, this.gy + (F.alt || 0) + (F === this.P ? 26 : this.R.h * 0.5), F.pos.z); }

  // Hit-stop and slow motion run on real time; everything else sees the scaled step.
  tick(dt) {
    this.realDt = dt;
    if (this.stop > 0) { this.stop -= dt; dt *= 0.03; } else dt *= this.slow;
    super.tick(dt);
  }

  // ---------- impact: the moment a blow lands ----------
  impact(pos, power, from, colour = 0xffe9a0) {
    this.stop = Math.max(this.stop, 0.045 + 0.022 * power);
    this.fx.hdr = 3; this.fx.burst(pos, 8 + power * 5, 46 + power * 8, 0.5, 1.5 + power * 0.3, colour, 0xff6020, { grav: 24 }); this.fx.hdr = 1;
    this.fx.flash(pos, 0.8 + power * 0.35, colour);
    this.fx.shake(0.5 + power * 0.45);
    // shockwave ring on the ground and a camera kick along the blow
    const ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff2d8).multiplyScalar(2), transparent: true, opacity: 0.8, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
    ring.position.set(pos.x, this.gy < 0 ? 0.6 : 0.4, pos.z); this.scene.add(ring);
    this.fx.items.push({ m: ring, t: 0, dur: 0.4, tick: (it, k) => { ring.scale.setScalar(6 + k * (22 + power * 12)); ring.material.opacity = 0.8 * (1 - k); } });
    if (from) { _c.set(pos.x - from.x, 0, pos.z - from.z).normalize(); this.kick.addScaledVector(_c, 2 + power * 2.2); }
    this.fov = Math.max(this.fov, 1.5 + power * 1.2);
    this.audio.impact(power);
    if (navigator.vibrate && this.input.isTouch) navigator.vibrate(18 + power * 14);
  }

  // ---------- damage ----------
  hurtRival(dmg, from, o = {}) {
    const R = this.R, m = this.m;
    if (this.phase !== 'fight' || R.inv > 0) return false;
    let k = R.state === 'down' ? 1.25 : 1;
    if (R.state === 'block' && !o.beam) { k = 0.3; this.audio.block(); this.center(R, _a); this.fx.burst(_a, 6, 30, 0.3, 1, 0xffffff, 0x88aaff); }
    R.hp -= dmg * k; R.hurtT = 0.25; this.stats.dealt += dmg * k; if (o.beam) this.stats.beam += dmg * k; else this.stats.hitsLanded++;
    if (!o.quiet) {
      this.center(R, _a);
      this.impact(_a.clone(), o.heavy ? 3 : 1.4, from);
      this.P.energy = Math.min(100, this.P.energy + 4);
      this.P.hits++; this.P.hitsT = 1.7; this.ui.combo(this.P.hits);
    }
    if (o.kb) { _b.set(R.pos.x - from.x, 0, R.pos.z - from.z).normalize(); R.vel.addScaledVector(_b, o.kb * (R.state === 'block' ? 0.3 : 1)); }
    if (R.state !== 'block' && R.lock <= 0) R.poise -= o.poise || 0;
    // heavy blows break a wind-up; an empty poise bar puts the rival on the ground
    if (R.hp > 0 && R.state !== 'down') {
      if (R.poise <= 0) this.knockdown();
      else if (o.heavy && R.state === 'attack' && R.st < R.atk.wind) { this.cancelAttack(); R.state = 'flinch'; R.st = 0; if (!m.react('hit')) m.set.hurt = 1; }
      else if (!o.quiet && R.state !== 'attack') { if (R.state !== 'block') m.react('hit'); }
    }
    if (R.hp <= 0) this.ko(true);
    return true;
  }
  knockdown() {
    const R = this.R;
    this.cancelAttack(); R.state = 'down'; R.st = 0; R.poise = this.cfg.poise; this.stats.knockdowns++;
    if (!this.m.react('knock')) this.m.react('hit');
    this.ui.banner('', 'Staggered', 700); this.audio.boom(0.8);
  }
  cancelAttack() { this.hideRivalBeams(); this.m.stop(); this.m.set.charge = 0; if (this.m.set.dive !== undefined) this.m.set.dive = 0; }

  hurtPlayer(dmg, from, kb = 0, unblockable = false) {
    const P = this.P;
    if (P.inv > 0 || this.phase !== 'fight') return false;
    const blocked = P.blocking && !unblockable, k = blocked ? 0.22 : 1;
    P.hp -= dmg * k; P.inv = 0.35; P.hurtT = 0.3; this.stats.taken += dmg * k; this.stats.hitsTaken++; if (blocked) this.stats.blocked++; this.vig = 0.45 * k; P.hits = 0; this.ui.combo(0);
    _b.set(P.pos.x - from.x, 0, P.pos.z - from.z).normalize(); P.vel.addScaledVector(_b, kb * k);
    this.center(P, _a);
    if (blocked) { this.audio.block(); this.fx.burst(_a, 8, 34, 0.3, 1.2, 0xffffff, 0x88aaff); this.fx.shake(0.5); this.stop = Math.max(this.stop, 0.04); }
    else this.impact(_a.clone(), dmg >= 18 ? 3 : 1.6, from, 0xffb090);
    if (!blocked && dmg >= 10 && P.state !== 'beam') { this.g.rig.stop(); P.state = 'stagger'; P.st = 0; P.charge = 0; }
    if (P.hp <= 0) this.ko(false);
    return true;
  }
  burnPlayer(amount, blockable) {
    const P = this.P;
    if (this.phase !== 'fight' || P.inv > 0.2) return;
    const burn = amount * (blockable && P.blocking ? 0.3 : 1); P.hp -= burn; this.stats.taken += burn; P.hurtT = 0.15; this.vig = Math.max(this.vig, 0.3);
    if (P.hp <= 0) this.ko(false);
  }
  ko(playerWon) {
    if (this.phase !== 'fight') return;
    this.phase = 'ko'; this.won = playerWon; this.stats.time = this.t - 2.6; this.stats.hpLeft = Math.max(0, this.P.hp); this.hideRivalBeams(); this.pBeam.off();
    this.P.state = playerWon ? 'idle' : 'ko'; this.R.state = playerWon ? 'ko' : 'space'; this.R.st = 0; this.P.charge = 0;
    if (playerWon) this.m.react('death'); else this.g.rig.stop();
    this.slow = 0.22; this.koT = 0; this.stop = 0.12;
    this.audio.boom(1.2); this.fx.shake(2.5);
    this.ui.banner(playerWon ? 'VICTORY' : 'DEFEATED', playerWon ? this.cfg.name + ' is down' : this.cfg.name + ' wins', 3600);
    this.audio.music(playerWon ? 'hope' : 'dread');
  }

  // ---------- player ----------
  startMove(name) {
    const P = this.P, t = this.g.move(name);
    P.state = name; P.st = 0; P.hitAt = t.hit; P.endAt = t.total; P.hitDone = false; P.buf = null;
    this.audio.whoosh(name === 'tail' ? 1 : 0.6);
  }
  updatePlayer(dt) {
    const P = this.P, R = this.R, inp = this.input, g = this.g, set = g.set;
    const dist = flat(P.pos, R.pos), want = Math.atan2(R.pos.x - P.pos.x, R.pos.z - P.pos.z), fight = this.phase === 'fight';
    P.st += dt; P.inv -= dt; P.roarCd -= dt; P.dashCd -= dt; P.hurtT -= dt; P.bufT -= dt; P.hitsT -= dt;
    if (P.hitsT <= 0 && P.hits) { P.hits = 0; this.ui.combo(0); }
    // remember the last button for a moment so presses during a move are not lost
    if (fight) for (const [btn, name] of [['a', 'claw'], ['b', 'tail'], ['e', 'roar']]) if (inp.hit(btn)) { P.buf = name; P.bufT = 0.28; }
    if (P.bufT <= 0) P.buf = null;
    const mx = inp.move.x, my = inp.move.y;
    let speed = 0, turn = 3.6, jaw = 0;
    P.blocking = false;
    const free = () => {
      if (!fight) return false;
      if (inp.hit('d') && (mx || my) && P.dashCd <= 0) {
        const s = Math.sin(P.yaw), c = Math.cos(P.yaw), l = Math.hypot(mx, my);
        P.dash = new V((s * my - c * mx) / l, 0, (c * my + s * mx) / l); P.state = 'dash'; P.st = 0; P.inv = 0.24; P.dashCd = 0.75; g.rig.stop(); this.audio.whoosh(0.9);
        this.groundHit(P.pos, 0.5); return true;
      }
      if (P.buf === 'claw') { P.combo = 0; this.startMove(COMBO[0]); return true; }
      if (P.buf === 'tail') { this.startMove('tail'); return true; }
      if (P.buf === 'roar' && P.roarCd <= 0) { P.buf = null; P.state = 'roar'; P.st = 0; P.roarCd = 9; P.endAt = g.move('roar').total; this.audio.roar(1, 1, 1.6); this.fx.shake(1.5); if (dist < 130) this.hurtRival(4, P.pos, { poise: 40, kb: 20, heavy: true }); return true; }
      if (inp.held('c') && P.energy >= 25) { P.state = 'charge'; P.st = 0; P.charge = 0; this.audio.charge(1.5); g.rig.act('Atomic Breath (Short)', { start: 0.15, end: 1.35, speed: 0.85, hold: true }); return true; }
      return false;
    };
    if (P.state === 'idle') {
      speed = PLAYER.speed;
      if (!free() && fight && inp.held('d')) { P.blocking = true; speed = 9; }
    } else if (COMBO.includes(P.state) || P.state === 'tail') {
      const mv = PLAYER[P.state];
      turn = P.state === 'tail' ? 0.4 : 2.2;
      // step into the blow if the rival is just out of reach
      if (P.state !== 'tail' && P.st < P.hitAt && dist - R.radius > mv.reach - 6) speed = 34;
      if (!P.hitDone && P.st >= P.hitAt) {
        P.hitDone = true;
        const lowEnough = R.alt < (P.state === 'tail' ? 30 : 24);
        if (dist - R.radius < mv.reach && lowEnough) this.hurtRival(mv.dmg, P.pos, mv);
        if (P.state === 'tail') this.groundHit(_a.set(P.pos.x - Math.sin(P.yaw) * 30, 0, P.pos.z - Math.cos(P.yaw) * 30), 1.2);
      }
      const canChain = P.hitDone && P.st >= P.hitAt + 0.1;
      if (canChain && P.buf === 'claw' && COMBO.includes(P.state) && P.combo < 2) { P.combo++; this.startMove(COMBO[P.combo]); }
      else if (canChain && P.buf === 'tail' && P.state !== 'tail') this.startMove('tail');
      else if (P.st >= P.endAt) { P.state = 'idle'; P.combo = 0; }
    } else if (P.state === 'roar') {
      turn = 1; jaw = 0.4;
      if (P.st >= P.endAt * 0.8) P.state = 'idle';
    } else if (P.state === 'dash') {
      turn = 6;
      P.pos.addScaledVector(P.dash, 105 * dt * (1 - P.st / 0.3));
      if (Math.random() < 0.5) this.groundHit(P.pos, 0.35);
      if (P.st >= 0.28) P.state = 'idle';
    } else if (P.state === 'charge') {
      speed = 8; turn = 2.6;
      P.charge = Math.min(1, P.charge + dt / 1.35);
      // light gathers into the fins
      if (Math.random() < 0.7) { g.headWorld(_a); _b.set((Math.random() - 0.5) * 60, 20 + Math.random() * 40, (Math.random() - 0.5) * 60).add(_a); _c.subVectors(_a, _b).multiplyScalar(2.2); this.fx.hdr = 3; this.fx.spawn(_b, _c, 0.42, 0.7, 0x9fdcff, 0x2a6cff); this.fx.hdr = 1; }
      if (!inp.held('c') || P.st > 2.3 || !fight) {
        if (P.charge >= 0.3 && fight) {
          P.state = 'beam'; P.st = 0; P.beamDur = 0.55 + P.charge * 0.95; P.energy -= 25 + 45 * P.charge; P.beamBroke = false;
          this.audio.beam(P.beamDur); this.center(R, P.aim); g.rig.act('Atomic Breath (Short)', { start: 1.6, end: 6.2, speed: 1.3, hold: true, fade: 0.08 });
          P.vel.addScaledVector(g.forward(_a), -18 * P.charge);
        } else { P.state = 'idle'; P.charge = 0; g.rig.stop(); }
      }
    } else if (P.state === 'beam') {
      turn = 1.5;
      const from = g.mouthWorld(_a).clone();
      this.center(R, _b);
      P.aim.x = damp(P.aim.x, _b.x, 7, dt); P.aim.y = damp(P.aim.y, _b.y, 7, dt); P.aim.z = damp(P.aim.z, _b.z, 7, dt);
      const dir = _c.subVectors(P.aim, from).normalize().clone();
      let len = 620; if (dir.y < -0.02) len = Math.min(len, (from.y - this.gy) / -dir.y);
      const end = from.clone().addScaledVector(dir, len), target = _b.clone();
      if (segDist(target, from, end) < R.radius * 1.05) {
        end.copy(target);
        this.hurtRival(38 * dt * (0.6 + P.charge * 0.5), P.pos, { quiet: true, beam: true, poise: 22 * dt });
        if (!P.beamBroke && P.charge >= 0.7) { P.beamBroke = true; this.hurtRival(6, P.pos, { heavy: true, beam: true, poise: 30, kb: 30 }); }
        if (Math.random() < 0.6) { this.fx.hdr = 3; this.fx.burst(end, 3, 60, 0.5, 2, 0xbfe6ff, 0x2a6cff, { grav: 10 }); this.fx.hdr = 1; }
      } else if (len < 619) {
        // scorch the ground where the beam drags across it
        if (Math.random() < 0.25) { this.fx.explosion(end, 1.5); this.groundHit(end, 1.2); this.audio.boom(0.35); }
        if (Math.random() < 0.5) this.scorch.push({ pos: end.clone(), t: 2.2 });
      }
      this.pBeam.set(from, end, 1.6 + P.charge * 2.6 + Math.sin(this.t * 60) * 0.3);
      this.fx.shake(0.55);
      if (P.st >= P.beamDur) { P.state = 'idle'; P.charge = 0; this.pBeam.off(); g.rig.stop(0.3); this.fx.burst(from, 10, 12, 1.4, 2.4, 0xd8e8f0, 0x60686e, { up: 1, grow: 1.5, drag: 1 }); }
    } else if (P.state === 'stagger') {
      this.pBeam.off();
      if (P.st >= 0.4) P.state = 'idle';
    } else if (P.state === 'ko') {
      g.root.rotation.z = damp(g.root.rotation.z, 1.45, 2, dt);
    }
    if (P.state !== 'beam') this.pBeam.off();
    if (P.state !== 'charge' && P.state !== 'beam') P.energy = Math.min(100, P.energy + 4.5 * dt);

    if (P.state !== 'ko') P.yaw = turnToward(P.yaw, want, turn * dt);
    let moving = false;
    if (speed > 0 && this.phase !== 'ko') {
      const s = Math.sin(P.yaw), c = Math.cos(P.yaw), attack = COMBO.includes(P.state);
      const fx_ = attack ? 0 : mx, fy = attack ? 1 : my;
      if (fx_ || fy) { P.pos.x += (s * fy - c * fx_) * speed * dt; P.pos.z += (c * fy + s * fx_) * speed * dt; moving = !attack; }
    }
    P.speedNow = damp(P.speedNow, moving ? speed : 0, 8, dt);
    if (moving) { P.stepT -= dt * (speed / PLAYER.speed); if (P.stepT <= 0) { P.stepT = 0.58; this.audio.step(0.38); this.fx.shake(0.28); this.groundHit(P.pos, 0.3); } }
    P.pos.addScaledVector(P.vel, dt); P.vel.multiplyScalar(Math.exp(-4 * dt));
    for (let i = this.scorch.length - 1; i >= 0; i--) { const sc = this.scorch[i]; sc.t -= dt; if (Math.random() < 0.3) this.fx.spawn(_a.copy(sc.pos).setY(sc.pos.y + 1), _b.set((Math.random() - 0.5) * 4, 10, (Math.random() - 0.5) * 4), 0.7, 1.6, 0xffb040, 0x302820, 0, 1.3); if (sc.t <= 0) this.scorch.splice(i, 1); }

    set.walk = clamp(P.speedNow / PLAYER.speed, 0, 1); set.speed = P.speedNow;
    set.charge = P.state === 'charge' || P.state === 'beam' ? P.charge : damp(set.charge, 0, 5, dt);
    set.jaw = damp(set.jaw, jaw, 12, dt);
    set.hurt = Math.max(0, P.hurtT * 3); set.lean = P.blocking ? -0.2 : 0;
    const dy = this.gy + R.alt + R.h * 0.5 - (this.gy + 45);
    set.headPitch = damp(set.headPitch, clamp(-Math.atan2(dy, Math.max(30, dist)) * 0.7, -0.7, 0.3), 5, dt);
    g.flash(Math.max(0, P.hurtT * 1.1));
    if (this.city && this.phase !== 'intro') this.city.smash(P.pos.x, P.pos.z, 9, this.fx, this.audio);
  }

  // ---------- rival ----------
  hideRivalBeams() { for (const b of this.rBeam) b.off(); for (const b of this.rWarn) b.off(); }

  pickAttack(dist) {
    const R = this.R, c = this.cfg;
    const ok = c.attacks.filter((a) => R.cds[a.id] <= 0 && dist >= a.min && dist <= a.max);
    if (!ok.length) return null;
    // favour variety: the move it just used is much less likely
    let total = 0; const w = ok.map((a) => { const x = (a.w || 1) * (R.last === a.id ? 0.2 : 1); total += x; return x; });
    let r = Math.random() * total;
    for (let i = 0; i < ok.length; i++) { r -= w[i]; if (r <= 0) return ok[i]; }
    return ok[0];
  }
  startAttack(d, chained = false) {
    const R = this.R, P = this.P, t = this.m.move(d.move, (R.rage ? 1.15 : 1) * (chained ? 1.2 : 1));
    const act = d.act ?? (d.type === 'dive' ? 0.5 : 0.25);
    R.state = 'attack'; R.st = 0; R.last = d.id;
    R.atk = { d, wind: t.hit, act, rec: d.rec ?? Math.max(0.35, t.total - t.hit - act), target: new V(), aim: this.center(P, new V()), from: new V(), fired: false, warned: false, alt0: R.alt, chained };
  }

  updateRival(dt) {
    const R = this.R, P = this.P, m = this.m, c = this.cfg, set = m.set;
    const dx = P.pos.x - R.pos.x, dz = P.pos.z - R.pos.z, dist = Math.hypot(dx, dz) || 1, want = Math.atan2(dx, dz), nx = dx / dist, nz = dz / dist;
    R.st += dt; R.hurtT -= dt; R.inv -= dt; R.rest -= dt;
    R.lock -= dt; R.poise = Math.min(c.poise, R.poise + 10 * dt);
    for (const k in R.cds) R.cds[k] -= dt * (R.rage ? 1.4 : 1);
    let walk = 0;
    const speedMul = (0.85 + this.diff * 0.06) * (R.rage ? 1.15 : 1);
    // rage: below 30% health it roars once and fights faster
    if (!R.rage && R.hp > 0 && R.hp < R.max * 0.3 && this.phase === 'fight' && (R.state === 'space')) {
      R.rage = true; R.state = 'roar'; R.st = 0; R.inv = 1.0; if (m.moves.roar) m.move('roar'); else if (m.moves.hurricane) m.move('hurricane'); this.audio.roar(1, c.pitch, 1.8, this.key); this.fx.shake(1.6);
      this.ui.banner('', c.name + ' is enraged', 1400);
      if (dist < 150) this.hurtPlayer(4, R.pos, 60, true);
    }
    if (R.state === 'space' && this.phase === 'fight') {
      R.yaw = turnToward(R.yaw, want, 2.6 * dt);
      R.circT -= dt; if (R.circT < 0) { R.circ = Math.random() < 0.25 ? 0 : Math.random() < 0.5 ? 1 : -1; R.circT = 1.6 + Math.random() * 2.4; }
      // after attacking it backs off and circles for a moment before coming again
      const resting = R.rest > 0, range = c.range + (resting ? 34 : 0);
      const radial = dist > range + 12 ? 1 : dist < range - 14 ? -0.75 : 0, sp = c.speed * speedMul;
      const vx = nx * radial - nz * R.circ * (resting ? 0.9 : 0.55), vz = nz * radial + nx * R.circ * (resting ? 0.9 : 0.55);
      R.pos.x += vx * sp * dt; R.pos.z += vz * sp * dt;
      walk = radial || R.circ ? 1 : 0; R.speedNow = Math.hypot(vx, vz) * sp;
      if (c.flying) R.alt = damp(R.alt, c.hover, 1.3, dt);
      R.think -= dt;
      // guard against an incoming claw now and then
      const threat = (COMBO.includes(P.state) || P.state === 'tail') && P.st < P.hitAt && dist - R.radius < 40 && R.alt < 24;
      if (threat && c.blocks && !R.blockRolled) { R.blockRolled = true; if (Math.random() < c.blocks + this.diff * 0.06) { R.state = 'block'; R.st = 0; m.react('block'); } }
      if (!threat) R.blockRolled = false;
      if (R.state === 'space' && R.think <= 0 && !resting) {
        R.think = Math.max(0.18, 0.4 + Math.random() * 0.5 - this.diff * 0.07);
        const d = this.pickAttack(dist);
        if (d) this.startAttack(d);
      }
      if (c.flying) { R.tire -= dt; if (R.tire <= 0 && R.state === 'space') { R.state = 'land'; R.st = 0; R.tire = 15 + Math.random() * 7; } }
    } else if (R.state === 'attack') {
      this.updateAttack(dt, dist, want);
    } else if (R.state === 'block') {
      R.yaw = turnToward(R.yaw, want, 3 * dt);
      if (R.st >= 0.7) { R.state = 'space'; R.st = 0; R.think = 0.15; }
    } else if (R.state === 'flinch' || R.state === 'roar') {
      if (c.flying) R.alt = Math.max(0, R.alt - 50 * dt);
      if (R.st >= (R.state === 'roar' ? 1.1 : 0.45)) { R.state = 'space'; R.st = 0; R.think = 0.35; }
    } else if (R.state === 'down') {
      // on the ground and open; brief invulnerability as it gets back up
      R.alt = Math.max(0, R.alt - 90 * dt);
      if (R.st >= 1.7) { R.state = 'space'; R.st = 0; R.inv = 0.5; R.lock = 4.5; R.think = 0.4; R.rest = 0.5; m.stop(); }
    } else if (R.state === 'land') {
      R.alt = damp(R.alt, 0, 2.6, dt);
      if (R.st >= 4.2) { R.state = 'space'; R.st = 0; }
    } else if (R.state === 'ko') {
      R.alt = Math.max(0, R.alt - 60 * dt);
      if (!m.rig || !m.rig.has || !(m.rig.has('death'))) m.root.rotation.z = damp(m.root.rotation.z, 1.4, 2, dt);
      if (R.alt <= 0 && !R.fell) { R.fell = true; this.groundHit(R.pos, 2.5); this.audio.boom(1); this.fx.shake(2); }
    }
    R.pos.addScaledVector(R.vel, dt); R.vel.multiplyScalar(Math.exp(-4 * dt));
    set.walk = damp(set.walk, walk, 8, dt); set.speed = R.speedNow;
    set.hurt = Math.max(0, R.hurtT * 3) + (R.state === 'down' && !m.rig.busy() ? 1.5 : 0);
    if (c.flying) { R.fly = damp(R.fly, R.alt > 10 ? 1 : 0, 5, dt); set.fly = R.fly; set.flap = R.alt > 4 ? 1 : 0.2; }
    m.flash(Math.max(0, R.hurtT * 1.6) + (R.rage ? 0.12 + Math.sin(this.t * 6) * 0.05 : 0));
    if (this.city && R.alt < 12 && this.phase !== 'intro') this.city.smash(R.pos.x, R.pos.z, 9, this.fx, this.audio);
  }

  updateAttack(dt, dist, want) {
    const R = this.R, P = this.P, A = R.atk, d = A.d, t = R.st, m = this.m, set = m.set, c = this.cfg;
    const wk = clamp(t / A.wind, 0, 1), ph = t < A.wind ? 0 : t < A.wind + A.act ? 1 : t < A.wind + A.act + A.rec ? 2 : 3;
    const ak = clamp((t - A.wind) / A.act, 0, 1), gyv = this.gy < 0 ? 0.5 : 0;
    if (ph === 3) {
      R.cds[d.id] = d.cd * (1.3 - this.diff * 0.1); set.charge = 0; if (set.dive !== undefined) set.dive = 0; this.hideRivalBeams();
      // sometimes follow a landed blow straight into another
      if (d.chain && A.hitPlayer && !A.chained && Math.random() < d.chain + this.diff * 0.08 && dist < d.max + 10) return this.startAttack(d, true);
      R.state = 'space'; R.st = 0; R.think = 0.3; R.rest = Math.max(0.35, 1.25 - this.diff * 0.22) * (R.rage ? 0.6 : 1);
      return;
    }
    if (ph === 0) R.yaw = turnToward(R.yaw, want, 3 * dt);
    if (ph >= 1 && !A.landedCall) { A.landedCall = true; m.landed(); }

    if (d.type === 'melee') {
      if (ph === 0) {
        if (c.flying) R.alt = damp(R.alt, 5, 5, dt);
        if (dist > R.radius + P.radius + 6) { R.pos.x += Math.sin(R.yaw) * c.speed * 0.9 * dt; R.pos.z += Math.cos(R.yaw) * c.speed * 0.9 * dt; }
        if (!A.warned && wk > 0.3) { A.warned = true; A.target.copy(P.pos); this.fx.warn(_a.set(P.pos.x, gyv, P.pos.z), d.r, A.wind * 0.7 + 0.05); }
      } else if (ph === 1 && !A.fired) {
        A.fired = true; this.audio.whoosh(1);
        if (!A.warned) A.target.copy(P.pos);
        if (flat(P.pos, A.target) < d.r) A.hitPlayer = this.hurtPlayer(d.dmg, R.pos, d.kb ?? 35);
        if (d.kb) this.groundHit(A.target, 1.4);
      }
    } else if (d.type === 'dive') {
      if (ph === 0) {
        if (c.flying && d.up) R.alt = damp(R.alt, d.up, 3, dt);
        if (wk < 0.62) A.target.copy(P.pos);
        else if (!A.warned) {
          A.warned = true; A.from.copy(R.pos); A.alt0 = R.alt;
          this.fx.warn(_a.set(A.target.x, gyv, A.target.z), d.r, A.wind * 0.38 + A.act * 0.8);
          this.audio.roar(0.5, c.pitch, 0.9, this.key); if (set.dive !== undefined) set.dive = 1;
        }
      } else if (ph === 1) {
        if (!A.warned) { A.warned = true; A.from.copy(R.pos); A.alt0 = R.alt; }
        R.pos.lerpVectors(A.from, A.target, ak); R.alt = A.alt0 + (d.low - A.alt0) * ak + (d.arc ? Math.sin(ak * Math.PI) * d.arc : 0);
        if (!A.fired && ak > 0.8) {
          A.fired = true;
          if (flat(P.pos, A.target) < d.r) A.hitPlayer = this.hurtPlayer(d.dmg, A.from, d.kb);
          this.groundHit(A.target, 2); this.fx.shake(1.5); this.audio.boom(0.7);
        }
      } else { if (c.flying) R.alt = damp(R.alt, d.low, 5, dt); if (set.dive !== undefined) set.dive = 0; }
    } else if (d.type === 'gust') {
      if (ph === 0) {
        if (c.flying) R.alt = damp(R.alt, 18, 3, dt);
        if (!A.warned) { A.warned = true; this.fx.warn(_a.set(R.pos.x, gyv, R.pos.z), d.r, A.wind, 0xffd27a, false); }
      } else if (ph === 1 && !A.fired) {
        A.fired = true; this.audio.whoosh(1.6); this.audio.roar(0.7, c.pitch, 1.2, this.key);
        this.center(R, _a); _b.set(P.pos.x - R.pos.x, 0, P.pos.z - R.pos.z).normalize();
        for (let i = 0; i < 40; i++) { _c.copy(_b).multiplyScalar(140 + Math.random() * 120); _c.x += (Math.random() - 0.5) * 120; _c.y = (Math.random() - 0.5) * 40; _c.z += (Math.random() - 0.5) * 120; this.fx.spawn(_a, _c, 0.9, 2.2, 0xe8e0d0, 0x8a8478, 0, 0.5, 1); }
        if (dist < d.r) this.hurtPlayer(d.dmg, R.pos, d.kb);
      }
    } else if (d.type === 'beam') {
      const mouths = m.mouths(), n = Math.min(d.n, mouths.length || 1), origin = this.center(R, _a).clone();
      if (mouths[0]) origin.y = mouths[0].y;
      if (ph === 0) {
        set.charge = wk;
        if (!A.snd) { A.snd = true; this.audio.charge(A.wind); }
        if (wk < 0.72) { this.center(P, _b); A.aim.x = damp(A.aim.x, _b.x, 6, dt); A.aim.y = _b.y; A.aim.z = damp(A.aim.z, _b.z, 6, dt); }
      } else if (ph === 1 && !A.fired) { A.fired = true; this.audio.beam(A.act); }
      const spread = ph === 0 ? 0.5 : 0.5 - 0.42 * ak;
      this.center(P, _b);
      for (let i = 0; i < 3; i++) {
        if (i >= n || ph === 2) { this.rBeam[i].off(); this.rWarn[i].off(); continue; }
        const off = (i - (n - 1) / 2) * spread;
        const dir = new V().subVectors(A.aim, origin); dir.applyAxisAngle(UP, off).normalize();
        const from = mouths[i] || mouths[0] || origin;
        let len = 560; if (dir.y < -0.02) len = Math.min(len, (from.y - this.gy) / -dir.y);
        const end = from.clone().addScaledVector(dir, len);
        if (ph === 0) { this.rWarn[i].set(from, end, 0.35); this.rBeam[i].off(); }
        else {
          this.rWarn[i].off(); this.rBeam[i].set(from, end, 3 + Math.sin(this.t * 50 + i) * 0.4);
          if (segDist(_b, from, end) < 13) this.burnPlayer(d.dps * dt, true);
          if (Math.random() < 0.12 && len < 559) { this.fx.explosion(end, 1.2); this.groundHit(end, 1); }
        }
      }
      if (ph === 2) set.charge = damp(set.charge, 0, 5, dt);
    } else if (d.type === 'volley') {
      if (ph === 0) set.charge = d.bolt ? wk : 0;
      else if (ph === 1 && !A.fired) {
        A.fired = true;
        const lead = Math.hypot(this.input.move.x, this.input.move.y) > 0.2 ? 1 : 0;
        const hand = m.mouths()[0] || this.center(R, new V());
        for (let i = 0; i < d.n; i++) {
          const target = P.pos.clone();
          if (i > 0) { target.x += (Math.random() - 0.5) * 70 + Math.sin(P.yaw) * this.input.move.y * 30 * lead; target.z += (Math.random() - 0.5) * 70 + Math.cos(P.yaw) * this.input.move.y * 30 * lead; }
          const s = { target, t: -i * (d.bolt ? 0.3 : 0.22), dur: d.fly, r: d.r, dmg: d.dmg, bolt: !!d.bolt, rock: !!d.rock, from: hand.clone(), warned: false, mesh: null };
          if (!d.bolt) { s.mesh = new THREE.Mesh(d.rock ? this.rockGeo : this.missileGeo, d.rock ? this.rockMat : this.missileMat); s.mesh.castShadow = true; s.mesh.visible = false; this.scene.add(s.mesh); }
          this.shots.push(s);
        }
      } else if (ph === 2) set.charge = damp(set.charge, 0, 4, dt);
    }
  }

  updateHazards(dt) {
    const P = this.P, gyv = this.gy < 0 ? 0.5 : 0;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i]; s.t += dt;
      if (s.t < 0) continue;
      if (!s.warned) { s.warned = true; this.fx.warn(_a.set(s.target.x, gyv, s.target.z), s.r, s.dur - s.t); if (!s.bolt) this.audio.whoosh(0.5); }
      const k = s.t / s.dur;
      if (s.mesh) {
        s.mesh.visible = true;
        _a.lerpVectors(s.from, s.target, k); _a.y = s.from.y * (1 - k) + this.gy * k + Math.sin(k * Math.PI) * 70;
        s.mesh.lookAt(_a); s.mesh.position.copy(_a); if (s.rock) s.mesh.rotation.x += s.t * 4;
        if (!s.rock && Math.random() < 0.6) { this.fx.hdr = 2; this.fx.spawn(_a, _b.set(0, 4, 0), 0.6, 1.4, 0xffc070, 0x555050, 0, 1.5, 1); this.fx.hdr = 1; }
      }
      if (k >= 1) {
        _a.set(s.target.x, this.gy + 3, s.target.z);
        if (s.bolt) {
          const bolt = new Beam(this.scene, 0xffe24a, 0xffffff); bolt.set(_b.set(s.target.x + 20, 420, s.target.z - 30), _a, 2.4);
          this.fx.items.push({ m: bolt.g, t: 0, dur: 0.22, tick: () => {} }); this.fx.items.push({ m: bolt.tip, t: 0, dur: 0.22, tick: () => {} });
          this.audio.zap(0.5);
        }
        if (s.rock) this.fx.debris(_a, 16, 1.6); else this.fx.explosion(_a, 1.7);
        this.audio.boom(0.5); this.groundHit(s.target, 1);
        if (flat(P.pos, s.target) < s.r + 3) this.hurtPlayer(s.dmg, s.target, 25);
        if (s.mesh) this.scene.remove(s.mesh);
        this.shots.splice(i, 1);
      }
    }
  }

  updateCamera(dt, snap) {
    const P = this.P, R = this.R;
    let dx = P.pos.x - R.pos.x, dz = P.pos.z - R.pos.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
    const back = 96 + clamp((d - 150) * 0.16, -12, 44);
    const side = this.city ? 0 : 22, up = this.city ? 92 : 46;
    _a.set(P.pos.x + dx * back - dz * side, this.gy + up + clamp(R.alt * 0.25, 0, 20), P.pos.z + dz * back + dx * side);
    _b.set(P.pos.x + (R.pos.x - P.pos.x) * 0.42, this.gy + 30 + R.alt * 0.42, P.pos.z + (R.pos.z - P.pos.z) * 0.42);
    if (this.phase === 'ko') {
      // slow orbit around whoever fell
      const L = this.won ? R : P; this.koT += this.realDt || 0;
      const a = Math.atan2(dx, dz) + this.koT * 0.35;
      _a.set(L.pos.x + Math.sin(a) * 105, this.gy + 34, L.pos.z + Math.cos(a) * 105); _b.set(L.pos.x, this.gy + 22, L.pos.z);
    }
    if (!this.look) this.look = _b.clone();
    if (snap) { this.camera.position.copy(_a); this.look.copy(_b); }
    else { const k = 1 - Math.exp(-4 * dt); this.camera.position.lerp(_a, k); this.look.lerp(_b, 1 - Math.exp(-6 * dt)); }
    if (this.camera.position.y < 6) this.camera.position.y = 6;
    this.camera.lookAt(this.look);
    // impact kick and a short field-of-view punch (real time, so they read during hit-stop)
    const rdt = this.realDt || dt;
    this.camera.position.add(this.kick); this.kick.multiplyScalar(Math.exp(-11 * rdt));
    if (this.fov > 0.01 || this.camera.fov !== 60) { this.fov *= Math.exp(-9 * rdt); this.camera.fov = 60 - this.fov; this.camera.updateProjectionMatrix(); }
    if (this.city) for (const b of this.city.b) {
      const cx = this.camera.position.x, cz = this.camera.position.z, ex = P.pos.x - cx, ez = P.pos.z - cz, l2 = ex * ex + ez * ez || 1;
      const k = clamp(((b.x - cx) * ex + (b.z - cz) * ez) / l2, 0, 1), off = Math.hypot(cx + ex * k - b.x, cz + ez * k - b.z);
      b.obj.visible = !(b.alive && k < 0.93 && off < b.w * 0.5 + 16);
    }
  }

  update(dt) {
    const P = this.P, R = this.R;
    if (this.bot) this.bot.update(dt);
    this.updatePlayer(dt);
    this.updateRival(dt);
    this.updateHazards(dt);
    if (this.phase === 'ko') {
      if (this.koT > 1.7) this.slow = damp(this.slow, 1, 3, this.realDt || dt);
      if (this.koT > 4.2 && !this.reported) { this.reported = true; if (this.won) this.audio.roar(1, 1, 2.4); this.game.brawlOver(this, this.won); }
    }
    // keep fighters apart and inside the arena
    if (R.alt < 25 && R.state !== 'ko' && P.state !== 'ko' && P.state !== 'dash') {
      const d = flat(P.pos, R.pos), min = P.radius + R.radius;
      if (d < min && d > 0.01) { const k = (min - d) / d, ax = (P.pos.x - R.pos.x) * k, az = (P.pos.z - R.pos.z) * k; P.pos.x += ax * 0.6; P.pos.z += az * 0.6; R.pos.x -= ax * 0.4; R.pos.z -= az * 0.4; }
    }
    const AR = this.arenaR || ARENA_R;
    for (const F of [P, R]) { const d = Math.hypot(F.pos.x, F.pos.z); if (d > AR) { F.pos.x *= AR / d; F.pos.z *= AR / d; } }

    this.g.root.position.set(P.pos.x, this.gy, P.pos.z); this.g.root.rotation.y = P.yaw; this.g.update(dt);
    this.m.root.position.set(R.pos.x, this.gy + R.alt, R.pos.z); this.m.root.rotation.y = R.yaw; this.m.update(dt);
    this.updateCamera(dt);
    this.focus.set((P.pos.x + R.pos.x) / 2, this.gy, (P.pos.z + R.pos.z) / 2);
    if (this.ocean) this.ocean.update(dt, this.camera);
    if (this.city) this.city.update(dt);
    if (this.arena === 'bay' && Math.random() < 0.3) { this.fx.splash(_a.set(P.pos.x + (Math.random() - 0.5) * 24, 1, P.pos.z + (Math.random() - 0.5) * 24), 0.8); if (R.alt < 10) this.fx.splash(_a.set(R.pos.x + (Math.random() - 0.5) * 30, 1, R.pos.z + (Math.random() - 0.5) * 30), 0.8); }

    this.vig = Math.max(0, this.vig - (this.realDt || dt) * 2.4); this.ui.vignette(this.vig);
    this.ui.bar('L', 'Godzilla', P.hp / P.max, P.energy / 100);
    this.ui.bar('R', this.cfg.name + (R.rage ? ' — enraged' : ''), R.hp / R.max);
  }
}
