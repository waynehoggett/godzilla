import * as THREE from 'three/webgpu';
import { StoryScene, Plane } from '../storyScene.js';
import { clamp } from '../../core/scene.js';
import { setupSky } from '../../world/sky.js';
import { Ocean } from '../../world/ocean.js';
import { houses, beacon } from '../../world/props.js';
import { TerrainGenerator } from 'three/addons/generators/TerrainGenerator.js';
import { ForestGenerator } from 'three/addons/generators/ForestGenerator.js';
import { makeShinden, makeWarship } from '../../models/vehicles.js';
import { Hunter } from '../hunter.js';

const V = THREE.Vector3;
const _a = new V();
const START_Z = -430, TRENCH_Z = 1650;

// Fly the Shinden: provoke Godzilla on land and lead him out to the Sagami Trench.
export class Ch5 extends StoryScene {
  constructor(game, opts) {
    super(game, opts);
    this.hpName = 'Shinden';
    const s = this.scene;
    this.sky = setupSky(s, 'dawn', { far: 4600, near: 400 }, game.renderer);
    this.ocean = new Ocean(s, { size: 11000, deep: 0x0d2c44, shallow: 0x3a7a8c, sunCol: 0xffd2a0, sunDir: [0.2, 0.3, -0.9] });
    const land = new THREE.Mesh(new THREE.PlaneGeometry(12000, 5000).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x586c40, roughness: 1 })); land.position.set(0, 2.2, -2530); s.add(land);
    const beach = new THREE.Mesh(new THREE.PlaneGeometry(12000, 90).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xb8a67c, roughness: 1 })); beach.position.set(0, 2.25, -30); s.add(beach);
    houses(s, 170, () => [(Math.random() - 0.5) * 1700, -90 - Math.random() * 1000]);
    // mountains behind the coastal plain, carpeted with trees
    this.terrain = new TerrainGenerator({ seed: 4, size: 7000, segments: 200, heightScale: 620, frequency: 0.00035, seaLevel: 0.12 });
    const range = this.terrain.build(); range.position.set(0, -6, -4700); s.add(range);
    this.forest = new ForestGenerator({ count: 90000, radius: 9, height: 26, from: 2600, to: 4200, minScale: 0.7, maxScale: 1.6, densityFrequency: 0.0009 });
    const trees = this.forest.build(this.terrain); trees.position.copy(range.position); s.add(trees);
    for (const x of [-260, 260]) { const d = makeWarship(70); d.root.position.set(x, 0, TRENCH_Z + 80); d.root.rotation.y = Math.PI / 2; s.add(d.root); }
    this.mark = beacon(s, 0, TRENCH_Z, 0xffe9a0, 420, 14);
    this.plane = new Plane(this, makeShinden(), 330, 95, 80, Math.atan2(-330, START_Z - 80));
    this.plane.centre.set(0, 0, 500); this.plane.bound = 2500;
    this.H = new Hunter(this, this.plane, 0, START_Z, Math.PI);
    this.audio.engine(true); this.audio.music('battle');
    this.ui.objective('Buzz his head and open fire');
    this.ui.controls([{ b: 'a', label: 'Fire', key: 'Space' }, { b: 'd', label: 'Boost', key: 'Shift' }], 'Steer');
    this.after(1.5, () => this.say('Noda', 'Shikishima — he is heading inland. Make him angry and bring him out to the trench!', 5));
    this.warnT = 0; this.turned = false;
    this.plane.sync(0); this.plane.cam(this.camera, 0.016, true);
  }

  update(dt) {
    const H = this.H, pl = this.plane, live = !this.over;
    pl.update(dt, this.input, live);
    if (live) pl.fire(dt, this.input, H.hitTargets);
    pl.cam(this.camera, dt);
    if (pl.pos.z < 0 && pl.pos.y < 14) pl.pos.y = 14;

    const chase = H.aggro > 0.3;
    if (!H.ray || H.ray.t < H.ray.wind) {
      if (chase) { H.face(pl.pos, 0.75, dt); if (H.flatD === undefined || H.flatD > 70) H.advance(35 * dt); }
      else { H.face(_a.set(H.pos.x, 0, -6000), 0.4, dt); H.advance(11 * dt); }
    }
    H.pos.y = -28 * clamp((H.pos.z - 30) / 380, 0, 1);
    H.update(dt, live);
    if (H.moving !== undefined && Math.random() < 0.25) { _a.set(H.pos.x + (Math.random() - 0.5) * 30, 2, H.pos.z + (Math.random() - 0.5) * 30); if (H.pos.z < 30) this.fx.debris(_a, 3, 1.5, 0x6a5a40); else this.fx.splash(_a, 2.5); }

    if (chase && !this.turned) { this.turned = true; this.ui.objective('Lead him out to the sea marker'); this.say('Noda', 'He has turned! Keep him following — the destroyers are waiting past the marker.', 5); }
    this.warnT -= dt;
    if (this.turned && live && this.warnT <= 0) {
      if (!chase) { this.warnT = 9; this.say('Noda', 'He is losing interest. Go back and sting him again!', 3.5); }
      else if (H.flatD > 720) { this.warnT = 7; this.say('Noda', 'You are too far ahead of him — stay where he can see you.', 3.5); }
    }
    if (pl.outside && live && this.warnT < 5) { this.warnT = 6; this.say('', 'Turning back toward the bay.', 2); }

    this.ui.meter('To the trench', clamp((H.pos.z - START_Z) / (TRENCH_Z - START_Z), 0, 1), '#e9c46a');
    this.ui.bar('R', 'Godzilla\'s attention', H.aggro);
    this.mark.material.opacity = 0.22 + Math.sin(this.t * 3) * 0.08;
    this.ocean.update(dt, this.camera);
    this.forest.setCameraPosition(this.camera.position);
    if (H.pos.z < -1250) this.fail('Godzilla walked on into the city.');
    if (H.pos.z >= TRENCH_Z && live) { H.cancelRay(); this.say('Noda', 'He is over the trench! Destroyers — begin your run!', 4); this.win(3); }
  }
}
