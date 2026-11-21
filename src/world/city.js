import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';
import { CityGenerator, createRoadMaterial } from 'three/addons/generators/CityGenerator.js';
import { SkyscraperGenerator, createSkyscraperMaterial } from 'three/addons/generators/city/SkyscraperGenerator.js';

const _p = new THREE.Vector3();

// A set of buildings (each its own mesh) that monsters can knock down and people collide with.
export class City {
  constructor() { this.b = []; this.falling = []; this.disposables = []; }
  add(obj, x, z, w, d, h) { this.b.push({ obj, x, z, w, d, h, alive: true, k: 1, baseY: obj.position.y, sy: obj.scale.y }); }
  destroy(b, fx, audio) {
    if (!b.alive) return;
    b.alive = false; b.tx = (Math.random() - 0.5) * 0.3; b.tz = (Math.random() - 0.5) * 0.3;
    this.falling.push(b);
    if (fx) { _p.set(b.x, b.h * 0.35, b.z); fx.debris(_p, 22, Math.max(1, b.h / 14), 0x8a7a68); fx.shake(0.7); }
    if (audio) audio.collapse(0.55);
  }
  touching(x, z, r) {
    const out = [];
    for (const b of this.b) if (b.alive && Math.abs(b.x - x) < b.w / 2 + r && Math.abs(b.z - z) < b.d / 2 + r) out.push(b);
    return out;
  }
  smash(x, z, r, fx, audio) { let n = 0; for (const b of this.touching(x, z, r)) { this.destroy(b, fx, audio); n++; } return n; }
  collide(pos, r) {
    for (const b of this.b) {
      if (!b.alive) continue;
      const dx = pos.x - b.x, dz = pos.z - b.z, hx = b.w / 2 + r, hz = b.d / 2 + r;
      if (Math.abs(dx) < hx && Math.abs(dz) < hz) {
        if (hx - Math.abs(dx) < hz - Math.abs(dz)) pos.x = b.x + Math.sign(dx || 1) * hx; else pos.z = b.z + Math.sign(dz || 1) * hz;
      }
    }
  }
  update(dt) {
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const b = this.falling[i];
      b.k = Math.max(0.1, b.k - dt * 1.5);
      // the tower drops into its own footprint and leans as it goes
      b.obj.scale.y = b.sy * b.k; b.obj.rotation.x = (1 - b.k) * b.tx; b.obj.rotation.z = (1 - b.k) * b.tz;
      if (b.k <= 0.1) this.falling.splice(i, 1);
    }
  }
  dispose() { for (const d of this.disposables) d.dispose(); }
}

const PALETTE = [0xb08a6a, 0x9a8c7a, 0xc2a888, 0x8c7260, 0xa89888, 0x7a6a5c];

function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// Keep a random fraction of an InstancedMesh's instances (street furniture is far denser than a monster fight needs).
function thin(mesh, keep, rnd) {
  const n = mesh.count, m = mesh.instanceMatrix.array, c = mesh.instanceColor && mesh.instanceColor.array, tmp = new Float32Array(16);
  const target = Math.max(1, Math.floor(n * keep));
  for (let i = 0; i < target; i++) {
    const j = i + Math.floor(rnd() * (n - i));
    tmp.set(m.subarray(i * 16, i * 16 + 16)); m.copyWithin(i * 16, j * 16, j * 16 + 16); m.set(tmp, j * 16);
    if (c) for (let k = 0; k < 3; k++) { const t = c[i * 3 + k]; c[i * 3 + k] = c[j * 3 + k]; c[j * 3 + k] = t; }
  }
  mesh.count = target; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}
const KEEP = { Cars: 0.4, StreetTrees: 0.7, Streetlights: 0.6, Trafficlights: 1, People: 0, Trashcans: 0, Benches: 0, Hydrants: 0 };

/**
 * A downtown grid built from Three.js's city generators at real scale (1 unit = 1 m): one masonry
 * tower per block from SkyscraperGenerator, plus CityGenerator's sidewalks, road markings, parked
 * cars, trees and lights. `clear(x, z)` leaves blocks empty.
 */
