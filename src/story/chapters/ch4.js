import * as THREE from 'three/webgpu';
import { StoryScene, Walker } from '../storyScene.js';
import { Beam } from '../../core/fx.js';
import { clamp, damp } from '../../core/scene.js';
import { setupSky, ground } from '../../world/sky.js';
import { streetCity } from '../../world/city.js';
import { beacon } from '../../world/props.js';
import { makeGodzilla } from '../../models/godzilla.js';
import { makeKoichi, makeNoriko, Crowd } from '../../models/people.js';

const V = THREE.Vector3;
const _a = new V(), _b = new V();
const NORIKO_Z = 340, SAFE_Z = 225, CHARGE = 20;

// Ginza. Run up the street to Noriko, then get her out before the heat ray.
export class Ch4 extends StoryScene {
  constructor(game, opts) {
    super(game, opts);
    const s = this.scene;
    this.sky = setupSky(s, 'ash', { far: 900, shadow: 110 }, game.renderer);
    ground(s, 0x3b3a37, 1500, 0, { roughness: 0.85 });
    const lots = [];
    for (let z = -60; z <= 560; z += 30) for (const side of [1, -1]) {
      const w1 = 18 + Math.random() * 8;
      lots.push({ x: side * (13 + w1 / 2), z, w: w1, d: 24 + Math.random() * 4, h: 10 + Math.random() * 15 });
      const w2 = 20 + Math.random() * 10;
      lots.push({ x: side * (48 + w2 / 2), z: z + 6, w: w2, d: 26, h: 12 + Math.random() * 22 });
    }
    this.city = streetCity(s, lots, { interiors: !game.lite });
    const rail = new THREE.Mesh(new THREE.BoxGeometry(3, 0.12, 640), new THREE.MeshStandardMaterial({ color: 0x55524c, roughness: 1 })); rail.position.set(0, 0.06, 250); s.add(rail);

    this.g = makeGodzilla(); this.g.root.scale.setScalar(5); s.add(this.g.root);
    this.G = { pos: new V(-66, 0, 150), yaw: 0, stepT: 0, speed: 0 };
    this.beam = new Beam(s);
    this.crowd = new Crowd(s, 34);
    for (const p of this.crowd.members) { p.speed = 7 + Math.random() * 3; p.x = (Math.random() - 0.5) * 18; p.z = 20 + Math.random() * 100; p.yaw = Math.PI; }
    this.noriko = makeNoriko(); this.noriko.root.position.set(5, 0, NORIKO_Z); this.noriko.root.rotation.y = Math.PI; s.add(this.noriko.root); this.nSpeed = 0;
    this.w = new Walker(s, makeKoichi(), 0, 0);
    this.beacon = beacon(s, 5, NORIKO_Z, 0xffe9a0, 30, 1.2);
    this.tram = new THREE.Mesh(new THREE.BoxGeometry(3.6, 3.8, 15), new THREE.MeshStandardMaterial({ color: 0x4a5a3a, roughness: 0.8 })); this.tram.visible = false; s.add(this.tram);
    this.hazT = 2.5; this.hazards = [];
    this.audio.music('battle'); this.audio.loop('crowd', 0.35);
    this.ui.controls([{ b: 'd', label: 'Sprint', key: 'Shift' }]);
    if (this.cp >= 1) { this.w.pos.set(3, 0, NORIKO_Z - 3); this.tramDone = this.sweepDone = true; this.startFlee(); }
    else {
      this.go('find'); this.ui.objective('Find Noriko');
      this.after(1, () => { this.audio.roar(1, 1, 2.4); this.say('Koichi', 'Noriko… she\'s somewhere up this street.', 3.5); });
      this.after(7, () => this.say('', 'Red rings mark where wreckage will land. Keep moving.', 4));
    }
    this.w.cam(this.camera, 0.016, 12, 5.5, true);
  }

  startFlee() {
    this.go('flee'); this.cp = 1; this.hp = Math.max(this.hp, 70);
    this.beacon.position.set(-9, 0, SAFE_Z - 12); this.w.camYaw = 0; this.w.yaw = 0; this.look = 3.4;
    this.G.pos.set(0, 0, 500); this.G.yaw = Math.PI;
    this.city.smash(0, 500, 30, this.fx, this.audio);
    this.ui.objective('Run back the way you came');
    this.say('Noriko', 'Koichi?! Why did you come here?', 3);
    this.after(1.2, () => this.audio.roar(1, 1, 2.2));
    this.after(3.4, () => { this.w.camYaw = Math.PI; this.w.yaw = Math.PI; this.w.cam(this.camera, 0.016, 12, 5.5, true); this.say('Koichi', 'No time — run!', 2.5); });
    this.after(7, () => { this.audio.charge(CHARGE - 7); this.say('', 'Its dorsal fins are rising, one by one.', 4); });
    this.w.cam(this.camera, 0.016, 12, 5.5, true);
  }

