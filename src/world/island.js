import * as THREE from 'three/webgpu';
import { positionWorld, normalWorld, color, mix, smoothstep, float, mx_noise_float, mx_fractal_noise_float } from 'three/tsl';
import { broadleaf, palm, bush, farTree, plant, rng } from './foliage.js';

// Odo Island: a level airfield clearing on the south shore, a beach below it, and jungle
// climbing to a ridge behind. height(x, z) is the single source of truth: the ground mesh,
// every tree and everything the chapter places stand on it.

const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function hash(ix, iz, seed) { let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ seed; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  return lerp(lerp(hash(ix, iz, seed), hash(ix + 1, iz, seed), u), lerp(hash(ix, iz + 1, seed), hash(ix + 1, iz + 1, seed), u), v);
}
function fbm(x, z, oct, seed) { let a = 0.5, f = 1, sum = 0, n = 0; for (let i = 0; i < oct; i++) { sum += vnoise(x * f, z * f, seed + i * 17) * a; n += a; a *= 0.5; f *= 2.03; } return sum / n; }

export const ISLAND = {
  sea: -3,
  // the level ground the chapter is played on
  flat: { x0: -135, x1: 175, z0: -24, z1: 315 },
  centre: { x: 20, z: 260 },
};

export function islandHeight(x, z) {
  const F = ISLAND.flat, C = ISLAND.centre;
  // distance outside the airfield clearing
  const ox = Math.max(F.x0 - x, 0, x - F.x1), oz = Math.max(F.z0 - z, 0, z - F.z1), d = Math.hypot(ox, oz);
  const rise = sstep(12, 300, d);
  const broad = fbm(x * 0.0026 + 9, z * 0.0026 + 4, 4, 11), bumps = fbm(x * 0.013, z * 0.013, 3, 29) - 0.5;
  // a ridge running east-west behind the airfield, with a peak to the north-west
  const ridge = Math.exp(-(((z - 640 - (x - 20) * 0.22) / 190) ** 2)), peak = Math.exp(-(((x + 260) / 230) ** 2 + ((z - 560) / 200) ** 2));
  let h = rise * (16 + broad * 120 + ridge * 95 + peak * 80 + bumps * 22);
  // coast: closer to the south, far away to the north
  const dx = x - C.x, dz = z - C.z, r = Math.hypot(dx, dz), th = Math.atan2(dx, -dz);
  const R = 625 - 275 * Math.cos(th) + 38 * Math.sin(th * 3 + 1) + 22 * Math.sin(th * 7 + 2.3);
  const shore = sstep(-70, 90, R - r);
  return lerp(-16, h, shore);
}

