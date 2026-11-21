import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// Rigged models, loaded once at start-up. See CREDITS.md for authors and licences.
// loaded at start-up
const FILES = { godzilla21: '/models/godzilla21.glb', soldier: '/models/soldier.glb' };
// loaded when first needed (the rivals)
const LAZY = { kong: '/models/king_kong.glb', ghidorah: '/models/ghidorah.glb', mecha: '/models/mecha.glb', rodan: '/models/rodan.glb' };
export const assets = {};

const prep = (g) => g.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
let lazyLoader = null;
// Load a rival's model on demand; resolves immediately if it is already here.
export function need(key) {
  if (assets[key] || !LAZY[key]) return Promise.resolve();
  lazyLoader = lazyLoader || new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  return new Promise((resolve, reject) => lazyLoader.load(LAZY[key], (g) => { prep(g); assets[key] = g; resolve(); }, undefined, reject));
}

export async function loadAssets(onProgress) {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder), keys = Object.keys(FILES), part = {};
  await Promise.all(keys.map((k) => new Promise((resolve, reject) => {
    loader.load(FILES[k], (g) => { assets[k] = g; part[k] = 1; onProgress(keys.reduce((a, n) => a + (part[n] || 0), 0) / keys.length); resolve(); },
      (e) => { if (e.total) { part[k] = (e.loaded / e.total) * 0.95; onProgress(keys.reduce((a, n) => a + (part[n] || 0), 0) / keys.length); } },
      reject);
  })));
  // optional user-supplied models: public/models/extra.json maps a slot to { file, yaw, scale }
  assets.extra = {};
  try {
    const list = await (await fetch('/models/extra.json')).json();
    await Promise.all(Object.entries(list).map(([slot, o]) => new Promise((resolve) => loader.load('/models/' + o.file, (gltf) => { assets.extra[slot] = { ...o, gltf }; resolve(); }, undefined, () => resolve()))));
  } catch { /* no extras installed */ }
  for (const k of keys) assets[k].scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
}
