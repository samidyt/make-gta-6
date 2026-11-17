// pedestrians.js — the people of Solmar City.
// One clear job: pedestrians who stroll the sidewalks in varied clothes and
// flee when a car, a punch or a gunshot comes near. They can be knocked down.
import * as THREE from 'three';
import { CITY, PED_CFG, pick, range } from './config.js';
import { resolveCircle } from './city.js';

const SHIRTS = [0xe74c3c, 0x3498db, 0xf39c12, 0x9b59b6, 0x1abc9c, 0xecf0f1, 0xfd79a8, 0x00b894, 0xe17055, 0x6c5ce7];
const PANTS = [0x2d3436, 0x34495e, 0x636e72, 0x6b4a2f, 0x1e272e];
const SKINS = [0xf1c27d, 0xc68642, 0x8d5524, 0xffdbac, 0xe0ac69];
const HAIRS = [0x1a1210, 0x4a3226, 0x8a6a3a, 0x2a2a2a, 0xb0b0b0];

const torsoGeo = new THREE.BoxGeometry(0.58, 0.68, 0.32);
const headGeo = new THREE.BoxGeometry(0.38, 0.4, 0.36);
const limbGeo = new THREE.BoxGeometry(0.17, 0.62, 0.19);
const legGeo = new THREE.BoxGeometry(0.22, 0.68, 0.24);

const mats = new Map();
function mat(color) {
  if (!mats.has(color)) mats.set(color, new THREE.MeshLambertMaterial({ color }));
  return mats.get(color);
}

function buildPedMesh(rng) {
  const g = new THREE.Group();
  const shirt = mat(pick(rng, SHIRTS));
  const pants = mat(pick(rng, PANTS));
  const skin = mat(pick(rng, SKINS));
  const hair = mat(pick(rng, HAIRS));
  const torso = new THREE.Mesh(torsoGeo, shirt);
  torso.position.y = 1.06;
  const head = new THREE.Mesh(headGeo, skin);
  head.position.y = 1.64;
  const hairM = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.4), hair);
  hairM.position.y = 1.88;
  const armL = new THREE.Mesh(limbGeo, shirt);
  armL.position.set(-0.39, 1.06, 0);
  const armR = new THREE.Mesh(limbGeo, shirt);
  armR.position.set(0.39, 1.06, 0);
  const legL = new THREE.Mesh(legGeo, pants);
  legL.position.set(-0.15, 0.34, 0);
  const legR = new THREE.Mesh(legGeo, pants);
  legR.position.set(0.15, 0.34, 0);
  g.add(torso, head, hairM, armL, armR, legL, legR);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { group: g, armL, armR, legL, legR };
}

// A sidewalk waypoint: just off a street, on the pavement strip.
function sidewalkPoint(rng) {
  const street = pick(rng, CITY.streets);
  const along = range(rng, -CITY.half + 15, CITY.half - 15);
  const off = CITY.road / 2 + 2.2;
  const side = rng() < 0.5 ? -off : off;
  if (rng() < 0.5) return { x: along, z: street + side };
  return { x: street + side, z: along };
}

