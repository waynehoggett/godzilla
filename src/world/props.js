import * as THREE from 'three/webgpu';

const _m = new THREE.Matrix4();

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
