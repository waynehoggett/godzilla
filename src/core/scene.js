import * as THREE from 'three/webgpu';
import { pass } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { FX } from './fx.js';

// Base for every 3D scene: owns the THREE scene/camera, effects, timers and cleanup.
export class GameScene {
  constructor(game, opts = {}) {
    this.game = game; this.opts = opts; this.ui = game.ui; this.input = game.input; this.audio = game.audio;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.5, 9000);
    this.fx = new FX(this.scene);
    this.t = 0; this.timers = []; this.over = false; this.focus = new THREE.Vector3();
    // HDR scene pass + bloom: anything brighter than white (fins, heat ray, fire) glows
    const scenePass = pass(this.scene, this.camera), colour = scenePass.getTextureNode('output');
    this.bloom = bloom(colour, 0.55, 0.6, 1.0);
    this.pipeline = new THREE.RenderPipeline(game.renderer);
    this.pipeline.outputNode = game.lite ? colour : colour.add(this.bloom);
  }
  after(sec, fn) { this.timers.push({ t: this.t + sec, fn }); }
  say(who, text, dur) { this.ui.subtitle(who, text, dur); }
  tick(dt) {
    this.t += dt;
    for (let i = this.timers.length - 1; i >= 0; i--) if (this.timers[i].t <= this.t) this.timers.splice(i, 1)[0].fn();
    this.update(dt);
    this.fx.update(dt);
    if (this.sky) this.sky.follow(this.camera, this.focus);
    this.fx.applyShake(this.camera);
  }
  update() {}
  // Project a world point to NDC; returns null when behind the camera.
  project(v) {
    const p = v.clone().project(this.camera);
    return p.z > 1 || p.z < -1 ? null : p;
  }
  render() { this.pipeline.render(); }
  dispose() {
    this.pipeline.dispose();
    this.audio.engine(false);
    this.input.tapFire = false;
    if (this.city && this.city.dispose) this.city.dispose();
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        for (const k of ['map', 'emissiveMap']) if (m[k]) m[k].dispose();
        m.dispose();
      }
    });
  }
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, k) => a + (b - a) * k;
export const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
export function angleTo(a, b) { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; }
export function turnToward(a, b, max) { const d = angleTo(a, b); return a + clamp(d, -max, max); }

// Distance from point p to segment ab.
const _sc = new THREE.Vector3(), _sd = new THREE.Vector3();
export function segDist(p, a, b) {
  _sc.subVectors(b, a); const len2 = _sc.lengthSq();
  const k = len2 ? clamp(_sd.subVectors(p, a).dot(_sc) / len2, 0, 1) : 0;
  return _sd.copy(a).addScaledVector(_sc, k).distanceTo(p);
}
