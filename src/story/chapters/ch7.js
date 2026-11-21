import * as THREE from 'three/webgpu';
import { StoryScene, Plane } from '../storyScene.js';
import { Beam } from '../../core/fx.js';
import { clamp, damp, turnToward } from '../../core/scene.js';
import { setupSky } from '../../world/sky.js';
import { Ocean } from '../../world/ocean.js';
import { makeGodzilla } from '../../models/godzilla.js';
import { makeShinden, makeWarship, makeParachute } from '../../models/vehicles.js';
import { makeKoichi } from '../../models/people.js';

const V = THREE.Vector3;
const _a = new V(), _b = new V(), _c = new V();
const TIME = 48, WINDOW = 200, TOO_LATE = 30;

// The last flight: put the Shinden into Godzilla's mouth, and eject.
export class Ch7 extends StoryScene {
  constructor(game, opts) {
    super(game, opts);
    this.hpName = 'Shinden';
    const s = this.scene;
    this.sky = setupSky(s, 'dawn', { far: 4600, near: 400 }, game.renderer);
    this.ocean = new Ocean(s, { size: 11000, deep: 0x0d2c44, shallow: 0x3a7a8c, sunCol: 0xffd2a0, sunDir: [0.2, 0.3, -0.9] });
    this.g = makeGodzilla(); this.g.root.scale.setScalar(5); this.g.root.position.set(0, -20, 0); s.add(this.g.root);
    this.gyaw = Math.PI; this.mouth = new V();
    for (let i = 0; i < 2; i++) { const d = makeWarship(70); d.root.position.set(i ? 420 : -420, 0, 120); d.root.rotation.y = i * 2; s.add(d.root); }
    this.plane = new Plane(this, makeShinden(), 0, 170, -1150, 0);
    this.plane.bound = 1700;
    this.beam = new Beam(s); this.rays = [0, 1, 2, 3, 4].map(() => new Beam(s));
    this.audio.engine(true); this.audio.music('battle');
    this.go('run');
    this.ui.objective('Fly into his mouth, then eject');
    this.ui.controls([{ b: 'c', label: 'Eject', key: 'E' }, { b: 'd', label: 'Boost', key: 'Shift' }], 'Steer');
    this.after(1.2, () => { this.audio.roar(1, 1, 2.6); this.say('Noda', 'His fins are rising. If that heat ray fires, the whole fleet is gone.', 5); });
    this.after(7, () => this.say('Koichi', 'Then I end it. Here and now.', 3.5));
    this.audio.charge(6);
    this.plane.sync(0); this.plane.cam(this.camera, 0.016, true);
  }

  eject() {
    this.go('end'); this.ui.prompt(null); this.ui.marker(null); this.ui.reticle(null); this.ui.objective(''); this.ui.meter(null); this.ui.controls([], '');
    this.hpName = null; this.ui.bar('L', null);
    this.say('', 'You pull the lever Tachibana gave you.', 3);
    this.audio.whoosh(1.5);
    this.chute = makeParachute(); this.pilot = makeKoichi(); this.pilot.root.scale.setScalar(1.6);
    this.chute.root.add(this.pilot.root); this.chute.root.position.copy(this.plane.pos); this.chute.canopy.scale.setScalar(0.01);
    this.scene.add(this.chute.root); this.chuteV = new V(0, 34, 0).addScaledVector(this.plane.fwd(_a), 30);
    this.from = this.plane.pos.clone(); this.hitT = this.plane.pos.distanceTo(this.mouth) / 150;
    this.win(13);
  }