export function createPedestrians(scene, rng) {
  const peds = [];

  function spawnPed() {
    const p = sidewalkPoint(rng);
    const mesh = buildPedMesh(rng);
    mesh.group.position.set(p.x, 0, p.z);
    scene.add(mesh.group);
    const ped = {
      mesh,
      pos: mesh.group.position,
      heading: rng() * Math.PI * 2,
      target: sidewalkPoint(rng),
      speed: range(rng, PED_CFG.speedMin, PED_CFG.speedMax),
      phase: rng() * Math.PI * 2,
      state: 'walk', // walk | flee | down
      fleeFrom: null,
      fleeTimer: 0,
      downTimer: 0,
      health: 100,
    };
    peds.push(ped);
    return ped;
  }

  for (let i = 0; i < PED_CFG.count; i += 1) spawnPed();

  function update(dt, threats) {
    // threats: [{x, z, radius}] — cars moving fast, punches, gunshots.
    for (const ped of peds) {
      if (ped.state === 'down') {
        ped.downTimer -= dt;
        if (ped.downTimer <= 0) {
          ped.state = 'walk';
          ped.health = 100;
          ped.mesh.group.rotation.x = 0;
          ped.mesh.group.position.y = 0;
          ped.target = sidewalkPoint(Math.random);
        }
        continue;
      }
      // Notice threats.
      if (ped.state === 'walk') {
        for (const t of threats) {
          const d2 = (ped.pos.x - t.x) ** 2 + (ped.pos.z - t.z) ** 2;
          if (d2 < t.radius * t.radius) {
            ped.state = 'flee';
            ped.fleeFrom = { x: t.x, z: t.z };
            ped.fleeTimer = range(Math.random, 2.5, 4.5);
            break;
          }
        }
      }
      let tx, tz, speed;
      if (ped.state === 'flee') {
        ped.fleeTimer -= dt;
        // Run away from the threat, then calm down.
        const dx = ped.pos.x - ped.fleeFrom.x, dz = ped.pos.z - ped.fleeFrom.z;
        const len = Math.hypot(dx, dz) || 1;
        tx = ped.pos.x + (dx / len) * 10;
        tz = ped.pos.z + (dz / len) * 10;
        speed = PED_CFG.fleeSpeed;
        if (ped.fleeTimer <= 0) { ped.state = 'walk'; ped.target = sidewalkPoint(Math.random); }
      } else {
        tx = ped.target.x; tz = ped.target.z;
        speed = ped.speed;
        if (Math.hypot(tx - ped.pos.x, tz - ped.pos.z) < 1.5) ped.target = sidewalkPoint(Math.random);
      }
      const dx = tx - ped.pos.x, dz = tz - ped.pos.z;
      const len = Math.hypot(dx, dz);
      if (len > 0.01) {
        const targetHeading = Math.atan2(dx, dz);
        let dh = targetHeading - ped.heading;
        while (dh > Math.PI) dh -= Math.PI * 2;
        while (dh < -Math.PI) dh += Math.PI * 2;
        ped.heading += dh * Math.min(1, dt * 6);
        ped.pos.x += (dx / len) * speed * dt;
        ped.pos.z += (dz / len) * speed * dt;
        resolveCircle(ped.pos, 0.5);
        ped.phase += dt * (ped.state === 'flee' ? 14 : 8);
      }
      const swing = Math.sin(ped.phase) * (ped.state === 'flee' ? 0.9 : 0.5);
      ped.mesh.legL.rotation.x = swing;
      ped.mesh.legR.rotation.x = -swing;
      ped.mesh.armL.rotation.x = -swing * 0.7;
      ped.mesh.armR.rotation.x = swing * 0.7;
      ped.mesh.group.rotation.y = ped.heading;
    }
    while (peds.length < PED_CFG.count) spawnPed();
  }

  function knockDown(ped, damage) {
    ped.health -= damage;
    if (ped.health <= 0 && ped.state !== 'down') {
      ped.state = 'down';
      ped.downTimer = 6;
      ped.mesh.group.rotation.x = -Math.PI / 2;
      ped.mesh.group.position.y = 0.35;
      return true;
    }
    if (ped.state === 'walk') {
      ped.state = 'flee';
      ped.fleeFrom = { x: ped.pos.x + 1, z: ped.pos.z };
      ped.fleeTimer = 3;
    }
    return false;
  }

  function nearestPed(x, z, rangeMax) {
    let best = null, bd = rangeMax * rangeMax;
    for (const ped of peds) {
      if (ped.state === 'down') continue;
      const d2 = (ped.pos.x - x) ** 2 + (ped.pos.z - z) ** 2;
      if (d2 < bd) { bd = d2; best = ped; }
    }
    return best;
  }

  return { peds, update, knockDown, nearestPed, spawnPed };
}
