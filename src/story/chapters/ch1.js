import * as THREE from 'three/webgpu';
import { StoryScene, Walker, Turret } from '../storyScene.js';
import { clamp, turnToward } from '../../core/scene.js';
import { setupSky, ground } from '../../world/sky.js';
import { Ocean } from '../../world/ocean.js';
import { palms, beacon, hills } from '../../world/props.js';
import { makeGodzilla } from '../../models/godzilla.js';
import { makeZero } from '../../models/vehicles.js';
import { makeKoichi, makeSoldier } from '../../models/people.js';

const V = THREE.Vector3;
const ZERO = new V(30, 0, 130), GOAL = new V(150, 0, 45);
const _a = new V();

// Odo Island, 1945. Reach the Zero, fail to fire, run.
export class Ch1 extends StoryScene {
  constructor(game, opts) {
    super(game, opts);
    const s = this.scene;
    this.sky = setupSky(s, 'night', { near: 40, far: 720, sunI: 3.4, amb: 1.6, shadow: 90 }, game.renderer);
    ground(s, 0x4d4a3a, 1200);
    this.ocean = new Ocean(s, { y: -3, amp: 0.6, deep: 0x030d16, shallow: 0x123c50, sunCol: 0x9db4e0 });
    this.hills = hills(s, { z: 1250, x: -200, size: 1800, height: 260 });
    palms(s, 110, 170, 520, 0.9, (x, z) => Math.hypot(x - 30, z - 110) > 60);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(30, 0.1, 320), new THREE.MeshStandardMaterial({ color: 0x35332c, roughness: 1 }));
    strip.position.set(42, 0.05, 110); strip.rotation.y = 0.3; s.add(strip);
    const tentM = new THREE.MeshStandardMaterial({ color: 0x6b6a45, roughness: 1, flatShading: true });
    this.tents = [[-30, 60], [-48, 78], [-22, 86], [-58, 52], [-40, 100]].map(([x, z]) => { const t = new THREE.Mesh(new THREE.ConeGeometry(5, 4.5, 4), tentM); t.position.set(x, 2.2, z); t.rotation.y = Math.random(); s.add(t); return t; });
    const trench = new THREE.Mesh(new THREE.BoxGeometry(26, 0.2, 4), new THREE.MeshStandardMaterial({ color: 0x1c1a14 })); trench.position.set(0, 0.06, -3); s.add(trench);
    this.fire = new THREE.PointLight(0xff8a3a, 0, 220, 1.3); this.fire.position.set(-38, 8, 74); s.add(this.fire);

