import * as THREE from 'three';

export const SKY = {
  night: { top: 0x04060d, bot: 0x18263a, fog: 0x0d1622, near: 80, far: 900, sun: 0x9db4e0, sunI: 1.3, hs: 0x3a4d6e, hg: 0x0b0d12, hi: 1.5, dir: [-0.5, 0.8, 0.35], stars: 1 },
  day: { top: 0x3272b8, bot: 0xcfe0ea, fog: 0xbfd2de, near: 250, far: 2800, sun: 0xfff3da, sunI: 2.8, hs: 0xbfd8ff, hg: 0x4a5560, hi: 1.6, dir: [0.5, 0.8, 0.3] },
  dusk: { top: 0x23284e, bot: 0xe2854a, fog: 0x8f6656, near: 150, far: 1700, sun: 0xffb072, sunI: 2.2, hs: 0x6a6a9a, hg: 0x2a2018, hi: 1.3, dir: [-0.7, 0.35, -0.5] },
  storm: { top: 0x171c22, bot: 0x56626c, fog: 0x45515a, near: 150, far: 2200, sun: 0xcfd8e0, sunI: 1.5, hs: 0x8090a0, hg: 0x1c2228, hi: 1.5, dir: [0.3, 0.9, 0.2] },
  dawn: { top: 0x2f4c7a, bot: 0xf4b47c, fog: 0xc59c84, near: 250, far: 2800, sun: 0xffd2a0, sunI: 2.5, hs: 0xa8b8e0, hg: 0x3a3028, hi: 1.4, dir: [0.2, 0.3, -0.9] },
  ash: { top: 0x3a322c, bot: 0xa97c52, fog: 0x77634f, near: 60, far: 800, sun: 0xffc890, sunI: 2.0, hs: 0x9a8a7a, hg: 0x2a2420, hi: 1.4, dir: [0.4, 0.7, 0.4] },
};

export function setupSky(scene, name, o = {}) {
  const c = { ...SKY[name], ...o };
  scene.fog = new THREE.Fog(c.fog, c.near, c.far);
  scene.background = new THREE.Color(c.fog);
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1, 24, 12),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(c.top) }, bot: { value: new THREE.Color(c.bot) } },
      vertexShader: 'varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 bot; varying float h; void main(){ float k = pow(clamp(h*1.4,0.0,1.0),0.6); gl_FragColor = vec4(mix(bot, top, k),1.0);\n#include <colorspace_fragment>\n }',
    })
  );
  const R = c.far * 0.95;
  dome.scale.setScalar(R); dome.renderOrder = -10; dome.frustumCulled = false;
  scene.add(dome);
  const hemi = new THREE.HemisphereLight(c.hs, c.hg, c.hi);
  const sun = new THREE.DirectionalLight(c.sun, c.sunI);
  sun.position.set(...c.dir).multiplyScalar(100);
  scene.add(hemi, sun);
  let stars = null;
  if (c.stars) {
    const n = 500, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * 1.3 + 0.12, r = 0.9;
      pos[i * 3] = Math.cos(a) * Math.cos(e) * r; pos[i * 3 + 1] = Math.sin(e) * r; pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xcfd8ff, size: 1.6, sizeAttenuation: false, fog: false, depthWrite: false }));
    stars.frustumCulled = false;
    dome.add(stars);
  }
  return { dome, sun, hemi, cfg: c, follow(cam) { dome.position.copy(cam.position); } };
}

// Simple flat ground disc.
export function ground(scene, color, size = 3000, y = 0) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(size, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color, roughness: 1 }));
  m.position.y = y; scene.add(m);
  return m;
}
