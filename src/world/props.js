import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TerrainGenerator } from 'three/addons/generators/TerrainGenerator.js';
import { ForestGenerator } from 'three/addons/generators/ForestGenerator.js';

const _m = new THREE.Matrix4();

// Scatter n palm trees in a ring between rMin and rMax. filter(x, z) can reject spots.
export function palms(scene, n, rMin, rMax, k = 1, filter) {
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.42, 0.75, 12.4, 10).translate(0, 6.2, 0), new THREE.MeshStandardMaterial({ color: 0x5a4630, roughness: 1 }), n);
  // crown: nine drooping fronds
  const fronds = [];
  for (let i = 0; i < 9; i++) fronds.push(new THREE.SphereGeometry(1, 8, 5).scale(3.4, 0.1, 0.75).translate(3.1, 0, 0).rotateZ(-0.3 - (i % 3) * 0.14).rotateY((i / 9) * Math.PI * 2 + (i % 2) * 0.2).translate(0, 12.4, 0));
  const crown = new THREE.InstancedMesh(mergeGeometries(fronds), new THREE.MeshStandardMaterial({ color: 0x3c6a30, roughness: 0.8, side: THREE.DoubleSide }), n);
  trunk.castShadow = crown.castShadow = true;
  for (let i = 0; i < n; i++) {
    let x = 0, z = 0;
    for (let tries = 0; tries < 20; tries++) {
      const a = Math.random() * Math.PI * 2, r = rMin + Math.random() * (rMax - rMin);
      x = Math.cos(a) * r; z = Math.sin(a) * r;
      if (!filter || filter(x, z)) break;
    }
    const s = k * (0.8 + Math.random() * 0.8);
    _m.makeScale(s, s, s).setPosition(x, 0, z); trunk.setMatrixAt(i, _m); crown.setMatrixAt(i, _m);
  }
  trunk.frustumCulled = crown.frustumCulled = false;
  scene.add(trunk, crown);
}

// Instanced little houses for towns seen from the air.
export function houses(scene, n, place) {
  const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: 0xb8ab94, roughness: 1 }), n);
  const roofs = new THREE.InstancedMesh(new THREE.ConeGeometry(0.85, 0.6, 4).rotateY(Math.PI / 4).translate(0, 1.3, 0), new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 1, flatShading: true }), n);
  const q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < n; i++) {
    const [x, z] = place(i);
    p.set(x, 1.4, z); s.set(9 + Math.random() * 6, 5 + Math.random() * 3, 8 + Math.random() * 5); q.setFromAxisAngle(up, Math.random() * 3);
    _m.compose(p, q, s); walls.setMatrixAt(i, _m); roofs.setMatrixAt(i, _m);
  }
  walls.frustumCulled = roofs.frustumCulled = false;
  scene.add(walls, roofs);
}

// Glowing column that marks a place to reach.
export function beacon(scene, x, z, color = 0x7fd0ff, h = 40, r = 1.6) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 12, 1, true).translate(0, h / 2, 0), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  m.position.set(x, 0, z); scene.add(m);
  return m;
}

// Jungle-covered hills from Three.js's terrain and forest generators, placed behind a play area.
// Returns { update(camera) } (the forest thins itself by distance from the camera).
export function hills(scene, o = {}) {
  const size = o.size ?? 1800;
  const terrain = new TerrainGenerator({ seed: o.seed ?? 3, size, segments: 160, heightScale: o.height ?? 230, frequency: 0.7 / size * 2.2, seaLevel: 0.2 });
  const land = terrain.build(); land.position.set(o.x ?? 0, o.y ?? -8, o.z ?? 0); scene.add(land);
  const forest = new ForestGenerator({ count: o.trees ?? 45000, radius: 5, height: 13, from: size * 0.7, to: size * 1.3, altitudeMin: 0.05, altitudeMax: 0.75, minSlope: 0.4, densityFrequency: 0.004 });
  const trees = forest.build(terrain); trees.position.copy(land.position); scene.add(trees);
  return { update(cam) { forest.setCameraPosition(cam.position); }, dispose() { terrain.dispose(); forest.dispose(); } };
}
