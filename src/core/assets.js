import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// Rigged models, loaded once at start-up. See CREDITS.md for authors and licences.
const FILES = { godzilla: '/models/godzilla.glb', kong: '/models/king_kong.glb' };
export const assets = {};

export async function loadAssets(onProgress) {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder), keys = Object.keys(FILES), part = {};
  await Promise.all(keys.map((k) => new Promise((resolve, reject) => {
    loader.load(FILES[k], (g) => { assets[k] = g; part[k] = 1; onProgress(keys.reduce((a, n) => a + (part[n] || 0), 0) / keys.length); resolve(); },
      (e) => { if (e.total) { part[k] = (e.loaded / e.total) * 0.95; onProgress(keys.reduce((a, n) => a + (part[n] || 0), 0) / keys.length); } },
      reject);
  })));
  for (const k of keys) assets[k].scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
}