export function generatedCity(scene, o = {}) {
  const rnd = mulberry(o.seed ?? 7);
  const gen = new CityGenerator({ seed: o.seed ?? 7, blocksX: o.blocks ?? 9, blocksZ: o.blocks ?? 9, lot: o.lot ?? 34, lotsX: 1, lotsZ: 1, street: o.street ?? 16, sidewalkWidth: 3, curbRadius: 4 });
  const L = gen.layout, group = new THREE.Group(), city = new City(), slabs = [];
  const mats = PALETTE.map((c) => createSkyscraperMaterial(uniform(new THREE.Color(c)), { interiors: o.interiors ?? 'average', relief: false }));
  for (let bx = 0; bx < L.blocksX; bx++) for (let bz = 0; bz < L.blocksZ; bz++) {
    const x = -L.cityW / 2 + bx * (L.blockW + L.street) + L.blockW / 2, z = -L.cityD / 2 + bz * (L.blockD + L.street) + L.blockD / 2;
    slabs.push(new THREE.Matrix4().makeTranslation(x, 0, z));
    if (o.clear && o.clear(x, z)) continue;
    const w = L.innerLotX - 1 - rnd() * 3, d = L.innerLotZ - 1 - rnd() * 3, t = rnd(), h = (o.hMin ?? 14) + t * t * ((o.hMax ?? 62) - (o.hMin ?? 14));
    const tower = new SkyscraperGenerator({ seed: Math.floor(rnd() * 1e5), totalHeight: h, footprint: { width: w, depth: d }, floorHeight: 3.3 + rnd() * 0.9, bayWidth: 2.8 + rnd() * 1.4, chamferWidth: rnd() < 0.25 ? 3 : 0, setbackDepth: rnd() < 0.3 ? 1.5 : 0, stringCourseEvery: 2 + Math.floor(rnd() * 4), acChance: 0 }, mats[(bx * 3 + bz * 5) % mats.length]);
    const obj = tower.build();
    obj.position.set(x, gen.parameters.curbHeight, z); obj.castShadow = obj.receiveShadow = true;
    group.add(obj); city.add(obj, x, z, w, d, h); city.disposables.push(tower);
  }
  group.add(gen.sidewalk.build(slabs));
  const furniture = gen.buildFurniture(rnd);
  for (const kind of [...furniture.children]) {
    const keep = KEEP[kind.name] ?? 0;
    if (!keep) { furniture.remove(kind); continue; }
    kind.traverse((m) => { if (m.isInstancedMesh) { if (keep < 1) thin(m, keep, rnd); m.castShadow = false; } });
  }
  group.add(furniture);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(L.cityW + 1600, L.cityD + 1600).rotateX(-Math.PI / 2), createRoadMaterial(L));
  road.receiveShadow = true; group.add(road);
  scene.add(group);
  city.group = group; city.radius = Math.min(L.cityW, L.cityD) / 2; city.disposables.push(gen);
  return city;
}

/**
 * A hand-placed row of low masonry buildings (for 1940s Ginza), each from SkyscraperGenerator.
 * lots: [{ x, z, w, d, h }]
 */
export function streetCity(scene, lots, o = {}) {
  const city = new City(), group = new THREE.Group();
  const mats = PALETTE.map((c) => createSkyscraperMaterial(uniform(new THREE.Color(c)), { interiors: o.interiors ?? true }));
  lots.forEach((l, i) => {
    const gen = new SkyscraperGenerator({ seed: 100 + i * 7, totalHeight: l.h, footprint: { width: l.w, depth: l.d }, floorHeight: 3.3 + (i % 3) * 0.25, bayWidth: 2.1 + (i % 4) * 0.3, chamferWidth: 0, setbackDepth: 0, stringCourseEvery: 2, acChance: 0 }, mats[i % mats.length]);
    const obj = gen.build();
    obj.position.set(l.x, 0, l.z); obj.castShadow = obj.receiveShadow = true;
    group.add(obj); city.add(obj, l.x, l.z, l.w, l.d, l.h); city.disposables.push(gen);
  });
  scene.add(group); city.group = group;
  return city;
}
