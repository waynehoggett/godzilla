import * as THREE from 'three/webgpu';
import { uniform, positionLocal, positionWorld, cameraPosition, vec3, float, sin, cos, mix, smoothstep, transformNormalToView } from 'three/tsl';

// Large swell: dirX, dirZ, wavenumber, amplitude, speed. Mirrored in height() for boats.
const WAVES = [
  [0.96, 0.29, 0.045, 1.1, 1.1],
  [-0.37, 0.93, 0.09, 0.55, 1.5],
  [0.76, -0.65, 0.21, 0.22, 2.1],
  [0.22, 0.98, 0.5, 0.07, 3.0],
];
// Fine ripples: shading only, faded with distance so they never shimmer.
const RIPPLES = [[0.6, 0.8, 1.3, 0.035, 3.6], [-0.8, 0.6, 2.1, 0.022, 4.4], [0.95, -0.3, 3.4, 0.014, 5.2], [-0.2, -0.98, 0.85, 0.05, 2.8]];

export class Ocean {
  constructor(scene, o = {}) {
    const size = o.size || 7000, seg = o.seg || 200;
    this.amp = o.amp ?? 1; this.t = 0; this.scroll = new THREE.Vector2();
    const geo = new THREE.PlaneGeometry(2, 2, seg, seg).rotateX(-Math.PI / 2);
    const p = geo.attributes.position;
    // Warp the grid so triangles are small near the centre (which follows the camera).
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      p.setX(i, x * Math.abs(x) * size * 0.5); p.setZ(i, z * Math.abs(z) * size * 0.5);
    }
    const U = (this.u = { t: uniform(0), amp: uniform(this.amp), off: uniform(new THREE.Vector2()), deep: uniform(new THREE.Color(o.deep ?? 0x06202e)), shallow: uniform(new THREE.Color(o.shallow ?? 0x1d6d86)) });
    const mat = (this.mat = new THREE.MeshPhysicalNodeMaterial({ roughness: 0.16, metalness: 0, ior: 1.33, specularIntensity: 1 }));
    const px = positionLocal.x.add(U.off.x), pz = positionLocal.z.add(U.off.y);
    const sum = (list) => {
      let y = float(0), gx = float(0), gz = float(0);
      for (const w of list) {
        const ph = px.mul(w[0]).add(pz.mul(w[1])).mul(w[2]).add(U.t.mul(w[4]));
        y = y.add(sin(ph).mul(w[3])); gx = gx.add(cos(ph).mul(w[0] * w[2] * w[3])); gz = gz.add(cos(ph).mul(w[1] * w[2] * w[3]));
      }
      return { y, gx, gz };
    };
    const big = sum(WAVES), fine = sum(RIPPLES);
    mat.positionNode = vec3(positionLocal.x, big.y.mul(U.amp), positionLocal.z);
    const near = smoothstep(float(o.rippleFar ?? 420), float(30), positionWorld.distance(cameraPosition));
    const gx = big.gx.mul(U.amp).add(fine.gx.mul(near)), gz = big.gz.mul(U.amp).add(fine.gz.mul(near));
    mat.normalNode = transformNormalToView(vec3(gx.negate(), 1, gz.negate()).normalize());
    const foam = smoothstep(1.2, 1.95, big.y).mul(0.75);
    mat.colorNode = mix(mix(U.deep, U.shallow, big.y.mul(0.28).add(0.4).clamp(0, 1)), vec3(0.9, 0.95, 1.0), foam);
    mat.roughnessNode = mix(float(0.14), float(0.7), foam);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false; this.mesh.receiveShadow = !!o.shadow;
    this.mesh.position.y = o.y || 0;
    scene.add(this.mesh);
  }
  height(x, z) {
    let y = 0;
    x += this.scroll.x; z += this.scroll.y;
    for (const w of WAVES) y += Math.sin((w[0] * x + w[1] * z) * w[2] + this.t * w[4]) * w[3];
    return y * this.amp + this.mesh.position.y;
  }
  update(dt, cam) {
    this.t += dt; this.u.t.value = this.t;
    if (cam) { this.mesh.position.x = cam.position.x; this.mesh.position.z = cam.position.z; }
    this.u.off.value.set(this.mesh.position.x + this.scroll.x, this.mesh.position.z + this.scroll.y);
  }
}
