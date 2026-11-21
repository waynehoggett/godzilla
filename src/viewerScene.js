import * as THREE from 'three/webgpu';
import { GameScene } from './core/scene.js';
import { setupSky, ground } from './world/sky.js';
import { makeGodzilla } from './models/godzilla.js';
import { makeRodan, makeMecha, makeGhidorah, makeKong } from './models/rivals.js';
import * as VEH from './models/vehicles.js';
import * as PPL from './models/people.js';
import * as FOL from './world/foliage.js';

const tree = (model) => { const root = new THREE.Group(); FOL.plant(root, model, [{ x: 0, y: 0, z: 0 }], { shadow: true }); return { root }; };

// Dev tool: /?scene=view&m=godzilla&a=0.8  — look at one model on a turntable.
const MAKERS = {
  godzilla: () => makeGodzilla(), mecha: makeMecha, kong: makeKong, rodan: makeRodan, ghidorah: makeGhidorah,
  zero: VEH.makeZero, shinden: VEH.makeShinden, shinsei: VEH.makeShinsei, warship: () => VEH.makeWarship(60), tug: VEH.makeTug,
  mine: () => ({ root: VEH.makeMine() }), gun: () => ({ root: VEH.makeGun() }), balloon: () => ({ root: VEH.makeBalloon(3) }), chute: VEH.makeParachute, cruiser: () => VEH.makeWarship(125), broadleaf: () => tree(FOL.broadleaf(2, { height: 11, spread: 0.7 })), broadleaf2: () => tree(FOL.broadleaf(3, { height: 8, spread: 0.9 })), palm: () => tree(FOL.palm(1)), bush: () => tree(FOL.bush(1)), fartree: () => tree(FOL.farTree(1)),
  koichi: () => PPL.makeKoichi('pilot'), civil: () => PPL.makeKoichi('civil'), noriko: PPL.makeNoriko, soldier: PPL.makeSoldier,
};
export class ViewerScene extends GameScene {
  constructor(game, q) {
    super(game);
    this.sky = setupSky(this.scene, q.get('sky') || 'day', { shadow: 30 }, game.renderer);
    this.focus.set(0, 0, 0);
    ground(this.scene, 0x6a6f66, 400);
    this.m = MAKERS[q.get('m') || 'godzilla']();
    this.scene.add(this.m.root);
    this.m.root.position.y = +(q.get('y') || 0);
    this.q = q; this.a = +(q.get('a') || 0.7); this.dist = +(q.get('d') || 22); this.h = +(q.get('h') || 6);
    if (this.m.set) Object.assign(this.m.set, JSON.parse(q.get('set') || '{}'));
    this.spin = q.has('spin');
  }
  update(dt) {
    if (this.spin) this.a += dt * 0.5;
    this.camera.position.set(Math.sin(this.a) * this.dist, this.h + this.dist * 0.15, Math.cos(this.a) * this.dist);
    this.camera.lookAt(0, this.h, 0);
    // ?move=claw1 replays a move every few seconds; ?act=Clip&at=1.2 freezes a clip at a time
    const mv = this.q.get('move'), act = this.q.get('act');
    if (mv && this.m.move && (this.t % (+(this.q.get('every') || 3))) < dt) this.m.move(mv);
    if (act && this.m.rig && !this.froze) { this.froze = true; this.m.rig.act(act, { start: +(this.q.get('at') || 0), end: +(this.q.get('at') || 0), hold: true, fade: 0 }); }
    if (this.m.update) this.m.update(dt, +(this.q.get('speed') ?? 4));
  }
}
