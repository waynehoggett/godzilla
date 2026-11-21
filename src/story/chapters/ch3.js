import * as THREE from 'three/webgpu';
import { StoryScene, Turret } from '../storyScene.js';
import { Beam } from '../../core/fx.js';
import { clamp, damp, turnToward } from '../../core/scene.js';
import { setupSky } from '../../world/sky.js';
import { Ocean } from '../../world/ocean.js';
import { makeGodzilla } from '../../models/godzilla.js';
import { makeMine, makeGun, makeWarship } from '../../models/vehicles.js';

const V = THREE.Vector3;
const _a = new V(), _b = new V();
const SURF = -19, DEEP = -85;

// The Shinsei Maru flees Godzilla. Stern gun, two mines, then the Takao.
export class Ch3 extends StoryScene {
  constructor(game, opts) {
    super(game, opts);
    this.hpName = 'Shinsei Maru';
    this.sky = setupSky(this.scene, 'day', { top: 0x4a6f98, bot: 0xc2ccd0, fog: 0xb0bcc2, far: 2400 }, game.renderer);
    this.ocean = new Ocean(this.scene, { amp: 1.1 });
    this.g = makeGodzilla(); this.g.root.scale.setScalar(5); this.scene.add(this.g.root);
    this.gp = new V(0, SURF, -260); this.gyaw = 0; this.close = 10; this.slow = 0; this.boatSpeed = 15;
    this.headPos = new V(); this.minePos = new V();
    this.turret = new Turret(this, makeGun());
    this.turret.add(this.headPos, 10, (p) => { this.slow = Math.min(7, this.slow + 0.55); if (Math.random() < 0.3) this.fx.burst(p, 3, 20, 0.4, 0.8, 0xfff0a0, 0xff7020); });
    this.mineTarget = this.turret.add(this.minePos, 8, () => this.hitMouthMine()); this.mineTarget.on = false;
    this.mine = makeMine(1.8); this.mine.visible = false; this.scene.add(this.mine); this.mineState = 'none';
    this.takao = makeWarship(125); this.takao.root.visible = false; this.scene.add(this.takao.root);
    this.beam = new Beam(this.scene);
    this.camera.position.set(0, 6, -9.5); this.camera.rotation.set(-0.04, 0, 0);
    this.audio.music('battle'); this.audio.engine(true, 'boat'); this.audio.engineSet(1.25, 0.16);
    this.setControls(false);
    if (this.cp >= 1) { this.gp.z = -170; this.go('hold2'); this.ui.objective('Hold him off'); }
    else {
      this.go('hold'); this.ui.objective('Hold him off — aim for the head');
      this.after(1, () => { this.audio.roar(1, 1, 2.2); this.say('Akitsu', 'It\'s coming! Full ahead! Shikishima, slow it down!', 4); });
      this.after(8, () => this.say('Mizushima', 'The thirteen-mil isn\'t even scratching it!', 3.5));
    }
  }
  setControls(mine, cover) {
    const c = [{ b: 'a', label: 'Fire', key: 'Space / Click' }];
    if (mine) c.push({ b: 'c', label: 'Mine', key: 'E' });
    if (cover) c.push({ b: 'd', label: 'Cover', key: 'Shift' });
    this.ui.controls(c, 'Aim (or mouse)');
  }
  get d() { return -this.gp.z; }

  bite() {
    if (this.damage(34, 'Godzilla caught the Shinsei Maru.')) { this.gp.z = -120; this.audio.roar(0.8, 1, 1.2); this.fx.splash(_a.set(0, 1, -14), 5); }
  }
  releaseMine() {
    this.mine.visible = true; this.mine.position.set(0, 0.5, -12); this.mineState = 'drift';
    this.ui.prompt(null); this.audio.splash(1);
  }
  hitMouthMine() {
    if (this.phase !== 'shoot') return;
    if (--this.mineHp > 0) return;
    this.mineTarget.on = false; this.mine.visible = false; this.mineState = 'none';
    this.fx.explosion(this.minePos, 6); this.fx.explosion(_a.copy(this.minePos).add(_b.set(4, 6, 2)), 4); this.fx.splash(this.minePos, 6);
    this.audio.boom(1.6); this.ui.flash('#fff2d0', 500, 0.8); this.fx.shake(2.5);
    this.g.set.headScale = 0.5; this.g.set.jaw = 0;
    this.go('sunk'); this.ui.objective('');
    this.say('Mizushima', 'You got it! Right in the mouth!', 3.5);
  }

