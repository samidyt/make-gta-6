// police.js — the Solmar PD: wanted level, pursuit cars and foot cops.
// One clear job: track the wanted level, spawn police to match it, chase and
// ram the player, arrest (busted) at low wanted, shoot at high wanted, and
// let the heat decay when the player hides out of sight.
import * as THREE from 'three';
import { CAR_CFG, CITY, GAME, POLICE_CFG, clamp } from './config.js';
import { makeCar, updateCarVisual } from './cars.js';
import { resolveCircle } from './city.js';
import { sfx, setSiren } from './audio.js';

const COP_SHIRT = 0x1a2a4a;
const COP_PANTS = 0x141c2a;

function buildCopMesh() {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: COP_SHIRT });
  const pants = new THREE.MeshLambertMaterial({ color: COP_PANTS });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc68642 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.34), shirt);
  torso.position.y = 1.07;
  const badge = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.02),
    new THREE.MeshLambertMaterial({ color: 0xffd23f, emissive: 0xaa8800, emissiveIntensity: 0.5 }));
  badge.position.set(0.18, 1.2, 0.18);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.4, 0.36), skin);
  head.position.y = 1.66;
  const hat = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.12, 0.44),
    new THREE.MeshLambertMaterial({ color: 0x0d1526 }));
  hat.position.y = 1.9;
  const armGeo = new THREE.BoxGeometry(0.17, 0.62, 0.19);
  const armL = new THREE.Mesh(armGeo, shirt);
  armL.position.set(-0.4, 1.07, 0);
  const armR = new THREE.Mesh(armGeo, shirt);
  armR.position.set(0.4, 1.07, 0);
  const legGeo = new THREE.BoxGeometry(0.23, 0.7, 0.25);
  const legL = new THREE.Mesh(legGeo, pants);
  legL.position.set(-0.15, 0.35, 0);
  const legR = new THREE.Mesh(legGeo, pants);
  legR.position.set(0.15, 0.35, 0);
  g.add(torso, badge, head, hat, armL, armR, legL, legR);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { group: g, armL, armR, legL, legR };
}