  update(dt) {
    const pl = this.plane, g = this.g, ph = this.phase;
    g.mouthWorld(this.mouth);
    const dist = pl.pos.distanceTo(this.mouth);

    if (ph === 'run') {
      const k = clamp(this.pt / TIME, 0, 1);
      pl.update(dt, this.input, !this.over);
      // buffeting as you get close
      if (dist < 600) { pl.pitch += (Math.random() - 0.5) * 0.012; pl.yaw += (Math.random() - 0.5) * 0.012; }
      pl.cam(this.camera, dt);
      this.gyaw = turnToward(this.gyaw, Math.atan2(pl.pos.x, pl.pos.z), 0.35 * dt);
      g.set.charge = 0.15 + k * 0.85; g.set.jaw = 1;
      g.set.headPitch = damp(g.set.headPitch, clamp(-Math.atan2(pl.pos.y - this.mouth.y, Math.max(60, dist)) * 0.7, -0.6, 0.2), 2, dt);
      const f = pl.fwd(_a), to = _b.subVectors(this.mouth, pl.pos).normalize(), ang = Math.acos(clamp(f.dot(to), -1, 1));
      const aligned = ang < 0.2, ready = aligned && dist < WINDOW;
      const p = this.project(this.mouth);
      if (p) this.ui.marker(p.x, p.y, `${Math.round(dist)} m`, ready); else this.ui.marker(null);
      this.ui.prompt(ready ? 'EJECT!' : null, true);
      this.ui.meter('Heat ray', k, '#4db8ff');
      if (this.input.hit('c') && !this.over) {
        if (ready) return this.eject();
        this.say('', dist >= WINDOW ? 'Not yet. Closer.' : 'Line up on his mouth first.', 1.8);
      }
      if (dist < TOO_LATE && !this.over) {
        if (aligned) { this.ui.flash('#fff', 900, 1); this.audio.boom(1.5); this.fail('You stayed with the plane. Tachibana gave you a way to live — use it.'); }
        else if (this.damage(35, 'Godzilla caught the Shinden in his jaws.')) this.say('', 'You clip his jaw and tear free. Come around again.', 3);
      }
      if (k >= 1 && !this.over) {
        this.beam.set(this.mouth.clone(), _c.set(420, 8, 120), 8); this.audio.beam(1.5);
        this.ui.flash('#ffffff', 2500, 1); this.audio.boom(2);
        this.fail('The heat ray fired. The fleet is gone.');
      }
    } else if (ph === 'end') {
      const t = this.pt;
      if (t < this.hitT) { pl.pos.lerpVectors(this.from, this.mouth, t / this.hitT); pl.sync(dt); this.audio.engineSet(1.4, 0.1); }
      else if (!this.boomed) {
        this.boomed = true; pl.m.root.visible = false; this.audio.engine(false); g.set.headScale = 0.02; g.set.charge = 1;
        this.ui.flash('#ffffff', 1600, 1); this.audio.boom(2); this.fx.shake(3);
        for (let i = 0; i < 6; i++) this.fx.explosion(_a.copy(this.mouth).add(_b.set((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 24, (Math.random() - 0.5) * 30)), 5);
        this.audio.music('hope');
        this.after(2.5, () => this.say('', 'Light pours out of him. Godzilla breaks apart and slides into the sea.', 5));
        this.after(8, () => this.say('', 'Below you, on every deck, the crews are saluting.', 4.5));
      }
      // parachute
      const c = this.chute.root;
      this.chuteV.y = damp(this.chuteV.y, -5, 0.9, dt); this.chuteV.x *= 1 - dt * 0.6; this.chuteV.z *= 1 - dt * 0.6;
      c.position.addScaledVector(this.chuteV, dt); if (c.position.y < 40) c.position.y = 40;
      this.chute.canopy.scale.setScalar(damp(this.chute.canopy.scale.x, 1, 2, dt) * 1); this.chute.canopy.scale.set(3.4 * this.chute.canopy.scale.x / Math.max(1, this.chute.canopy.scale.x), 2.4, 3.4);
      c.rotation.z = Math.sin(this.t * 1.3) * 0.12;
      // camera behind the pilot, looking at Godzilla
      _a.copy(c.position).add(_b.set(Math.sin(this.t * 0.15) * 26, 6, -34));
      this.camera.position.lerp(_a, 1 - Math.exp(-2.5 * dt));
      this.camera.lookAt(_c.set(0, 30, 0).lerp(c.position, 0.35));
      if (this.boomed) {
        const k = clamp((t - this.hitT) / 7, 0, 1);
        g.root.position.y = -20 - k * 70; g.root.rotation.z = k * 0.5; g.set.charge = 1 - k;
        _a.set(g.root.position.x, 30 - k * 40, g.root.position.z);
        this.rays.forEach((r, i) => { if (k >= 0.8) return r.off(); const a = i * 1.26 + this.t * 0.4; r.set(_a, _b.set(_a.x + Math.cos(a) * 220, _a.y + 120 + Math.sin(a * 2 + this.t) * 60, _a.z + Math.sin(a) * 220), 2.2 * (1 - k)); });
        if (Math.random() < 0.5) this.fx.splash(_b.set((Math.random() - 0.5) * 60, 1, (Math.random() - 0.5) * 60), 2.2);
      }
    }
    g.root.rotation.y = this.gyaw;
    g.update(dt);
    this.ocean.update(dt, this.camera);
  }
}
