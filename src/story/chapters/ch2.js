import * as THREE from 'three/webgpu';
import { StoryScene, Turret } from '../storyScene.js';
import { setupSky } from '../../world/sky.js';
import { Ocean } from '../../world/ocean.js';
import { makeShinsei, makeMine, makeGun } from '../../models/vehicles.js';

const V = THREE.Vector3;
const WAVES = [3, 4, 7];
const _a = new V();

// Minesweeping aboard the Shinsei Maru. Teaches the deck gun.
export class Ch2 extends StoryScene {
  constructor(game, opts) {
    super(game, opts);
    this.hpName = 'Shinsei Maru';
    this.sky = setupSky(this.scene, 'day', {}, game.renderer);
    this.ocean = new Ocean(this.scene, { amp: 0.8 });
    this.boat = makeShinsei(); this.scene.add(this.boat.root);
    this.turret = new Turret(this, makeGun());
    this.mines = []; this.cleared = 0; this.total = WAVES.reduce((a, b) => a + b, 0); this.wave = 0; this.fish = [];
    this.ui.objective('Shoot the mines before they reach the boat');
    this.ui.controls([{ b: 'a', label: 'Fire', key: 'Space / Click' }], 'Aim (or mouse)');
    this.audio.music('menu');
    this.go('sweep');
    this.after(1.2, () => this.say('Akitsu', 'Shikishima, you\'re on the gun. The cable\'s cut — pop them as they come up!', 5));
    this.after(3.5, () => this.spawnWave());
    this.place();
  }

  spawnWave() {
    const n = WAVES[this.wave], maxAng = Math.atan(Math.tan(Math.PI / 6) * this.camera.aspect) * 0.8;
    for (let i = 0; i < n; i++) {
      const ang = (Math.random() - 0.5) * 2 * maxAng, dist = 95 + Math.random() * 60 + i * 9;
      const mesh = makeMine(1.5); mesh.position.set(Math.sin(ang) * dist, 0, Math.cos(ang) * dist + 6); this.scene.add(mesh);
      const m = { mesh, hp: 3, speed: 3.4 + this.wave * 1.3 + Math.random() * 1.2, alive: true };
      m.target = this.turret.add(mesh.position, 3.6, () => this.hitMine(m));
      this.mines.push(m);
    }
  }
  hitMine(m) {
    if (!m.alive) return;
    if (--m.hp > 0) return;
    this.removeMine(m);
    this.cleared++;
    this.fx.explosion(m.mesh.position, 2.4); this.fx.splash(m.mesh.position, 3); this.audio.boom(0.9);
    if (!this.mines.length && this.phase === 'sweep') {
      this.wave++;
      if (this.wave < WAVES.length) {
        this.say(...[['Mizushima', 'Nice shooting! More coming up to port!'], ['Noda', 'Steady. This last field is a big one, and the swell is carrying them faster.']][this.wave - 1], 4.5);
        this.after(2.6, () => this.spawnWave());
      } else this.finish();
    }
  }
  removeMine(m) { m.alive = false; m.target.on = false; this.scene.remove(m.mesh); this.mines.splice(this.mines.indexOf(m), 1); }

  finish() {
    this.go('fish'); this.ui.objective(''); this.turret.hide();
    this.say('Akitsu', 'That\'s the lot. Not bad for a pilot.', 3.5);
    this.after(4, () => {
      const mat = new THREE.MeshStandardMaterial({ color: 0xd8d2c8, roughness: 0.6 }), geo = new THREE.SphereGeometry(1, 8, 6);
      for (let i = 0; i < 46; i++) {
        const f = new THREE.Mesh(geo, mat); f.scale.set(0.5, 0.35, 1.5 + Math.random());
        f.position.set((Math.random() - 0.5) * 90, -6 - Math.random() * 8, 14 + Math.random() * 70); f.rotation.y = Math.random() * 6;
        this.scene.add(f); this.fish.push(f);
      }
      this.audio.music('dread');
      this.say('Noda', 'Deep-sea fish… floating belly up. Something very large is driving them to the surface.', 6);
    });
    this.after(11, () => this.say('Akitsu', '…Let\'s get home.', 3));
    this.win(14);
  }

  place() {
    const h = this.ocean.height(0, 0) * 0.5;
    this.boat.root.position.y = h; this.boat.root.rotation.x = Math.sin(this.t * 0.9) * 0.025; this.boat.root.rotation.z = Math.sin(this.t * 0.7) * 0.03;
    this.camera.position.set(0, 6.2 + h, 8.5);
    this.camera.rotation.set(Math.sin(this.t * 0.9) * 0.012 - 0.06, Math.PI, Math.sin(this.t * 0.7) * 0.015);
  }

  update(dt) {
    this.place();
    this.ocean.update(dt, this.camera);
    if (this.phase === 'sweep') this.turret.update(dt, !this.over);
    for (const m of [...this.mines]) {
      const p = m.mesh.position, d = Math.hypot(p.x, p.z - 2);
      p.x -= (p.x / d) * m.speed * dt; p.z -= ((p.z - 2) / d) * m.speed * dt;
      p.y = this.ocean.height(p.x, p.z) + 0.2; m.mesh.rotation.y += dt * 0.4; m.mesh.rotation.x = Math.sin(this.t + p.x) * 0.2;
      if (d < 10.5) {
        this.removeMine(m);
        this.fx.explosion(p, 2.6); this.fx.splash(p, 3); this.audio.boom(1.2);
        this.damage(34, 'A mine reached the hull of the Shinsei Maru.');
        if (!this.mines.length && this.phase === 'sweep' && !this.over) { this.wave++; if (this.wave < WAVES.length) this.after(2.2, () => this.spawnWave()); else this.finish(); }
      }
    }
    for (const f of this.fish) f.position.y = Math.min(this.ocean.height(f.position.x, f.position.z) + 0.1, f.position.y + dt * 2.2);
    if (this.phase === 'sweep') this.ui.meter(`Mines cleared ${this.cleared} / ${this.total}`, this.cleared / this.total, '#e9c46a'); else this.ui.meter(null);
  }
}
