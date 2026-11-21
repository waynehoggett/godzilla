import * as THREE from 'three';

// ---------- shared modelling helpers ----------
function hash3(x, y, z) { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); }

// Roughen a geometry so flat shading reads as craggy hide. Same position -> same offset, so no cracks.
export function craggy(geo, amt = 0.12, seed = 0) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + (hash3(Math.round(x * 40) + seed, Math.round(y * 40), Math.round(z * 40)) - 0.5) * 2 * amt;
    p.setXYZ(i, x * k, y * k, z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

const geoCache = new Map();
export function blobGeo(detail = 2, amt = 0.12, seed = 0) {
  const key = `${detail}|${amt}|${seed}`;
  if (!geoCache.has(key)) geoCache.set(key, amt ? craggy(new THREE.IcosahedronGeometry(1, detail), amt, seed) : new THREE.IcosahedronGeometry(1, detail));
  return geoCache.get(key);
}
export function part(parent, geo, mat, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.scale.set(sx, sy, sz);
  parent.add(m);
  return m;
}
export function pivot(parent, x = 0, y = 0, z = 0) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }

const coneGeo = new THREE.ConeGeometry(1, 1, 5);

function finGeometry() {
  const pts = [[-0.5, 0], [-0.66, 0.32], [-0.4, 0.42], [-0.56, 0.82], [-0.24, 0.76], [-0.16, 1.28], [0, 0.98], [0.1, 1.55], [0.24, 0.92], [0.44, 1.02], [0.36, 0.52], [0.6, 0.4], [0.5, 0]];
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts.slice(1)) s.lineTo(p[0], p[1]);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.14, bevelEnabled: false });
  g.translate(0, -0.08, -0.07); g.rotateY(Math.PI / 2); // plate lies in the body's sagittal plane
  return g;
}
const FIN_GEO = finGeometry();

/**
 * Procedural Godzilla. Model space: ~10 units tall, feet at y=0, facing +Z.
 * Drive it through `set` and call update(dt).
 *   set.walk 0..1, set.charge 0..1 (fins rise + glow tail->head), set.jaw 0..1,
 *   set.clawL/clawR 0..1, set.whip -1..1 (tail sweep), set.lean radians, set.headPitch radians
 */