  hazard(x, z, r, delay, dmg, why, big) {
    this.fx.warn(_a.set(x, 0, z), r, delay);
    this.hazards.push({ x, z, r, t: delay, dmg, why, big });
  }

  blast() {
    this.go('blast'); this.ui.objective(''); this.audio.loop('crowd', 0); this.ui.meter(null); this.beacon.visible = false;
    const safe = this.w.pos.z < SAFE_Z;
    this.audio.beam(1.5);
    this.after(1.5, () => {
      this.beam.off(); this.g.set.charge = 0;
      this.ui.flash('#ffffff', 3200, 1); this.audio.boom(2); this.fx.shake(3);
      if (!safe) return this.fail('The blast wave caught you both in the open street.');
      this.say('', 'Noriko shoves you into the gap between two buildings.', 4);
      this.noriko.root.visible = false; this.w.p.root.visible = false;
      this.go('cloud');
      const mat = new THREE.MeshStandardMaterial({ color: 0x5a4a40, roughness: 1, flatShading: true, emissive: 0xa03a12, emissiveIntensity: 0.9, fog: false });
      this.cloud = new THREE.Group(); this.cloud.position.set(430, 0, 240);
      const geo = new THREE.IcosahedronGeometry(1, 1);
      for (const [y, r] of [[40, 34], [90, 26], [140, 28], [185, 70], [210, 95]]) { const m = new THREE.Mesh(geo, mat); m.position.y = y; m.scale.set(r, r * 0.7, r); this.cloud.add(m); }
      this.cloud.scale.setScalar(0.3); this.scene.add(this.cloud);
      this.audio.music('dread');
      this.after(4.5, () => this.say('', 'Black rain begins to fall.', 3.5));
      this.after(8.5, () => this.say('Koichi', 'NORIKO!', 3));
      this.win(11.5);
    });
  }