export function createPolice(scene, rng) {
  const state = {
    wanted: 0,
    evadeTimer: 0,
    bustTimer: 0,
    cars: [],
    cops: [],
    spawnTimer: 0,
  };

  function addWanted(n, reason) {
    const before = state.wanted;
    state.wanted = clamp(state.wanted + n, 0, GAME.maxWanted);
    if (state.wanted > before) {
      state.evadeTimer = 0;
      setSiren(state.wanted > 0);
    }
    return { before, after: state.wanted, reason };
  }

  function clearWanted() {
    state.wanted = 0;
    state.evadeTimer = 0;
    setSiren(false);
    despawnAll();
  }

  function despawnAll() {
    for (const c of state.cars) c.mesh.group.removeFromParent();
    for (const c of state.cops) c.mesh.group.removeFromParent();
    state.cars = [];
    state.cops = [];
  }

  function spawnPointNear(playerPos, minDist, maxDist) {
    for (let tries = 0; tries < 20; tries += 1) {
      const a = rng() * Math.PI * 2;
      const d = minDist + rng() * (maxDist - minDist);
      const x = playerPos.x + Math.cos(a) * d;
      const z = playerPos.z + Math.sin(a) * d;
      if (Math.abs(x) > CITY.half + 10 || Math.abs(z) > CITY.half + 10) continue;
      return { x, z };
    }
    return { x: playerPos.x + minDist, z: playerPos.z };
  }

  function spawnPoliceCar(playerPos) {
    const p = spawnPointNear(playerPos, 35, 70);
    const heading = Math.atan2(playerPos.x - p.x, playerPos.z - p.z);
    const car = makeCar(scene, p.x, p.z, heading, 0xffffff, true);
    car.police = true;
    car.parked = false;
    state.cars.push(car);
    return car;
  }

  function spawnCop(playerPos) {
    const p = spawnPointNear(playerPos, 14, 30);
    const mesh = buildCopMesh();
    mesh.group.position.set(p.x, 0, p.z);
    scene.add(mesh.group);
    const cop = {
      mesh,
      pos: mesh.group.position,
      heading: 0,
      phase: 0,
      shootTimer: 0,
      health: 100,
      state: 'chase', // chase | down
      downTimer: 0,
    };
    state.cops.push(cop);
    return cop;
  }

  // dt update. `world` gives the player, cars and callbacks for damage/busted.
  function update(dt, world) {
    const playerPos = world.playerPos();
    const playerInCar = world.playerInCar();
    if (state.wanted <= 0) {
      if (state.cars.length || state.cops.length) despawnAll();
      return { busted: false };
    }
    state.spawnTimer -= dt;
    const wantCars = POLICE_CFG.carsByStar[state.wanted];
    const wantCops = playerInCar ? 0 : POLICE_CFG.footByStar[state.wanted];
    if (state.spawnTimer <= 0) {
      state.spawnTimer = 1.2;
      if (state.cars.length < wantCars) spawnPoliceCar(playerPos);
      if (state.cops.length < wantCops) spawnCop(playerPos);
    }

    // Are police close enough to see the player? If nobody is near, the heat cools.
    let nearest = Infinity;
    for (const c of state.cars) nearest = Math.min(nearest, Math.hypot(c.pos.x - playerPos.x, c.pos.z - playerPos.z));
    for (const c of state.cops) nearest = Math.min(nearest, Math.hypot(c.pos.x - playerPos.x, c.pos.z - playerPos.z));
    if (nearest > 55) {
      state.evadeTimer += dt;
      if (state.evadeTimer > GAME.evadeTime) {
        state.wanted -= 1;
        state.evadeTimer = 0;
        world.onWantedDrop(state.wanted);
        if (state.wanted <= 0) { clearWanted(); return { busted: false }; }
      }
    } else {
      state.evadeTimer = 0;
    }

    // Police cars: steer toward the player, ram, bounce off buildings.
    for (const car of state.cars) {
      const dx = playerPos.x - car.pos.x, dz = playerPos.z - car.pos.z;
      const dist = Math.hypot(dx, dz) || 1;
      const wantHeading = Math.atan2(dx, dz);
      let dh = wantHeading - car.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      car.heading += dh * Math.min(1, dt * 2.2);
      const targetSpeed = dist > 6 ? POLICE_CFG.carSpeed : POLICE_CFG.carSpeed * 0.6;
      car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 1.2);
      const before = { x: car.pos.x, z: car.pos.z };
      car.pos.x += Math.sin(car.heading) * car.speed * dt;
      car.pos.z += Math.cos(car.heading) * car.speed * dt;
      resolveCircle(car.pos, CAR_CFG.radius);
      if (Math.abs(car.pos.x - before.x) < 0.001 && Math.abs(car.pos.z - before.z) < 0.001 && car.speed > 3) {
        // Stuck on a building: back up and swing around.
        car.heading += Math.PI * 0.6 * dt * 3;
        car.speed *= 0.4;
      }
      car.mesh.group.rotation.y = car.heading;
      updateCarVisual(car, dt);
      // Ram the player's car: damage + shake.
      if (playerInCar && dist < 4.2) {
        world.onRam(car, dist);
      }
      // Too far away for too long: despawn (keeps the chase near the player).
      if (dist > 160) {
        car.mesh.group.removeFromParent();
        state.cars.splice(state.cars.indexOf(car), 1);
      }
    }

    // Foot cops: run at the player; arrest when close (low wanted) or shoot (high).
    let busted = false;
    for (const cop of state.cops) {
      if (cop.state === 'down') {
        cop.downTimer -= dt;
        if (cop.downTimer <= 0) {
          cop.mesh.group.removeFromParent();
          state.cops.splice(state.cops.indexOf(cop), 1);
        }
        continue;
      }
      const dx = playerPos.x - cop.pos.x, dz = playerPos.z - cop.pos.z;
      const dist = Math.hypot(dx, dz) || 1;
      const wantHeading = Math.atan2(dx, dz);
      let dh = wantHeading - cop.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      cop.heading += dh * Math.min(1, dt * 8);
      const shooting = state.wanted >= 3 && dist < POLICE_CFG.shootRange && dist > 4;
      if (!shooting && dist > 1.4) {
        cop.pos.x += Math.sin(cop.heading) * POLICE_CFG.footSpeed * dt;
        cop.pos.z += Math.cos(cop.heading) * POLICE_CFG.footSpeed * dt;
        resolveCircle(cop.pos, 0.5);
        cop.phase += dt * 12;
      }
      cop.mesh.legL.rotation.x = Math.sin(cop.phase) * 0.8;
      cop.mesh.legR.rotation.x = -Math.sin(cop.phase) * 0.8;
      cop.mesh.group.rotation.y = cop.heading;
      if (shooting) {
        cop.shootTimer -= dt;
        cop.mesh.armR.rotation.x = -1.4; // aim
        if (cop.shootTimer <= 0) {
          cop.shootTimer = POLICE_CFG.shootInterval;
          world.onShotAt(cop, POLICE_CFG.shootDamage);
        }
      } else {
        cop.mesh.armR.rotation.x = 0;
      }
      // Arrest: a cop standing on the player for a moment busts them.
      if (dist < GAME.bustDistance && !playerInCar) {
        state.bustTimer += dt;
        if (state.bustTimer > GAME.bustTime) busted = true;
      }
    }
    if (!state.cops.some((c) => Math.hypot(c.pos.x - playerPos.x, c.pos.z - playerPos.z) < GAME.bustDistance)) {
      state.bustTimer = 0;
    }
    return { busted };
  }

  function damageCop(cop, dmg) {
    cop.health -= dmg;
    if (cop.health <= 0 && cop.state !== 'down') {
      cop.state = 'down';
      cop.downTimer = 5;
      cop.mesh.group.rotation.x = -Math.PI / 2;
      cop.mesh.group.position.y = 0.35;
      addWanted(1, 'cop down');
      return true;
    }
    return false;
  }

  function nearestCop(x, z, rangeMax) {
    let best = null, bd = rangeMax * rangeMax;
    for (const cop of state.cops) {
      if (cop.state === 'down') continue;
      const d2 = (cop.pos.x - x) ** 2 + (cop.pos.z - z) ** 2;
      if (d2 < bd) { bd = d2; best = cop; }
    }
    return best;
  }

  return {
    state, addWanted, clearWanted, update, damageCop, nearestCop,
    get wanted() { return state.wanted; },
  };
}

export { THREE };
