import { makeGodzilla } from '../models/godzilla.js';
import { makeRodan, makeMothra, makeGhidorah } from '../models/rivals.js';

// Attack timings are in seconds: wind (telegraph) -> act (dangerous) -> rec (open to punishment).
export const RIVALS = {
  rodan: {
    name: 'Rodan', tag: 'The fire pteranodon', make: makeRodan, scale: 5, hp: 260, speed: 48, flying: true, hover: 44, radius: 15, range: 115,
    pitch: 1.7, arena: 'island', beamColor: 0xff8a3c,
    attacks: [
      { type: 'dive', id: 'dive', min: 50, max: 420, cd: 5, wind: 1.15, act: 0.45, rec: 2.0, dmg: 22, r: 26, up: 75, low: 0, kb: 55 },
      { type: 'gust', id: 'gust', min: 0, max: 160, cd: 8, wind: 0.75, act: 0.3, rec: 0.7, dmg: 8, r: 175, kb: 95 },
      { type: 'melee', id: 'peck', min: 0, max: 60, cd: 3, wind: 0.55, act: 0.2, rec: 0.9, dmg: 12, r: 24 },
    ],
  },
  mothra: {
    name: 'Mothra', tag: 'Queen of the monsters', make: makeMothra, scale: 5.5, hp: 310, speed: 42, flying: true, hover: 50, radius: 16, range: 135,
    pitch: 2.4, arena: 'island', beamColor: 0xffe27a,
    attacks: [
      { type: 'zone', id: 'scales', min: 0, max: 240, cd: 7, wind: 0.9, act: 0.3, rec: 0.6, dps: 9, r: 40, dur: 5.5 },
      { type: 'dive', id: 'ram', min: 60, max: 420, cd: 6, wind: 0.95, act: 0.5, rec: 1.7, dmg: 17, r: 24, up: 30, low: 6, kb: 65 },
      { type: 'beam', id: 'beam', min: 70, max: 360, cd: 8, wind: 1.0, act: 0.9, rec: 0.7, dps: 30, n: 1 },
    ],
  },
  mecha: {
    name: 'Mechagodzilla', tag: 'The machine double', make: () => makeGodzilla({ mecha: true }), scale: 5, hp: 430, speed: 23, flying: false, radius: 13, range: 70,
    pitch: 0.6, arena: 'city', beamColor: 0xff4a3a, armor: 14,
    attacks: [
      { type: 'melee', id: 'punch', min: 0, max: 52, cd: 2.2, wind: 0.5, act: 0.2, rec: 0.7, dmg: 18, r: 24 },
      { type: 'volley', id: 'missiles', min: 70, max: 450, cd: 7, wind: 0.7, act: 0.3, rec: 0.8, dmg: 12, r: 15, n: 5, fly: 1.3 },
      { type: 'beam', id: 'eyebeam', min: 60, max: 380, cd: 8, wind: 1.0, act: 1.1, rec: 0.8, dps: 34, n: 1 },
      { type: 'dive', id: 'dash', min: 70, max: 300, cd: 9, wind: 0.8, act: 0.45, rec: 1.3, dmg: 21, r: 24, up: 0, low: 0, kb: 75 },
    ],
  },
  ghidorah: {
    name: 'King Ghidorah', tag: 'The three-headed king', make: makeGhidorah, scale: 4.6, hp: 580, speed: 21, flying: false, radius: 17, range: 85,
    pitch: 2.9, arena: 'bay', beamColor: 0xffe24a, armor: 18,
    attacks: [
      { type: 'melee', id: 'bite', min: 0, max: 62, cd: 2.6, wind: 0.6, act: 0.25, rec: 0.8, dmg: 20, r: 27 },
      { type: 'beam', id: 'gravity', min: 50, max: 420, cd: 7, wind: 1.2, act: 1.6, rec: 0.9, dps: 24, n: 3 },
      { type: 'volley', id: 'storm', min: 0, max: 500, cd: 10, wind: 0.6, act: 0.3, rec: 0.6, dmg: 14, r: 17, n: 7, fly: 0.95, bolt: true },
      { type: 'gust', id: 'hurricane', min: 0, max: 150, cd: 9, wind: 0.8, act: 0.3, rec: 0.7, dmg: 9, r: 180, kb: 110 },
    ],
  },
};

export const LADDER = ['rodan', 'mothra', 'mecha', 'ghidorah'];
export const ARENAS = {
  city: { name: 'Ginza by night' },
  bay: { name: 'Sagami Bay' },
  island: { name: 'Odo Island' },
};
