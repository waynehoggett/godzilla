import * as THREE from 'three';
import { StoryScene, Plane } from '../storyScene.js';
import { Beam } from '../../core/fx.js';
import { clamp, damp } from '../../core/scene.js';
import { setupSky } from '../../world/sky.js';
import { Ocean } from '../../world/ocean.js';
import { makeShinden, makeWarship, makeTug, makeBalloon } from '../../models/vehicles.js';
import { Hunter } from '../hunter.js';

const V = THREE.Vector3;
const _a = new V(), _b = new V(), UP = new V(0, 1, 0);
const SURF = -26, RING = 320;

// Operation Wada Tsumi: keep Godzilla's eyes on you while the destroyers wrap the cable, then haul him up.
export class Ch6 extends StoryScene {
  constructor(game, opts) {
    super(game, opts);
    this.hpName = 'Shinden';
    const s = this.scene;
    this.sky = setupSky(s, 'dawn', { far: 4600, near: 400 });
    this.ocean = new Ocean(s, { size: 11000, deep: 0x0d2c44, shallow: 0x3a7a8c, sunCol: 0xffd2a0, sunDir: [0.2, 0.3, -0.9] });
    this.plane = new Plane(this, makeShinden(), 0, 150, -760, 0);
    this.plane.bound = 1500;
    this.H = new Hunter(this, this.plane, 0, 0, Math.PI); this.H.pos.y = SURF; this.H.rayEvery = 13; this.H.aggro = 0.8;
    this.ships = ['Yukikaze', 'Hibiki'].map((name, i) => { const m = makeWarship(70); s.add(m.root); return { m, name, a: i * Math.PI, pos: new V() }; });
    this.shipHp = 2; this.wrap = 0; this.shipCharge = 0; this.shipBeamT = 0; this.shipBeam = new Beam(s);
    const cm = new THREE.MeshBasicMaterial({ color: 0x15171a });
    this.cables = this.ships.map(() => { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 5), cm); c.visible = false; s.add(c); return c; });
    this.tugs = []; this.balloons = []; this.depth = 0; this.orbit = 0;
    this.audio.engine(true); this.audio.music('battle');
    this.placeShips(0);
    if (this.cp >= 1) this.startSink();
    else {
      this.go('wrap');
      this.ui.objective('Keep his attention on you');
      this.ui.controls([{ b: 'a', label: 'Fire', key: 'Space' }, { b: 'd', label: 'Boost', key: 'Shift' }], 'Steer');
      this.after(1.5, () => this.say('Noda', 'Yukikaze, Hibiki — begin circling. Shikishima, do not let him look at the ships!', 5));
    }
    this.plane.sync(0); this.plane.cam(this.camera, 0.016, true);
  }

  placeShips(dt) {
    for (const sh of this.ships) {
      if (this.phase === 'wrap') sh.a += dt * 0.11;
      const r = this.phase === 'wrap' ? RING : 380;
      sh.pos.set(Math.cos(sh.a) * r, 0, Math.sin(sh.a) * r);
      sh.m.root.position.copy(sh.pos); sh.m.root.position.y = this.ocean.height(sh.pos.x, sh.pos.z) * 0.3;
      sh.m.root.rotation.y = -sh.a + (this.phase === 'wrap' ? 0 : Math.PI / 2);
    }
  }
  link(mesh, a, b) {
    _b.subVectors(b, a); const len = _b.length();
    mesh.position.copy(a).addScaledVector(_b, 0.5); mesh.quaternion.setFromUnitVectors(UP, _b.normalize()); mesh.scale.set(1, len, 1); mesh.visible = true;
  }

  startSink() {
    this.go('sink'); this.cp = 1; this.wrap = 1; this.H.cancelRay(); this.H.aggro = 0; this.shipBeam.off();
    this.ui.objective(''); this.ui.bar('R', null); this.ui.controls([], '');
    this.plane.auto = () => ({ x: 0.3, y: clamp((170 - this.plane.pos.y) * 0.02, -1, 1) });
    this.audio.music('dread');
    const say = (t, who, text, d = 4) => this.after(t, () => this.say(who, text, d));
    say(0.5, 'Noda', 'The loop is closed! Activate the Freon tanks!');
    this.after(1.5, () => { this.audio.boom(1); this.fx.shake(1.5); });
    say(9, 'Noda', 'Fifteen hundred metres… and it is still moving.');
    say(12.5, 'Noda', 'Inflate the balloons. Bring it up — fast!');
    this.after(13.5, () => { for (let i = 0; i < 6; i++) { const b = makeBalloon(9); b.position.set(Math.cos(i) * 80, -12, Math.sin(i) * 80); this.scene.add(b); this.balloons.push(b); } this.audio.splash(1); });
    this.after(18.5, () => { const b = this.balloons.pop(); this.fx.explosion(b.position, 3); this.scene.remove(b); this.audio.boom(0.8); this.say('Akitsu', 'It bit through a balloon! It has stopped at eight hundred metres!', 4.5); });
    say(23, 'Noda', 'Then we pull it up ourselves. Both ships, full power!');
    this.after(26.5, () => {
      for (let i = 0; i < 8; i++) { const t = makeTug(); const a = i * 0.785 + 0.4; t.a = a; t.r = 900; this.scene.add(t.root); this.tugs.push(t); }
      this.say('Mizushima', 'Shinsei Maru and every tugboat in the bay, reporting for duty!', 5); this.audio.music('hope');
    });
    this.after(32, () => {
      this.go('heave'); this.good = 0;
      this.ui.objective('HEAVE when the mark is in the green');
      this.ui.controls([{ b: 'a', label: 'Heave', key: 'Space' }], '');
    });
  }

  update(dt) {
    const H = this.H, pl = this.plane, ph = this.phase, live = !this.over;
    this.placeShips(dt);
    pl.update(dt, this.input, live && ph === 'wrap');

    if (ph === 'wrap') {
      if (live) pl.fire(dt, this.input, H.hitTargets);
      pl.cam(this.camera, dt);
      const onMe = H.aggro >= 0.4;
      H.canRay = onMe;
      if (this.shipBeamT > 0) {
        // firing on a destroyer
        this.shipBeamT -= dt; const sh = this.target;
        this.shipBeam.set(H.g.mouthWorld(_a).clone(), _b.set(sh.pos.x, 8, sh.pos.z), 6); H.g.set.jaw = 1; this.fx.shake(0.5);
        if (this.shipBeamT <= 0) {
          this.shipBeam.off(); H.g.set.charge = 0; this.shipHp--;
          this.fx.explosion(_a.set(sh.pos.x, 10, sh.pos.z), 5); this.audio.boom(1.5);
          if (this.shipHp <= 0) this.fail('The destroyers were lost before the cable was closed.');
          else this.say('Akitsu', `${sh.name} is hit! She cannot take another one!`, 4);
        }
      } else if (onMe) {
        if (this.shipCharge > 0) { this.shipCharge = 0; H.g.set.charge = 0; this.say('Noda', 'That is it — he is back on you!', 2.5); }
        if (!H.ray || H.ray.t < H.ray.wind) H.face(pl.pos, 0.8, dt);
      } else if (!H.ray) {
        const sh = this.target = this.ships.reduce((a, b) => (H.facing(a.pos) < H.facing(b.pos) ? a : b));
        H.face(sh.pos, 0.5, dt);
        if (H.facing(sh.pos) < 0.35) {
          if (this.shipCharge === 0) { this.say('Noda', `He is turning on the ${sh.name}! Get his attention!`, 3.5); this.audio.charge(6); }
          this.shipCharge += dt; H.g.set.charge = this.shipCharge / 6;
          if (this.shipCharge >= 6) { this.shipCharge = 0; this.shipBeamT = 1.2; this.audio.beam(1.2); }
        }
      }
      if (this.shipBeamT <= 0) this.wrap = Math.min(1, this.wrap + dt / 50);
      H.update(dt, live && onMe);
      this.ui.meter('Cable', this.wrap, '#e9c46a');
      this.ui.bar('R', 'Godzilla\'s attention', H.aggro);
      if (this.wrap >= 1 && live) this.startSink();
    } else {
      // cinematic camera circling the operation
      this.orbit += dt * 0.07;
      _a.set(Math.sin(this.orbit) * 520, 150, Math.cos(this.orbit) * 520);
      this.camera.position.lerp(_a, 1 - Math.exp(-1.5 * dt)); this.camera.lookAt(0, 10, 0);
      const pt = this.pt;
      if (ph === 'sink') {
        if (pt < 9) this.depth = damp(this.depth, 1500, 0.55, dt);
        else if (pt > 13.5 && pt < 18.5) this.depth = damp(this.depth, 800, 0.9, dt);
        else if (pt >= 18.5) this.depth = damp(this.depth, 800, 3, dt);
        if (pt < 6 && Math.random() < 0.7) this.fx.splash(_a.set((Math.random() - 0.5) * 90, 1, (Math.random() - 0.5) * 90), 4);
        this.ui.meter(`Depth ${Math.round(this.depth)} m`, this.depth / 1500, '#4db8ff');
      } else if (ph === 'heave') {
        const speed = 0.75 + this.good * 0.09, half = Math.max(0.065, 0.12 - this.good * 0.006);
        const x = (pt * speed) % 2, p = x < 1 ? x : 2 - x;
        this.ui.timing(p, 0.5 - half, 0.5 + half);
        if (this.input.hit('a')) {
          if (Math.abs(p - 0.5) <= half) { this.good++; this.depth -= 118; this.audio.hit(0.8); this.fx.shake(0.8); this.ui.banner('HEAVE!', '', 500); for (const s of [...this.ships, ...this.tugs]) this.fx.splash(_a.set((s.pos || s.root.position).x, 1, (s.pos || s.root.position).z), 2); }
          else { this.depth = Math.min(800, this.depth + 35); this.audio.click(); this.say('', 'Out of time with the others — the cable slips.', 1.6); }
        }
        this.ui.meter(`Depth ${Math.max(0, Math.round(this.depth))} m`, this.depth / 800, '#4db8ff');
        if (this.depth <= 0) {
          this.go('surface'); this.ui.timing(null); this.ui.objective(''); this.ui.meter(null);
          this.audio.roar(1, 1, 2.6); this.audio.boom(1.5); this.fx.shake(3); this.ui.flash('#dff3ff', 700, 0.7);
          for (let i = 0; i < 10; i++) this.fx.splash(_a.set((Math.random() - 0.5) * 80, 1, (Math.random() - 0.5) * 80), 9);
          this.audio.music('battle');
          this.say('Noda', 'It is up! …And it is still alive.', 4);
          this.win(4.5);
        }
      }
      H.pos.y = ph === 'surface' ? damp(H.pos.y, SURF + 6, 3, dt) : SURF - (this.depth / 1500) * 260;
      H.g.set.charge = ph === 'surface' ? 0.3 : 0;
      H.update(dt, false);
      for (const b of this.balloons) b.position.y = damp(b.position.y, 6 + Math.sin(this.t * 2 + b.position.x) * 0.6, 1.5, dt);
      for (const t of this.tugs) { t.r = damp(t.r, 470, 0.5, dt); t.root.position.set(Math.cos(t.a) * t.r, this.ocean.height(0, t.a * 50) * 0.3, Math.sin(t.a) * t.r); t.root.rotation.y = -t.a + Math.PI / 2; }
    }
    // cables from the ships down to him
    const show = this.wrap > 0.15 && this.phase !== 'surface';
    this.cables.forEach((c, i) => { if (!show) { c.visible = false; return; } const sh = this.ships[i]; this.link(c, _a.set(sh.pos.x, 5, sh.pos.z).clone(), new V(H.pos.x, Math.max(-40, H.pos.y + 30), H.pos.z)); });
    this.ocean.update(dt, this.camera);
  }
}
