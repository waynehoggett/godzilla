import * as THREE from 'three';

// dirX, dirZ, wavenumber, amplitude, speed
const WAVES = [
  [0.96, 0.29, 0.045, 1.1, 1.1],
  [-0.37, 0.93, 0.09, 0.55, 1.5],
  [0.76, -0.65, 0.21, 0.22, 2.1],
  [0.22, 0.98, 0.5, 0.07, 3.0],
];

export class Ocean {
  constructor(scene, o = {}) {
    const size = o.size || 7000, seg = o.seg || 180;
    this.amp = o.amp ?? 1; this.t = 0; this.scroll = new THREE.Vector2();
    const geo = new THREE.PlaneGeometry(2, 2, seg, seg).rotateX(-Math.PI / 2);
    const p = geo.attributes.position;
    // Warp the grid so triangles are small near the centre (which follows the camera).
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      p.setX(i, x * Math.abs(x) * size * 0.5); p.setZ(i, z * Math.abs(z) * size * 0.5);
    }
    const fog = scene.fog;
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        t: { value: 0 }, amp: { value: this.amp }, scroll: { value: this.scroll },
        deep: { value: new THREE.Color(o.deep ?? 0x06202e) }, shallow: { value: new THREE.Color(o.shallow ?? 0x1d6d86) },
        sky: { value: new THREE.Color(o.sky ?? (fog ? fog.color.getHex() : 0x88aacc)) },
        sunDir: { value: new THREE.Vector3(...(o.sunDir || [0.4, 0.7, 0.3])).normalize() }, sunCol: { value: new THREE.Color(o.sunCol ?? 0xfff0d0) },
        fogCol: { value: fog ? fog.color.clone() : new THREE.Color(0x88aacc) }, fogNear: { value: fog ? fog.near : 500 }, fogFar: { value: fog ? fog.far : 3000 },
      },
      vertexShader: `
        uniform float t; uniform float amp; uniform vec2 scroll;
        varying vec3 wp; varying vec3 wn; varying float h;
        void wave(vec2 d, float k, float a, float s, vec2 p, inout float y, inout vec2 g){
          float ph = dot(d, p) * k + t * s;
          y += sin(ph) * a; g += d * k * a * cos(ph);
        }
        void main(){
          vec4 w = modelMatrix * vec4(position, 1.0);
          vec2 p = w.xz + scroll; float y = 0.0; vec2 g = vec2(0.0);
          ${WAVES.map((w) => { const f = w.map((n) => n.toFixed(4)); return `wave(vec2(${f[0]},${f[1]}), ${f[2]}, ${f[3]}, ${f[4]}, p, y, g);`; }).join('\n')}
          w.y += y * amp; h = y; wp = w.xyz; wn = normalize(vec3(-g.x * amp, 1.0, -g.y * amp));
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: `
        uniform vec3 deep; uniform vec3 shallow; uniform vec3 sky; uniform vec3 sunDir; uniform vec3 sunCol; uniform vec3 fogCol;
        uniform float fogNear; uniform float fogFar;
        varying vec3 wp; varying vec3 wn; varying float h;
        void main(){
          vec3 v = normalize(cameraPosition - wp); vec3 n = normalize(wn);
          float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
          vec3 col = mix(deep, shallow, clamp(h * 0.28 + 0.4, 0.0, 1.0));
          col *= 0.55 + 0.6 * max(dot(n, sunDir), 0.0);
          col = mix(col, sky, fres * 0.65);
          float spec = pow(max(dot(reflect(-sunDir, n), v), 0.0), 60.0);
          col += sunCol * spec * 0.7;
          col = mix(col, vec3(0.92, 0.96, 1.0), smoothstep(1.25, 1.9, h) * 0.6);
          float d = length(cameraPosition - wp);
          col = mix(col, fogCol, smoothstep(fogNear, fogFar, d));
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
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
    this.t += dt; this.mat.uniforms.t.value = this.t;
    if (cam) { this.mesh.position.x = cam.position.x; this.mesh.position.z = cam.position.z; }
  }
}