    this.zero = makeZero(); this.zero.root.position.copy(ZERO); this.zeroYaw = Math.atan2(-65, -60); this.zero.root.rotation.y = this.zeroYaw; s.add(this.zero.root);
    this.g = makeGodzilla({ lightScale: 0.2 }); this.g.root.scale.setScalar(1.6); s.add(this.g.root);
    this.G = { pos: new V(-85, 0, 125), yaw: 2.4, wp: 0, stepT: 0, speed: 0, lungeT: 2.5, lunge: null };
    this.soldiers = [[-6, -3], [5, -3.5], [10, -2.5]].map(([x, z]) => { const p = makeSoldier(); p.root.position.set(x, -0.5, z); p.root.rotation.y = 0.2; s.add(p.root); return p; });
    this.w = new Walker(s, makeKoichi(), 0, 0);
    this.beacon = beacon(s, ZERO.x, ZERO.z);
    this.audio.music('dread');
    if (this.cp >= 1) this.startRun(); else this.startReach();
    this.w.cam(this.camera, 0.016, 11, 5, true);
  }

  startReach() {
    this.go('reach');
    this.ui.objective('Reach your Zero');
    this.ui.controls([{ b: 'd', label: 'Sprint', key: 'Shift' }]);
    this.after(0.8, () => { this.audio.roar(0.9, 1.15, 2); this.fx.shake(1); });
    this.after(2.2, () => this.say('Tachibana', 'Shikishima! The guns on your Zero — it\'s the only thing that can hurt it. Go!', 5));
    this.after(9, () => this.phase === 'reach' && this.say('Tachibana', 'Stay wide of it! Don\'t let it see you!', 4));
  }
  startCockpit() {
    this.go('cockpit'); this.cp = 0; this.tries = 0;
    this.w.p.root.visible = false; this.beacon.visible = false;
    this.turret = new Turret(this, null); this.turret.jitter = 0.05;
    this.ui.objective('Aim at the creature and fire');
    this.ui.controls([{ b: 'a', label: 'Fire', key: 'Space' }], 'Aim');
    this.ui.prompt('FIRE');
    const f = new V(Math.sin(this.zeroYaw), 0, Math.cos(this.zeroYaw));
    this.cockTarget = ZERO.clone().addScaledVector(f, 48);
    this.camera.position.set(ZERO.x - f.x * 0.4, 3.5, ZERO.z - f.z * 0.4);
    this.say('Tachibana', 'You\'re in! Wait until it\'s close… now! Shoot!', 4);
  }
  startRun() {
    this.go('run'); this.cp = 1; this.hp = Math.max(this.hp, 70);
    if (this.turret) { this.turret.hide(); this.input.tapFire = false; this.turret = null; }
    this.ui.prompt(null);
    this.w.p.root.visible = true; this.w.pos.set(ZERO.x + 14, 0, ZERO.z - 11);
    this.w.camYaw = Math.atan2(GOAL.x - ZERO.x, GOAL.z - ZERO.z); this.w.yaw = this.w.camYaw;
    this.G.pos.set(ZERO.x - 34, 0, ZERO.z - 30); this.G.lungeT = 2.6;
    this.beacon.position.set(GOAL.x, 0, GOAL.z); this.beacon.visible = true;
    this.ui.objective('RUN — make for the trees');
    this.ui.controls([{ b: 'd', label: 'Sprint', key: 'Shift' }]);
    this.audio.roar(1, 1.15, 2.2); this.fx.shake(2); this.audio.music('battle');
    this.w.cam(this.camera, 0.016, 11, 5, true);
  }

  moveG(dt, tx, tz, speed, turn = 1.6) {
    const G = this.G, dx = tx - G.pos.x, dz = tz - G.pos.z, d = Math.hypot(dx, dz);
    G.yaw = turnToward(G.yaw, Math.atan2(dx, dz), turn * dt);
    if (d > 2) { G.pos.x += Math.sin(G.yaw) * speed * dt; G.pos.z += Math.cos(G.yaw) * speed * dt; G.speed = speed; } else G.speed = 0;
    return d;
  }

  update(dt) {
    const G = this.G, w = this.w, g = this.g;
    const dP = Math.hypot(G.pos.x - w.pos.x, G.pos.z - w.pos.z);
    this.fire.intensity = this.t > 6 ? 900 + Math.sin(this.t * 13) * 250 : 0;

    if (this.phase === 'reach') {
      const wps = [[-45, 95], [-30, 62], [-55, 55], [-75, 100], [-20, 100]], p = wps[G.wp % wps.length];
      if (this.moveG(dt, p[0], p[1], 7) < 4) {
        G.wp++; this.audio.roar(0.7, 1.15, 1.5);
        const t = this.tents[G.wp % this.tents.length]; if (t.visible) { t.visible = false; this.fx.explosion(t.position, 1.2); this.audio.boom(0.6); }
      }
      if (dP < 13 && !this.over) { if (this.damage(50, 'Godzilla found you in the open.')) { _a.subVectors(w.pos, G.pos).setY(0).normalize(); w.pos.addScaledVector(_a, 12); } }
      w.update(dt, this.input, !this.over);
      w.pos.z = clamp(w.pos.z, -8, 300); w.pos.x = clamp(w.pos.x, -120, 160);
      w.cam(this.camera, dt);
      if (w.pos.distanceTo(ZERO) < 6) this.startCockpit();
    } else if (this.phase === 'cockpit') {
      this.moveG(dt, this.cockTarget.x, this.cockTarget.z, 6, 1.2);
      g.headWorld(_a); this.camera.lookAt(_a.x, _a.y * 0.8, _a.z);
      this.turret.jitter = 0.05 + Math.min(0.3, this.pt * 0.03) + this.tries * 0.06;
      this.turret.update(dt, false);
      if (this.input.hit('a') && this.tries < 3) {
        const lines = ['Your thumb is on the trigger.', 'It will not move.', 'You cannot do it.'];
        this.say('', lines[this.tries], 2.4); this.tries++; this.audio.heartbeat(); this.vig = 0.8; this.fx.shake(0.4);
      }
      if ((this.tries >= 3 || this.pt > 11) && !this.froze) {
        this.froze = true; this.ui.prompt(null);
        this.after(1.6, () => this.say('Tachibana', 'Shikishima! What are you doing?! SHOOT!', 3));
        this.after(4.2, () => this.startRun());
      }
    } else if (this.phase === 'run') {
      // he crushes the plane first, then comes for you
      if (this.zero.root.visible) {
        if (this.moveG(dt, ZERO.x, ZERO.z, 13, 2.5) < 9) { this.zero.root.visible = false; this.fx.explosion(_a.set(ZERO.x, 3, ZERO.z), 2.5); this.audio.boom(1.2); }
      } else if (G.lunge) {
        const L = G.lunge; L.t += dt;
        if (L.t >= 1.0) {
          const k = clamp((L.t - 1.0) / 0.25, 0, 1);
          G.pos.lerpVectors(L.from, L.to, k); g.set.jaw = 1;
          if (k >= 1) {
            if (Math.hypot(w.pos.x - L.target.x, w.pos.z - L.target.z) < 7.5) this.damage(40, 'Godzilla caught you before the tree line.');
            this.fx.debris(L.target, 12, 1); this.audio.boom(0.7); this.fx.shake(1.5); G.lunge = null; G.lungeT = 2.3;
          }
        }
      } else {
        this.moveG(dt, w.pos.x, w.pos.z, 12.6, 2.2);
        G.lungeT -= dt; g.set.jaw = Math.max(0, g.set.jaw - dt * 3);
        if (G.lungeT <= 0 && dP < 75 && !this.over) {
          const s = Math.sin(w.yaw), c = Math.cos(w.yaw), target = new V(w.pos.x + s * w.speed * 0.45, 0, w.pos.z + c * w.speed * 0.45);
          const dir = _a.subVectors(target, G.pos).setY(0); const d = dir.length(); dir.normalize();
          G.lunge = { t: 0, target, from: G.pos.clone(), to: G.pos.clone().addScaledVector(dir, Math.max(0, d - 6)) };
          this.fx.warn(target, 7.5, 1.2);
        }
      }
      w.update(dt, this.input, !this.over);
      w.cam(this.camera, dt);
      if (!this.zero.root.visible && Math.random() < 0.25) this.fx.spawn(_a.set(ZERO.x + (Math.random() - 0.5) * 4, 2, ZERO.z + (Math.random() - 0.5) * 4), new V(0, 9, 0), 1.2, 1.2, 0xffb040, 0x302820, 0, 1.5);
      if (w.pos.distanceTo(GOAL) < 9 && !this.over) { this.say('', 'You run until the trees close over you. Behind you, the screaming stops.', 4); this.win(2.6); }
    }

    // Godzilla presentation
    g.root.position.set(G.pos.x, 0, G.pos.z); g.root.rotation.y = G.yaw;
    g.set.walk = G.speed > 0 ? Math.min(1, G.speed / 9) : 0;
    g.update(dt);
    if (G.speed > 0) { G.stepT -= dt; if (G.stepT <= 0) { G.stepT = 0.55; const k = clamp(1 - dP / 160, 0.1, 1); this.audio.step(0.5 * k); this.fx.shake(0.5 * k); } }
    this.beacon.material.opacity = 0.25 + Math.sin(this.t * 4) * 0.1;
    this.focus.copy(w.pos);
    this.hills.update(this.camera);
    this.ocean.update(dt, this.camera);
    if (this.phase !== 'cockpit') this.ui.meter('Stamina', w.stamina, '#e9c46a'); else this.ui.meter(null);
  }
}
