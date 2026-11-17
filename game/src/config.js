// config.js — shared constants and the seeded random generator for Solmar City.
// One clear job: every tunable number and the deterministic RNG live here.

export const CITY = {
  // City grid: blocks of BLOCK units separated by ROAD-wide streets.
  blocks: 7,          // blocks per side (7 x 7 blocks)
  block: 46,          // block size in world units
  road: 14,           // road width
  sidewalk: 3,        // sidewalk strip around each block
  get pitch() { return this.block + this.road; }, // distance between street centrelines
  get half() { return (this.blocks * this.pitch + this.road) / 2; },
  // Road centreline coordinates, computed once at build time (filled by city.js).
  streets: [],
  beachZ: 0,          // z of the beach line (south edge), filled by city.js
};

export const GAME = {
  name: 'SOLMAR CITY',
  saveKey: 'solmar-city-save-v1',
  startCash: 250,
  startHealth: 100,
  maxHealth: 100,
  maxWanted: 5,
  dayLengthSec: 480,  // one full in-game day = 8 real minutes
  startHour: 9.0,
  gravity: 30,
  // Wanted decay: seconds out of police sight before a star drops.
  evadeTime: 12,
  bustDistance: 2.6,
  bustTime: 1.6,
};

export const PLAYER_CFG = {
  walkSpeed: 6,
  runSpeed: 10.5,
  jumpSpeed: 9.5,
  radius: 0.55,
  height: 1.8,
  punchRange: 2.2,
  punchDamage: 34,
  punchCooldown: 0.45,
};

export const CAR_CFG = {
  maxSpeed: 34,       // ~122 km/h
  accel: 16,
  brake: 30,
  reverseMax: 10,
  steerRate: 1.9,
  grip: 6.0,
  radius: 1.6,
  health: 100,
};

export const TRAFFIC_CFG = { count: 14, speedMin: 7, speedMax: 12 };
export const PED_CFG = { count: 30, speedMin: 1.2, speedMax: 2.2, fleeSpeed: 5.5 };
export const POLICE_CFG = {
  // police cars per wanted star (index = stars)
  carsByStar: [0, 1, 2, 3, 4, 5],
  footByStar: [0, 1, 2, 2, 3, 4],
  carSpeed: 30,
  footSpeed: 7.5,
  shootRange: 26,
  shootDamage: 6,
  shootInterval: 0.9,
};

// Deterministic RNG (mulberry32) so ?seed=1 replays the same city.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
export function range(rng, lo, hi) { return lo + rng() * (hi - lo); }
export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function dist2(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; }
