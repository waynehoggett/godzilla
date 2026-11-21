import { makeRodan, makeKong, makeMecha, makeGhidorah } from '../models/rivals.js';

// Each attack names the rig move it plays; the wind-up length comes from that move, so the
// telegraph you see is the animation itself. Extra fields:
//   min/max: distance band where the rival will choose it; cd: cooldown; w: how much it favours it;
//   r: radius of the strike; rec: seconds it stays open afterwards; poise: stagger it inflicts.
export const RIVALS = {
  rodan: {
    name: 'Rodan', tag: 'The fire pteranodon', make: makeRodan, scale: 5, hp: 450, poise: 75, speed: 50, flying: true, hover: 46, radius: 15, range: 120,
    pitch: 1.7, arena: 'island', beamColor: 0xff8a3c,
    attacks: [
      { type: 'dive', id: 'dive', move: 'dive', min: 50, max: 420, cd: 5.5, w: 3, dmg: 22, r: 26, up: 78, low: 0, kb: 55, rec: 2.1 },
      { type: 'gust', id: 'gust', move: 'gust', min: 0, max: 165, cd: 8, w: 1, dmg: 8, r: 175, kb: 95, rec: 0.7 },
      { type: 'melee', id: 'peck', move: 'peck', min: 0, max: 62, cd: 3, w: 2, dmg: 12, r: 24, rec: 1.0 },
    ],
  },
  kong: {
    name: 'King Kong', tag: 'The eighth wonder of the world', make: makeKong, scale: 5, hp: 640, poise: 110, speed: 30, flying: false, radius: 13, range: 54,
    pitch: 0.7, arena: 'island', beamColor: 0xffffff, blocks: 0.2,
    attacks: [
      { type: 'melee', id: 'punch', move: 'punch', min: 0, max: 58, cd: 1.5, w: 4, dmg: 14, r: 24, rec: 0.55, chain: 0.45 },
      { type: 'dive', id: 'leap', move: 'leap', min: 75, max: 330, cd: 6, w: 3, dmg: 22, r: 27, up: 0, low: 0, kb: 70, arc: 48, rec: 1.2 },
      { type: 'volley', id: 'boulders', move: 'boulders', min: 100, max: 460, cd: 8, w: 2, dmg: 14, r: 15, n: 3, fly: 1.25, rock: true, rec: 0.8 },
      { type: 'gust', id: 'roar', move: 'roar', min: 0, max: 140, cd: 11, w: 1, dmg: 6, r: 150, kb: 85, rec: 0.8 },
    ],
  },
  mecha: {
    name: 'Mechagodzilla', tag: 'The machine double', make: makeMecha, scale: 5, hp: 680, poise: 135, speed: 24, flying: false, radius: 13, range: 66,
    pitch: 0.6, arena: 'city', beamColor: 0xff4a3a, blocks: 0.15,
    attacks: [
      { type: 'melee', id: 'punch', move: 'punch', min: 0, max: 54, cd: 2.0, w: 4, dmg: 13, r: 24, rec: 0.6, chain: 0.4 },
      { type: 'melee', id: 'slam', move: 'slam', min: 0, max: 60, cd: 5.5, w: 2, dmg: 20, r: 28, rec: 1.0, kb: 60 },
      { type: 'volley', id: 'missiles', move: 'missiles', min: 80, max: 450, cd: 7, w: 2, dmg: 10, r: 15, n: 5, fly: 1.4, rec: 0.8 },
      { type: 'beam', id: 'eyebeam', move: 'eyebeam', min: 70, max: 380, cd: 8, w: 2, dps: 26, n: 1, act: 1.1, rec: 0.9 },
      { type: 'dive', id: 'dash', move: 'dash', min: 80, max: 300, cd: 9, w: 2, dmg: 20, r: 24, up: 0, low: 0, kb: 75, rec: 1.2 },
    ],
  },
  ghidorah: {
    name: 'King Ghidorah', tag: 'The three-headed king', make: makeGhidorah, scale: 4.6, hp: 820, poise: 165, speed: 22, flying: false, radius: 17, range: 78,
    pitch: 2.9, arena: 'bay', beamColor: 0xffe24a, blocks: 0.12,
    attacks: [
      { type: 'melee', id: 'bite', move: 'bite', min: 0, max: 64, cd: 2.4, w: 4, dmg: 16, r: 27, rec: 0.7, chain: 0.3 },
      { type: 'melee', id: 'tailwhip', move: 'tailwhip', min: 0, max: 70, cd: 6, w: 2, dmg: 22, r: 34, rec: 0.8, kb: 70 },
      { type: 'beam', id: 'gravity', move: 'gravity', min: 60, max: 420, cd: 7, w: 3, dps: 19, n: 3, act: 1.6, rec: 1.0 },
      { type: 'volley', id: 'storm', move: 'storm', min: 0, max: 500, cd: 10, w: 2, dmg: 14, r: 17, n: 7, fly: 0.95, bolt: true, rec: 0.7 },
      { type: 'gust', id: 'hurricane', move: 'hurricane', min: 0, max: 150, cd: 9, w: 1, dmg: 9, r: 180, kb: 110, rec: 0.8 },
    ],
  },
};

export const LADDER = ['rodan', 'kong', 'mecha', 'ghidorah'];
export const ARENAS = {
  city: { name: 'Ginza by night' },
  bay: { name: 'Sagami Bay' },
  island: { name: 'Odo Island' },
};