  update(dt) {
    const w = this.w, G = this.G, g = this.g, ph = this.phase;
    this.look = Math.max(0, (this.look || 0) - dt);
    const ctrl = !this.over && (ph === 'find' || ph === 'flee') && this.look <= 0;

    if (ph === 'find') {
      const tz = clamp(w.pos.z + 115, 150, 440);
      G.speed = G.pos.z < tz ? 9 : 0; G.pos.z += G.speed * dt;
      if (w.pos.z > 140 && !this.tramDone) {
        this.tramDone = true; const z = w.pos.z + 40;
        this.hazard(0, z, 10, 1.9, 60, 'A tram car came down on top of you.', true);
        this.tram.position.set(-30, 60, z); this.tram.visible = true; this.tramZ = z; this.tramT = 0;
        this.say('', 'Look out — above you!', 2.5);
      }
      if (w.pos.z > 235 && !this.sweepDone) { this.sweepDone = true; for (const x of [-9, -3, 3]) this.hazard(x, w.pos.z + 26, 5.5, 1.5, 40, 'Godzilla\'s tail brought the street down on you.'); this.city.smash(-24, w.pos.z + 26, 16, this.fx, this.audio); this.say('', 'Its tail — keep right!', 2.5); }
      if (Math.hypot(w.pos.x - 5, w.pos.z - NORIKO_Z) < 5) this.startFlee();
    } else if (ph === 'flee') {
      G.speed = 4; G.pos.z -= G.speed * dt;
      const k = clamp(this.pt / CHARGE, 0, 1);
      g.set.charge = clamp((this.pt - 6) / (CHARGE - 6), 0, 1); g.set.jaw = g.set.charge; g.set.headPitch = -0.1;
      this.ui.meter('Heat ray', k, '#4db8ff');
      if (this.pt >= CHARGE) this.blast();
    } else if (ph === 'blast') {
      G.speed = 0;
      this.beam.set(g.mouthWorld(_a).clone(), _b.set(430, 30, 240), 7); this.fx.shake(1.5);
    } else if (ph === 'cloud') {
      this.cloud.scale.setScalar(Math.min(1.6, this.cloud.scale.x + dt * 0.14));
      this.camera.position.lerp(_a.set(w.pos.x, 46, w.pos.z), 1 - Math.exp(-0.7 * dt));
      this.camera.lookAt(_b.set(430, 110 * this.cloud.scale.x, 240));
      for (let i = 0; i < 4; i++) this.fx.spawn(_a.set(this.camera.position.x + (Math.random() - 0.3) * 60, 30 + Math.random() * 10, this.camera.position.z + (Math.random() - 0.5) * 60), _b.set(0, -45, 0), 0.9, 0.22, 0x101010, 0x101010);
    }

    // falling wreckage near the player
    if (ctrl) {
      this.hazT -= dt;
      if (this.hazT <= 0) {
        this.hazT = ph === 'find' ? Math.max(0.9, 1.7 - w.pos.z / 500) : 1.25;
        const dir = ph === 'find' ? 1 : -1;
        this.hazard(clamp(w.pos.x + (Math.random() - 0.5) * 16, -11, 11), w.pos.z + dir * (8 + Math.random() * 24), 5, 1.3, 34, 'You were buried under falling wreckage.');
      }
    }
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i]; h.t -= dt;
      if (h.t <= 0) {
        _a.set(h.x, 1, h.z); this.fx.debris(_a, h.big ? 30 : 14, h.big ? 2 : 1.1); this.audio.boom(h.big ? 1 : 0.45); this.fx.shake(h.big ? 2 : 0.8);
        if (h.big) this.fx.explosion(_a, 2.5);
        if (Math.hypot(w.pos.x - h.x, w.pos.z - h.z) < h.r && ctrl) this.damage(h.dmg, h.why);
        this.hazards.splice(i, 1);
      }
    }
    if (this.tram.visible && this.tramT < 1.9) { this.tramT += dt; const k = clamp(this.tramT / 1.9, 0, 1); this.tram.position.set(-30 + 30 * k, 60 * (1 - k * k) + 1.9, this.tramZ); this.tram.rotation.set(k * 2.2, 0.6, k * 1.4); }

    // movement + collisions
    if (ph === 'find' || ph === 'flee') {
      w.update(dt, this.input, ctrl);
      w.pos.x = clamp(w.pos.x, -12, 12); w.pos.z = clamp(w.pos.z, -20, NORIKO_Z + 8);
      if (this.tram.visible && this.tramT >= 1.9) { const dx = w.pos.x, dz = w.pos.z - this.tramZ, d = Math.hypot(dx, dz); if (d < 6) { w.pos.x += (dx / (d || 1)) * (6 - d); w.pos.z += (dz / (d || 1)) * (6 - d); } }
      if (this.look > 0) { this.camera.position.lerp(_a.set(w.pos.x + 4, 3, w.pos.z - 9), 1 - Math.exp(-4 * dt)); this.camera.lookAt(0, 38, G.pos.z); }
      else w.cam(this.camera, dt, 12, 5.5);
      if (ph === 'flee') {
        const n = this.noriko.root.position, d = Math.hypot(w.pos.x + 1.5 - n.x, w.pos.z + 2 - n.z);
        this.nSpeed = d > 1.5 ? Math.min(16, d * 4) : 0;
        if (this.nSpeed) { const yaw = Math.atan2(w.pos.x + 1.5 - n.x, w.pos.z + 2 - n.z); n.x += Math.sin(yaw) * this.nSpeed * dt; n.z += Math.cos(yaw) * this.nSpeed * dt; this.noriko.root.rotation.y = yaw; }
      }
    } else if (ph === 'blast') w.cam(this.camera, dt, 12, 5.5);
    this.noriko.update(dt, this.nSpeed);
    for (const p of this.crowd.members) {
      p.z -= p.speed * dt;
      if (ph === 'find' ? p.z < w.pos.z - 25 : p.z < w.pos.z - 80) { p.z = w.pos.z + (ph === 'find' ? 50 + Math.random() * 60 : 10 + Math.random() * 30); p.x = (Math.random() - 0.5) * 20; }
    }
    this.crowd.visible = ph !== 'cloud';
    this.crowd.update(dt);

    // Godzilla
    g.root.position.set(G.pos.x, 0, G.pos.z); g.root.rotation.y = G.yaw;
    g.set.walk = G.speed > 0 ? 0.7 : 0; g.update(dt);
    if (G.speed > 0) {
      G.stepT -= dt;
      if (G.stepT <= 0) { G.stepT = 0.9; const k = clamp(1 - Math.hypot(G.pos.x - w.pos.x, G.pos.z - w.pos.z) / 320, 0.15, 1); this.audio.step(0.8 * k); this.fx.shake(1.1 * k); this.city.smash(G.pos.x, G.pos.z, 22, this.fx, null); }
    }
    this.city.update(dt);
    this.focus.copy(w.pos);
    this.beacon.material.opacity = 0.3 + Math.sin(this.t * 4) * 0.1;
    if (ph === 'find') this.ui.meter('Stamina', w.stamina, '#e9c46a');
  }
}
