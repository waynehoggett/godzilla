import * as THREE from 'three/webgpu';
import { uniform, positionLocal, mix, max, float } from 'three/tsl';

// near/far: fog. sun/sunI: directional light. amb: fill light on top of the image-based lighting. exp: exposure.
export const SKY = {
  night: { top: 0x03060e, bot: 0x22344e, fog: 0x0b1420, near: 80, far: 900, sun: 0xa9c0ee, sunI: 3.0, amb: 1.6, env: 2.4, dir: [-0.5, 0.8, 0.35], stars: 1, disc: 0.25, exp: 1.25 },
  day: { top: 0x2a6cc0, bot: 0xcfe2ee, fog: 0xbcd2e0, near: 250, far: 2800, sun: 0xfff1d6, sunI: 3.4, amb: 0.35, env: 1.0, dir: [0.5, 0.8, 0.3], disc: 1, exp: 0.95 },
  dusk: { top: 0x1c2250, bot: 0xf08a48, fog: 0x94685a, near: 150, far: 1700, sun: 0xffa868, sunI: 3.0, amb: 0.4, env: 1.0, dir: [-0.7, 0.3, -0.55], disc: 1, exp: 1.0 },
  storm: { top: 0x12171d, bot: 0x56646f, fog: 0x43505a, near: 150, far: 2200, sun: 0xcfd8e0, sunI: 1.8, amb: 0.5, env: 1.0, dir: [0.3, 0.9, 0.2], disc: 0, exp: 1.0 },
  dawn: { top: 0x27467c, bot: 0xf8b477, fog: 0xc59c86, near: 250, far: 2800, sun: 0xffcf9c, sunI: 3.2, amb: 0.35, env: 1.0, dir: [0.2, 0.28, -0.9], disc: 1, exp: 1.0 },
  ash: { top: 0x352d27, bot: 0xb07d50, fog: 0x7a6450, near: 60, far: 800, sun: 0xffc48a, sunI: 2.8, amb: 0.4, env: 1.0, dir: [0.4, 0.7, 0.4], disc: 0.4, exp: 1.0 },
};

function domeMaterial(c) {
  const m = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, fog: false });
  const dir = positionLocal.normalize();
  const k = dir.y.mul(1.4).clamp(0, 1).pow(0.6);
  const base = mix(uniform(new THREE.Color(c.bot)), uniform(new THREE.Color(c.top)), k);
  // sun disc with a wide halo
  const s = max(dir.dot(uniform(new THREE.Vector3(...c.dir).normalize())), 0);
  const glow = s.pow(900).mul(14).add(s.pow(24).mul(0.55)).add(s.pow(4).mul(0.12)).mul(float(c.disc ?? 1));
  m.colorNode = base.add(uniform(new THREE.Color(c.sun)).mul(glow));
  return m;
}

const envCache = new Map();
function environment(renderer, name, c) {
  const key = name + JSON.stringify([c.top, c.bot, c.dir]);
  if (!envCache.has(key)) {
    const s = new THREE.Scene();
    s.add(new THREE.Mesh(new THREE.SphereGeometry(40, 24, 12), domeMaterial(c)));
    const pm = new THREE.PMREMGenerator(renderer);
    envCache.set(key, pm.fromScene(s, 0.02, 0.1, 100).texture);
  }
  return envCache.get(key);
}

/**
 * Sky dome, fog, sun (with shadows), fill light and image-based lighting for a scene.
 * o.shadow: half-size of the shadowed area around the focus point (0 = no shadows).
 */
export function setupSky(scene, name, o = {}, renderer) {
  const c = { ...SKY[name], ...o };
  scene.fog = new THREE.Fog(c.fog, c.near, c.far);
  scene.background = new THREE.Color(c.fog);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), domeMaterial(c));
  dome.scale.setScalar(c.far * 0.95); dome.renderOrder = -10; dome.frustumCulled = false;
  scene.add(dome);
  if (renderer) { scene.environment = environment(renderer, name, c); scene.environmentIntensity = c.env; renderer.toneMappingExposure = c.exp; }
  const hemi = new THREE.HemisphereLight(c.top, c.fog, c.amb * 2);
  const sun = new THREE.DirectionalLight(c.sun, c.sunI);
  const dir = new THREE.Vector3(...c.dir).normalize();
  const half = c.shadow ?? 0;
  if (half) {
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    const cam = sun.shadow.camera; cam.left = cam.bottom = -half; cam.right = cam.top = half; cam.near = 1; cam.far = half * 6;
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = half * 0.004;
  }
  sun.position.copy(dir).multiplyScalar(half * 3 || 100);
  scene.add(hemi, sun, sun.target);
  if (c.stars) {
    const n = 600, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * 1.3 + 0.1, r = 0.9;
      pos[i * 3] = Math.cos(a) * Math.cos(e) * r; pos[i * 3 + 1] = Math.sin(e) * r; pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(g, new THREE.PointsMaterial({ color: new THREE.Color(0xcfd8ff).multiplyScalar(2.5), size: 1.5, sizeAttenuation: false, fog: false, depthWrite: false }));
    stars.frustumCulled = false; dome.add(stars);
  }
  return {
    dome, sun, hemi, cfg: c,
    // keep the dome on the camera and the shadow box on whatever the scene is about
    follow(cam, focus) {
      dome.position.copy(cam.position);
      if (half && focus) { sun.target.position.copy(focus); sun.position.copy(focus).addScaledVector(dir, half * 3); }
    },
  };
}

// Flat ground disc.
export function ground(scene, color, size = 3000, y = 0, o = {}) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(size, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color, roughness: o.roughness ?? 1, metalness: 0 }));
  m.position.y = y; m.receiveShadow = true; scene.add(m);
  return m;
}