export function makeGodzilla(o = {}) {
  const mecha = !!o.mecha;
  const skin = mecha
    ? new THREE.MeshStandardMaterial({ color: 0xb4c0cc, metalness: 0.35, roughness: 0.38, flatShading: true })
    : new THREE.MeshStandardMaterial({ color: o.color ?? 0x2b2d2c, roughness: 1, flatShading: true });
  const dark = mecha
    ? new THREE.MeshStandardMaterial({ color: 0x4a5564, metalness: 0.4, roughness: 0.45, flatShading: true })
    : new THREE.MeshStandardMaterial({ color: 0x1b1c1c, roughness: 1, flatShading: true });
  const bone = new THREE.MeshStandardMaterial({ color: mecha ? 0xd8dde4 : 0xcfc8b4, roughness: 0.7, flatShading: true });
  const glowCol = new THREE.Color(mecha ? 0xff5030 : 0x49b6ff);
  const eyeMat = new THREE.MeshBasicMaterial({ color: mecha ? 0xffd040 : 0xffb347 });
  const B = (d = 2, seed = 0) => blobGeo(mecha ? 1 : d, mecha ? 0 : 0.13, seed);

  const root = new THREE.Group();
  const body = pivot(root, 0, 4.3, 0);
  part(body, B(2, 1), skin, 0, 0, -0.1, 2.15, 2.2, 2.4);         // hips
  part(body, B(2, 2), skin, 0, 1.7, 0.25, 1.95, 2.2, 2.0);        // belly
  part(body, B(2, 3), skin, 0, 3.05, 0.6, 1.7, 1.6, 1.6);         // chest
  part(body, B(1, 4), dark, 0, 1.3, 1.55, 1.2, 1.9, 0.7);         // underbelly plates
  if (mecha) {
    part(body, new THREE.BoxGeometry(1, 1, 1), dark, 1.7, 3.6, 0.5, 1.3, 1.0, 1.5);
    part(body, new THREE.BoxGeometry(1, 1, 1), dark, -1.7, 3.6, 0.5, 1.3, 1.0, 1.5);
    part(body, B(1), new THREE.MeshBasicMaterial({ color: 0xff4020 }), 0, 2.7, 1.95, 0.45, 0.45, 0.2);
  }

  // neck + head
  const neck = pivot(body, 0, 3.8, 0.75); neck.rotation.x = 0.28;
  part(neck, B(2, 5), skin, 0, 0.55, 0, 1.05, 1.35, 1.05);
  const head = pivot(neck, 0, 1.5, 0.25); head.rotation.x = -0.12;
  part(head, B(2, 6), skin, 0, 0.05, 0.05, 0.78, 0.68, 1.0);
  part(head, B(1, 7), skin, 0, -0.02, 0.95, 0.6, 0.45, 0.75);    // snout
  part(head, B(1, 8), dark, 0.36, 0.42, 0.4, 0.28, 0.2, 0.5);    // brows
  part(head, B(1, 9), dark, -0.36, 0.42, 0.4, 0.28, 0.2, 0.5);
  const eyeG = new THREE.SphereGeometry(1, 8, 6);
  part(head, eyeG, eyeMat, 0.5, 0.27, 0.62, 0.085);
  part(head, eyeG, eyeMat, -0.5, 0.27, 0.62, 0.085);
  const jaw = pivot(head, 0, -0.3, 0.15);
  part(jaw, B(1, 10), skin, 0, -0.1, 0.7, 0.55, 0.26, 0.95);
  for (let i = 0; i < 6; i++) {
    const a = (i / 5 - 0.5) * 1.6, x = Math.sin(a) * 0.46, z = 0.95 + Math.cos(a) * 0.6;
    part(jaw, coneGeo, bone, x, 0.2, z, 0.07, 0.24, 0.07);
    const up = part(head, coneGeo, bone, x, -0.3, z + 0.1, 0.07, 0.24, 0.07); up.rotation.x = Math.PI;
  }
  const mouthGlow = part(head, eyeG, new THREE.MeshBasicMaterial({ color: glowCol, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }), 0, -0.3, 1.0, 0.5);
  const mouth = pivot(head, 0, -0.3, 1.7);
  const mouthLight = new THREE.PointLight(glowCol, 0, 0, 1.5); mouth.add(mouthLight);

  // arms
  const arms = [];
  for (const s of [1, -1]) {
    const sh = pivot(body, 1.62 * s, 2.95, 0.95);
    part(sh, B(1, 11), skin, 0, -0.6, 0.15, 0.52, 0.85, 0.55);
    const fore = pivot(sh, 0, -1.2, 0.3); fore.rotation.x = -0.9;
    part(fore, B(1, 12), skin, 0, -0.55, 0, 0.42, 0.75, 0.42);
    for (let i = 0; i < 4; i++) { const c = part(fore, coneGeo, bone, (i - 1.5) * 0.17, -1.35, 0.05, 0.08, 0.42, 0.08); c.rotation.x = Math.PI; }
    arms.push({ sh, fore, s });
  }

  // legs (children of root so the body can bob above them)
  const legs = [];
  for (const s of [1, -1]) {
    const hip = pivot(root, 1.45 * s, 4.25, -0.1);
    part(hip, B(2, 13), skin, 0, -1.2, 0.25, 1.2, 1.95, 1.55);
    const knee = pivot(hip, 0, -2.3, 0.45);
    part(knee, B(1, 14), skin, 0, -0.8, -0.2, 0.82, 1.2, 0.9);
    const foot = pivot(knee, 0, -1.6, 0);
    part(foot, B(1, 15), skin, 0, 0, 0.45, 0.95, 0.4, 1.5);
    for (let i = -1; i <= 1; i++) { const c = part(foot, coneGeo, bone, i * 0.5, -0.05, 1.8, 0.16, 0.6, 0.16); c.rotation.x = Math.PI / 2; }
    if (mecha) part(knee, new THREE.BoxGeometry(1, 1, 1), dark, 0, 0, 0.5, 1.2, 0.9, 0.8);
    legs.push({ hip, knee, foot, s });
  }

  // dorsal fins: order 0 (tail tip) -> 1 (neck); they light up in that order
  const fins = [];
  const addFin = (parent, x, y, z, sc, tiltX, tiltZ, order) => {
    const mat = new THREE.MeshStandardMaterial({ color: mecha ? 0xb8c2cc : 0x232526, roughness: mecha ? 0.35 : 0.9, metalness: mecha ? 0.35 : 0, flatShading: true, emissive: glowCol, emissiveIntensity: 0 });
    const f = new THREE.Mesh(FIN_GEO, mat);
    f.position.set(x, y, z); f.rotation.set(tiltX, 0, tiltZ); f.scale.setScalar(sc);
    parent.add(f);
    fins.push({ f, mat, order, base: sc, by: y, bz: z, nx: Math.sin(tiltX), ny: Math.cos(tiltX) });
  };
  const spine = [[4.75, 0.05, -0.2, 0.7], [4.05, -0.75, -0.7, 1.25], [3.0, -1.5, -0.95, 1.9], [1.85, -1.95, -1.15, 2.3], [0.7, -2.2, -1.3, 1.9], [-0.3, -2.25, -1.45, 1.4]];
  spine.forEach(([y, z, tilt, sc], i) => {
    const order = 1 - (i / (spine.length - 1)) * 0.5;
    addFin(body, 0, y, z, sc, tilt, 0, order);
    if (sc > 1) { addFin(body, 0.78, y - 0.15, z + 0.35, sc * 0.55, tilt, -0.4, order); addFin(body, -0.78, y - 0.15, z + 0.35, sc * 0.55, tilt, 0.4, order); }
  });

  // tail chain
  const tail = [];
  const bend = [-0.3, -0.3, -0.2, 0.3, 0.3, 0.2, 0, 0.05, 0.05, 0.05, 0.05];
  let prev = pivot(body, 0, -0.4, -1.5), r = 1.55;
  for (let i = 0; i < bend.length; i++) {
    const seg = i === 0 ? prev : pivot(prev, 0, 0, -1.6 * (0.94 ** i) * 0.92);
    seg.rotation.x = bend[i];
    const len = 1.6 * (0.94 ** i);
    part(seg, B(1, 20 + i), skin, 0, 0, -len / 2, r, r, len * 0.72);
    if (i < 8) addFin(seg, 0, r * 0.75, -len / 2, Math.max(0.3, 1.25 - i * 0.14), -0.3, 0, 0.45 * (1 - i / 8));
    tail.push({ seg, base: bend[i] });
    prev = seg; r *= 0.83;
  }

  const set = { walk: 0, charge: 0, jaw: 0, clawL: 0, clawR: 0, whip: 0, lean: 0, headPitch: 0, hurt: 0, swim: 0, attack: 0, flap: 0, fold: 0 };
  let phase = 0, t = 0;
  const _v = new THREE.Vector3();

  function update(dt) {
    t += dt; phase += dt * (1.6 + set.walk * 2.2) * (set.walk > 0.02 ? 1 : 0);
    const w = set.walk, sw = Math.sin(phase), breathe = Math.sin(t * 1.3) * 0.04;
    body.position.y = 4.3 + Math.abs(Math.cos(phase)) * 0.18 * w + breathe;
    body.rotation.x = set.lean + set.swim * 0.95 + w * 0.06 - set.hurt * 0.25;
    body.rotation.z = sw * 0.045 * w;
    body.rotation.y = set.whip * -0.5;
    neck.rotation.x = 0.28 + set.headPitch - set.swim * 0.8 + Math.sin(t * 0.9) * 0.03;
    head.rotation.x = -0.12 - set.jaw * 0.18;
    jaw.rotation.x = set.jaw * 0.62;
    for (const L of legs) {
      const a = Math.sin(phase + (L.s > 0 ? 0 : Math.PI));
      L.hip.rotation.x = -a * 0.42 * w - set.swim * 0.6;
      L.knee.rotation.x = Math.max(0, a) * 0.6 * w + set.swim * 0.3;
      L.foot.rotation.x = -Math.max(0, a) * 0.2 * w;
    }
    for (const A of arms) {
      const c = Math.max(A.s > 0 ? set.clawR : set.clawL, set.attack);
      A.sh.rotation.x = -c * 1.75 + sw * 0.1 * w * A.s;
      A.sh.rotation.z = -A.s * c * 0.35;
      A.fore.rotation.x = -0.9 + c * 0.7;
    }
    tail.forEach((s, i) => {
      s.seg.rotation.y = Math.sin(t * 1.1 - i * 0.55) * (0.06 + w * 0.05) + set.whip * 0.34;
      s.seg.rotation.x = s.base + (i > 3 ? Math.sin(t * 0.8 - i * 0.4) * 0.03 : 0);
    });
    // fins rise and glow in sequence from the tail to the neck
    const ch = set.charge;
    for (const F of fins) {
      const g = Math.min(1, Math.max(0, (ch * 1.25 - F.order * 0.9) / 0.3));
      F.mat.emissiveIntensity = g * (1.6 + Math.sin(t * 22 + F.order * 9) * 0.35);
      F.f.scale.setScalar(F.base * (1 + g * 0.22));
      F.f.position.y = F.by + F.ny * g * 0.28 * F.base; F.f.position.z = F.bz + F.nx * g * 0.28 * F.base;
    }
    const mg = Math.max(0, ch - 0.8) * 5;
    mouthGlow.material.opacity = mg * 0.9; mouthLight.intensity = mg * 60 * (o.lightScale ?? 1);
  }

  return {
    root, set, update, mecha,
    height: 10, radius: 2.6,
    mouthWorld: (v = _v) => mouth.getWorldPosition(v),
    headWorld: (v = _v) => head.getWorldPosition(v),
    head, jawPivot: jaw, body, fins,
    flash(k) { skin.emissive.setRGB(k, k * 0.25, k * 0.15); },
  };
}
