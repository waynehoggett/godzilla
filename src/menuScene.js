import * as THREE from 'three';
import { GameScene } from './core/scene.js';
import { setupSky } from './world/sky.js';
import { Ocean } from './world/ocean.js';
import { makeGodzilla } from './models/godzilla.js';

// Backdrop for the menus: Godzilla wading in a night sea, fins pulsing.
export class MenuScene extends GameScene {
  constructor(game) {
    super(game);
    this.sky = setupSky(this.scene, 'night', { far: 1600, near: 120, hi: 2.6, sunI: 2.2 });
    this.ocean = new Ocean(this.scene, { deep: 0x030d16, shallow: 0x123c50, sunCol: 0x9db4e0, sunDir: [-0.5, 0.5, 0.35] });
    this.g = makeGodzilla();
    this.g.root.scale.setScalar(6); this.g.root.position.set(0, -24, 0);
    this.scene.add(this.g.root);
    this.rim = new THREE.DirectionalLight(0x6fa8ff, 3.2); this.rim.position.set(-60, 40, -80); this.scene.add(this.rim);
    this.ui.hud(false);
    this.audio.music('menu');
  }
  update(dt) {
    const t = this.t, a = t * 0.07 + 0.6;
    this.camera.position.set(Math.sin(a) * 105, 16 + Math.sin(t * 0.2) * 4, Math.cos(a) * 105);
    this.camera.lookAt(0, 26, 0);
    this.camera.rotateY(innerWidth > innerHeight ? 0.34 : 0);
    const cyc = (t % 14) / 14;
    this.g.set.charge = cyc > 0.45 && cyc < 0.9 ? Math.min(1, (cyc - 0.45) * 4) * (cyc > 0.82 ? (0.9 - cyc) * 12.5 : 1) : 0;
    this.g.set.jaw = this.g.set.charge * 0.8;
    this.g.update(dt);
    this.ocean.update(dt, this.camera);
  }
}