export function makeIsland(scene, o = {}) {
  const lite = !!o.lite, height = islandHeight, F = ISLAND.flat;
  // ---- ground ----
  const X0 = -720, X1 = 780, Z0 = -260, Z1 = 1260, nx = lite ? 130 : 190, nz = lite ? 130 : 190;
  const geo = new THREE.PlaneGeometry(X1 - X0, Z1 - Z0, nx, nz).rotateX(-Math.PI / 2).translate((X0 + X1) / 2, 0, (Z0 + Z1) / 2);
  const P = geo.attributes.position;
  for (let i = 0; i < P.count; i++) P.setY(i, height(P.getX(i), P.getZ(i)));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 1, metalness: 0 });
  const wp = positionWorld, patch = mx_noise_float(wp.xz.mul(0.035)), grain = mx_fractal_noise_float(wp.xz.mul(0.9), 3), slope = float(1).sub(normalWorld.y);
  let c = mix(color(0x5a4d39), color(0x4a5630), smoothstep(-0.35, 0.3, patch)); // packed earth and scrub grass on the airfield
  c = mix(c, color(0x263a1f), smoothstep(1.5, 16, wp.y)); // jungle floor up the slopes
  c = mix(c, color(0x57524b), smoothstep(0.3, 0.55, slope)); // bare rock where it is steep
  c = mix(color(0xb9a77c), c, smoothstep(-1.5, -0.25, wp.y.add(patch.mul(0.35)))); // sand down to the water
  c = mix(c, color(0x6f6650), smoothstep(-2.4, -3.4, wp.y)); // wet sand at the waterline
  mat.colorNode = c.mul(grain.mul(0.22).add(0.92));
  const land = new THREE.Mesh(geo, mat); land.receiveShadow = true; scene.add(land);

  // ---- trees ----
  const R = rng(o.seed ?? 5), keep = o.keepClear || (() => false);
  const edge = (x, z) => Math.min(x - F.x0, F.x1 - x, z - F.z0, F.z1 - z); // > 0 inside the clearing, metres from its edge
  const models = { broad: [broadleaf(1, { height: 9, spread: 0.3 }), broadleaf(2, { height: 11, spread: 0.7 }), broadleaf(3, { height: 8, spread: 0.9 }), broadleaf(4, { height: 12.5, spread: 0.5 })], palm: [palm(1), palm(2), palm(3)], bush: [bush(1), bush(2)], far: [farTree(1), farTree(2)] };
  const lists = { broad: models.broad.map(() => []), palm: models.palm.map(() => []), bush: models.bush.map(() => []), far: models.far.map(() => []) };
  const grid = new Map(), cell = 6, key = (x, z) => Math.floor(x / cell) + ':' + Math.floor(z / cell);
  const crowded = (x, z, gap) => { const cx = Math.floor(x / cell), cz = Math.floor(z / cell); for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const l = grid.get((cx + i) + ':' + (cz + j)); if (l) for (const t of l) if ((t[0] - x) ** 2 + (t[1] - z) ** 2 < gap * gap) return true; } return false; };
  const put = (kind, x, z, s, gap) => {
    const y = height(x, z);
    if (y < ISLAND.sea + 2.2 || keep(x, z) || crowded(x, z, gap)) return false;
    const k = key(x, z); if (!grid.has(k)) grid.set(k, []); grid.get(k).push([x, z]);
    const l = lists[kind]; l[Math.floor(R() * l.length)].push({ x, y: y - 0.25, z, s, yaw: R() * 6.283, tint: 0.8 + R() * 0.35 });
    return true;
  };
  // the tree line and the nearer slopes: full trees
  const nearN = lite ? 520 : 950;
  for (let i = 0, tries = 0; i < nearN && tries < nearN * 30; tries++) {
    const x = F.x0 - 190 + R() * (F.x1 - F.x0 + 380), z = F.z0 - 60 + R() * (F.z1 - F.z0 + 250), e = edge(x, z);
    if (e > 20) continue; // keep the airfield open
    const dens = sstep(22, -30, e) * (0.45 + 0.55 * vnoise(x * 0.02, z * 0.02, 3));
    if (R() > dens) continue;
    const coastal = height(x, z) < 3 && z < 40; // palms along the beach side, jungle inland
    if (put(coastal || R() < 0.22 ? 'palm' : 'broad', x, z, 0.9 + R() * 0.7, 6.5)) i++;
  }
  // a few palms standing on the airfield itself
  for (let i = 0, tries = 0; i < 34 && tries < 2000; tries++) {
    const x = F.x0 + 10 + R() * (F.x1 - F.x0 - 20), z = F.z0 + 6 + R() * (F.z1 - F.z0 - 12);
    if (put('palm', x, z, 0.85 + R() * 0.5, 16)) i++;
  }
  // undergrowth along the tree line
  const bushN = lite ? 500 : 1300;
  for (let i = 0, tries = 0; i < bushN && tries < bushN * 20; tries++) {
    const x = F.x0 - 90 + R() * (F.x1 - F.x0 + 180), z = F.z0 - 40 + R() * (F.z1 - F.z0 + 130), e = edge(x, z);
    if (e > 26 || R() > sstep(28, -8, e)) continue;
    if (put('bush', x, z, 0.7 + R() * 0.9, 2.2)) i++;
  }
  // the far slopes: light trees, packed tighter so the canopy closes
  const farN = lite ? 2600 : 6500;
  for (let i = 0, tries = 0; i < farN && tries < farN * 12; tries++) {
    const x = X0 + R() * (X1 - X0), z = Z0 + R() * (Z1 - Z0);
    if (edge(x, z) > -40) continue;
    if (x > F.x0 - 190 && x < F.x1 + 190 && z > F.z0 - 60 && z < F.z1 + 190 && R() < 0.75) continue; // already wooded with full trees
    if (put('far', x, z, 1.0 + R() * 0.9, 9)) i++;
  }
  const meshes = [];
  for (const kind of Object.keys(lists)) lists[kind].forEach((spots, i) => meshes.push(...plant(scene, models[kind][i], spots, { shadow: kind === 'broad' || kind === 'palm' })));

  return {
    height, land, meshes,
    counts: Object.fromEntries(Object.entries(lists).map(([k, l]) => [k, l.reduce((n, a) => n + a.length, 0)])),
    spots: lists,
  };
}
