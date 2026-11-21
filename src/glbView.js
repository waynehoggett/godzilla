import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { GameScene } from './core/scene.js';
import { setupSky, ground } from './world/sky.js';

// Dev tool: /?scene=glb&f=godzilla&a=0.8&clip=0&time=2
export class GlbView extends GameScene {
  constructor(game, q) {
    super(game);
    this.sky = setupSky(this.scene, 'day', {}, game.renderer);
    ground(this.scene, 0x6a6f66, 400);
    this.a = +(q.get('a') || 0.7); this.q = q;
    new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(`/models/${q.get('f') || 'godzilla'}.glb`, (g) => {
      const box = new THREE.Box3().setFromObject(g.scene), size = box.getSize(new THREE.Vector3());
      const k = 10 / size.y; g.scene.scale.setScalar(k); g.scene.position.y = -box.min.y * k;
      this.scene.add(g.scene); this.model = g.scene; window.__glb = g; window.__size = size.toArray();
      if (g.animations.length) { this.mixer = new THREE.AnimationMixer(g.scene); const c = this.mixer.clipAction(g.animations[+(q.get('clip') || 0)]); c.play(); this.mixer.setTime(+(q.get('time') || 0)); }
    });
  }
  update(dt) {
    const d = +(this.q.get('d') || 22), h = +(this.q.get('h') || 5);
    this.camera.position.set(Math.sin(this.a) * d, h + d * 0.12, Math.cos(this.a) * d); this.camera.lookAt(0, h, 0);
    if (this.mixer && this.q.has('play')) this.mixer.update(dt);
  }
}