  update(dt) {
    const g = this.g, pt = this.pt, ph = this.phase;
    this.ocean.scroll.y += this.boatSpeed * dt;
    this.ocean.update(dt, this.camera);
    this.camera.position.y = 6 + this.ocean.height(0, -9) * 0.4; this.camera.rotation.z = Math.sin(this.t * 0.8) * 0.02;
    if (Math.random() < 0.5 && this.boatSpeed > 5) this.fx.spawn(_a.set((Math.random() - 0.5) * 7, 0.3, -17), _b.set((Math.random() - 0.5) * 4, 1.5, -this.boatSpeed), 1.8, 0.45, 0xf4fbff, 0x9fc4d8, 4);
    const chasing = ['hold', 'mine1', 'hold2', 'mine2', 'shoot'].includes(ph);

    if (chasing) {
      this.slow = Math.max(0, this.slow - dt * 2.2);
      this.gp.z += Math.max(1.5, this.close - this.slow) * dt;
      this.gp.x = Math.sin(this.t * 0.45) * 7; this.gp.y = damp(this.gp.y, SURF, 2, dt);
      if (this.d < 44) this.bite();
      this.turret.update(dt, !this.over);
    }
    if (ph === 'hold' && pt > 13) { this.go('mine1'); this.say('Akitsu', 'Guns are useless! Let go a mine — blow it up under him!', 4); this.ui.prompt('RELEASE THE MINE'); this.setControls(true); }
    if (ph === 'hold2' && pt > 7) { this.go('mine2'); this.cp = 1; this.say('Noda', 'One mine left. Put it right in front of him!', 4); this.ui.prompt('RELEASE THE MINE'); this.setControls(true); }
    if ((ph === 'mine1' || ph === 'mine2') && this.mineState === 'none' && this.input.hit('c')) this.releaseMine();
    if (this.mineState === 'drift') {
      const m = this.mine.position;
      m.z -= 34 * dt; m.x = damp(m.x, this.gp.x, 1, dt); m.y = this.ocean.height(m.x, m.z) + 0.3; this.mine.rotation.x += dt;
      if (m.z < this.gp.z + 26) {
        if (ph === 'mine1') {
          this.mine.visible = false; this.mineState = 'none';
          this.fx.explosion(m, 5); this.fx.splash(m, 7); this.audio.boom(1.4); this.fx.shake(2);
          this.gp.z -= 55; this.go('hold2'); this.setControls(false);
          this.after(1.4, () => this.say('Noda', 'A direct hit and it hasn\'t even slowed…', 3.5));
        } else {
          this.mineState = 'mouth'; this.mineHp = 3; this.mineTarget.on = true; this.go('shoot'); this.close = 6.5; this.setControls(false);
          this.ui.objective('Shoot the mine in his mouth'); this.ui.prompt('SHOOT THE MINE', true);
          this.say('Akitsu', 'It\'s got the mine in its jaws — the wire\'s snapped! Shikishima, shoot it!', 5);
          this.after(2.5, () => this.ui.prompt(null));
        }
      }
    }
    if (this.mineState === 'mouth') { g.set.jaw = 1; g.mouthWorld(this.minePos); this.minePos.y -= 2; this.mine.position.copy(this.minePos); }

    if (ph === 'sunk') {
      this.gp.y = damp(this.gp.y, DEEP, 0.8, dt); this.boatSpeed = damp(this.boatSpeed, 3, 0.5, dt);
      if (pt > 5 && !this.s1) { this.s1 = true; this.audio.music('dread'); g.set.headScale = 1; this.gp.z = -190; this.go('regen'); }
    } else if (ph === 'regen') {
      this.gp.y = damp(this.gp.y, SURF, 1.2, dt); g.set.charge = 0.25 + Math.sin(this.t * 9) * 0.1;
      if (pt > 1.2 && !this.s2) { this.s2 = true; this.audio.roar(1, 1, 2.4); this.fx.splash(_a.set(this.gp.x, 1, this.gp.z), 8); this.say('Noda', 'It\'s healing. The flesh is knitting back together as we watch…', 5); }
      if (pt > 6) {
        this.go('takao'); g.set.charge = 0;
        this.takao.root.visible = true; this.takao.root.position.set(-330, 0, -330); this.takao.root.rotation.y = Math.PI / 2;
        this.say('Akitsu', 'Look — the Takao! She made it!', 4); this.audio.music('battle');
      }
    } else if (ph === 'takao' || ph === 'cover') {
      const T = this.takao.root, tt = this.t - this.takaoT0 || 0;
      if (!this.takaoT0) this.takaoT0 = this.t;
      if (tt < 7) {
        T.position.x = damp(T.position.x, -150, 0.5, dt);
        this.gyaw = turnToward(this.gyaw, Math.atan2(T.position.x - this.gp.x, T.position.z - this.gp.z), 0.8 * dt);
        this.gp.x += Math.sin(this.gyaw) * 9 * dt; this.gp.z += Math.cos(this.gyaw) * 9 * dt;
        if (Math.random() < dt * 2.2) { g.headWorld(_a); _a.x += (Math.random() - 0.5) * 30; _a.y -= Math.random() * 20; this.fx.explosion(_a, 2.5); this.audio.boom(0.6); }
      } else if (tt < 9.5) {
        this.gp.y = damp(this.gp.y, DEEP, 1.6, dt);
        if (!this.s3) { this.s3 = true; this.say('Mizushima', 'It went under!', 2.5); }
      } else {
        if (!this.s4) { this.s4 = true; this.gp.x = T.position.x + 34; this.gp.z = T.position.z + 8; this.gyaw = -Math.PI / 2; this.audio.roar(1, 1, 2.2); this.fx.splash(_a.set(this.gp.x, 1, this.gp.z), 10); this.fx.shake(1.5); }
        this.gp.y = damp(this.gp.y, SURF + 4, 2, dt); T.rotation.z = damp(T.rotation.z, 0.38, 1, dt);
        if (tt > 12 && ph === 'takao') { this.go('cover'); this.audio.charge(4.5); this.say('Noda', 'Its fins — they\'re lighting up. Everybody get down!', 4); }
        if (ph === 'cover') {
          g.set.charge = clamp(this.pt / 4.5, 0, 1); g.set.jaw = g.set.charge;
          if (this.pt > 1.3 && this.pt < 4.5 && !this.covered) { if (!this.promptOn) { this.promptOn = true; this.ui.prompt('TAKE COVER', true); this.setControls(false, true); } if (this.input.hit('d')) { this.covered = true; this.ui.prompt(null); this.say('', 'You drop behind the gunwale.', 2); } }
          if (this.covered) this.camera.position.y = damp(this.camera.position.y, 3.4, 6, dt);
          if (this.pt >= 4.5 && this.pt < 5.7) {
            if (!this.s5) { this.s5 = true; this.ui.prompt(null); this.audio.beam(1.2); }
            this.beam.set(g.mouthWorld(_a).clone(), _b.set(T.position.x, 6, T.position.z), 5); this.fx.shake(1.2);
          }
          if (this.pt >= 5.7 && !this.s6) {
            this.s6 = true; this.beam.off(); T.visible = false; g.set.charge = 0;
            this.ui.flash('#ffffff', 2600, 1); this.audio.boom(2); this.fx.shake(3);
            for (let i = 0; i < 7; i++) this.fx.explosion(_a.set(T.position.x + (i - 3) * 22, 12 + Math.random() * 30, T.position.z + (Math.random() - 0.5) * 30), 5);
            if (!this.covered) this.damage(55, 'The blast threw you across the deck.');
            this.after(2.2, () => this.say('Akitsu', 'A heavy cruiser… gone. In one breath.', 4));
            this.win(6);
          }
        }
      }
    }
    if (ph === 'takao' || ph === 'cover' || ph === 'sunk' || ph === 'regen') { this.turret.update(dt, false); this.boatSpeed = damp(this.boatSpeed, 3, 0.5, dt); }

    g.root.position.copy(this.gp); g.root.rotation.y = this.gyaw;
    g.set.swim = damp(g.set.swim, ph === 'cover' || (ph === 'takao' && this.s4) ? 0.15 : 0.8, 2, dt);
    g.set.walk = chasing ? 0.6 : 0.2;
    g.update(dt);
    g.headWorld(this.headPos);
    if (chasing && Math.random() < 0.6) this.fx.splash(_a.set(this.gp.x + (Math.random() - 0.5) * 30, 0.5, this.gp.z + 18 + Math.random() * 10), 1.6);
    if (chasing) this.ui.meter('Distance', clamp((this.d - 44) / 220, 0, 1), this.d < 90 ? '#c8321e' : '#e9c46a'); else this.ui.meter(null);
  }
}
