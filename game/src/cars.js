// cars.js — drivable cars for Solmar City.
// One clear job: build procedural car meshes, spawn parked cars around the
// city, and run the player's arcade driving (enter/exit, accelerate, steer,
// collisions, damage smoke).
import * as THREE from 'three';
import { CAR_CFG, CITY, clamp, pick, range } from './config.js';
import { resolveCircle, randomStreetPoint, isOnRoad } from './city.js';
import { axisPos, keys, pressed } from './input.js';
import { sfx } from './audio.js';

export const CAR_COLORS = [0xc0392b, 0x2980b9, 0xf1c40f, 0x2ecc71, 0xe67e22, 0x9b59b6, 0xecf0f1, 0x1a1a1a, 0x16a085, 0xd35400];
export const CAR_NAMES = ['Comet', 'Stallion', 'Futo', 'Blista', 'Sentinel', 'Panto', 'Sultan', 'Buccaneer'];

const bodyGeo = new THREE.BoxGeometry(1.9, 0.62, 4.2);
const cabinGeo = new THREE.BoxGeometry(1.7, 0.55, 2.1);
const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
const glassMat = new THREE.MeshLambertMaterial({ color: 0x1a2a3a });
const tyreMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
const lightMat = new THREE.MeshLambertMaterial({ color: 0xfff6c0, emissive: 0xfff2a0, emissiveIntensity: 0.5 });
const tailMat = new THREE.MeshLambertMaterial({ color: 0xcc2222, emissive: 0x881111, emissiveIntensity: 0.5 });
const smokeMat = new THREE.MeshBasicMaterial({ color: 0x555555, transparent: true, opacity: 0.5 });

const bodyMats = new Map();
function bodyMaterial(color) {
  if (!bodyMats.has(color)) bodyMats.set(color, new THREE.MeshLambertMaterial({ color }));
  return bodyMats.get(color);
}

// Build a car mesh group. `police` adds the black-and-white livery + light bar.
export function buildCarMesh(color, police) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(bodyGeo, police
    ? new THREE.MeshLambertMaterial({ color: 0xf2f2f2 })
    : bodyMaterial(color));
  body.position.y = 0.62;
  body.castShadow = true;
  g.add(body);
  if (police) {
    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.2, 1.5),
      new THREE.MeshLambertMaterial({ color: 0x14181c }));
    hood.position.set(0, 0.86, -1.2);
    g.add(hood);
    const trunk = hood.clone();
    trunk.position.z = 1.35;
    g.add(trunk);
  }
  const cabin = new THREE.Mesh(cabinGeo, police ? bodyMaterial(0x14181c) : glassMat);
  cabin.position.set(0, 1.18, 0.15);
  cabin.castShadow = true;
  g.add(cabin);
  const headGeo = new THREE.BoxGeometry(0.34, 0.16, 0.1);
  for (const sx of [-0.6, 0.6]) {
    const h = new THREE.Mesh(headGeo, lightMat);
    h.position.set(sx, 0.62, -2.12);
    g.add(h);
    const t = new THREE.Mesh(headGeo, tailMat);
    t.position.set(sx, 0.62, 2.12);
    g.add(t);
  }
  const wheels = [];
  for (const [wx, wz] of [[-0.85, -1.35], [0.85, -1.35], [-0.85, 1.35], [0.85, 1.35]]) {
    const w = new THREE.Mesh(wheelGeo, tyreMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.36, wz);
    g.add(w);
    wheels.push(w);
  }
  let lightBar = null;
  if (police) {
    lightBar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.3),
      new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    red.position.x = -0.3;
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.3),
      new THREE.MeshBasicMaterial({ color: 0x2266ff }));
    blue.position.x = 0.3;
    lightBar.add(red, blue);
    lightBar.position.set(0, 1.55, 0.15);
    lightBar.userData.red = red; lightBar.userData.blue = blue;
    g.add(lightBar);
  }
  // Damage smoke puff (hidden until health is low).
  const smoke = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), smokeMat);
  smoke.position.set(0, 1.2, -1.6);
  smoke.visible = false;
  g.add(smoke);
  return { group: g, wheels, lightBar, smoke };
}

export function makeCar(scene, x, z, heading, color, police) {
  const mesh = buildCarMesh(color, police);
  mesh.group.position.set(x, 0, z);
  mesh.group.rotation.y = heading;
  scene.add(mesh.group);
  return {
    mesh,
    pos: mesh.group.position,
    heading,
    speed: 0,
    health: CAR_CFG.health,
    police: !!police,
    color,
    name: police ? 'Interceptor' : pick(Math.random, CAR_NAMES),
    parked: !police,
    smokeTimer: 0,
  };
}

export function spawnParkedCars(scene, rng, count, avoid) {
  const cars = [];
  let guard = 0;
  while (cars.length < count && guard < count * 40) {
    guard += 1;
    const p = randomStreetPoint(rng);
    // Which road is this point on? z on a street line = east-west road.
    const onHorizontalRoad = CITY.streets.some((s) => Math.abs(p.z - s) < 1);
    const horizontal = onHorizontalRoad;
    const side = rng() < 0.5 ? -1 : 1;
    const heading = horizontal ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : (side > 0 ? 0 : Math.PI);
    const x = horizontal ? p.x : p.x + side * 5;
    const z = horizontal ? p.z + side * 5 : p.z;
    if (avoid && Math.hypot(x - avoid.x, z - avoid.z) < 12) continue;
    if (!isOnRoad(x, z)) continue;
    if (cars.some((c) => Math.hypot(c.pos.x - x, c.pos.z - z) < 7)) continue;
    cars.push(makeCar(scene, x, z, heading, pick(rng, CAR_COLORS), false));
  }
  return cars;
}

// Nearest parked (or any non-police) car within range of (x, z).
export function nearestCar(cars, x, z, rangeMax) {
  let best = null, bd = rangeMax * rangeMax;
  for (const c of cars) {
    const d2 = (c.pos.x - x) ** 2 + (c.pos.z - z) ** 2;
    if (d2 < bd) { bd = d2; best = c; }
  }
  return best;
}

export function updateCarVisual(car, dt) {
  const spin = car.speed * dt * 2.2;
  for (const w of car.mesh.wheels) w.rotation.x += spin;
  if (car.mesh.lightBar) {
    const on = Math.floor(performance.now() / 180) % 2 === 0;
    car.mesh.lightBar.userData.red.material.color.setHex(on ? 0xff2222 : 0x661111);
    car.mesh.lightBar.userData.blue.material.color.setHex(on ? 0x113366 : 0x2266ff);
  }
  const smoking = car.health < 45;
  car.mesh.smoke.visible = smoking;
  if (smoking) {
    car.smokeTimer += dt;
    const s = 0.6 + Math.sin(car.smokeTimer * 9) * 0.25;
    car.mesh.smoke.scale.setScalar(s);
    car.mesh.smoke.position.y = 1.2 + Math.sin(car.smokeTimer * 5) * 0.2;
  }
}

// Arcade driving for the player's car. Returns { crashed } when a hard hit happened.
export function drivePlayerCar(car, dt, obstacles) {
  const axis = axisPos();
  const handbrake = keys.Space;
  if (axis.y > 0) car.speed += CAR_CFG.accel * dt * (car.speed < 0 ? 2.2 : 1);
  else if (axis.y < 0) {
    if (car.speed > 0.5) car.speed -= CAR_CFG.brake * dt;
    else car.speed -= CAR_CFG.accel * 0.6 * dt;
  } else {
    car.speed -= car.speed * (handbrake ? 3.2 : 0.55) * dt;
    if (Math.abs(car.speed) < 0.05) car.speed = 0;
  }
  car.speed = clamp(car.speed, -CAR_CFG.reverseMax, CAR_CFG.maxSpeed * (car.health < 30 ? 0.55 : 1));
  const steer = axis.x * CAR_CFG.steerRate * (handbrake ? 1.4 : 1) * clamp(Math.abs(car.speed) / 8, 0, 1);
  car.heading += steer * dt * (car.speed >= 0 ? 1 : -1);
  const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
  const nx = car.pos.x + fx * car.speed * dt;
  const nz = car.pos.z + fz * car.speed * dt;
  // Building collision: try the move, revert + bounce on overlap.
  const before = { x: car.pos.x, z: car.pos.z };
  car.pos.x = nx; car.pos.z = nz;
  resolveCircle(car.pos, CAR_CFG.radius);
  let crashed = false;
  if (Math.abs(car.pos.x - nx) > 0.01 || Math.abs(car.pos.z - nz) > 0.01) {
    if (Math.abs(car.speed) > 6) {
      car.health -= Math.abs(car.speed) * 0.9;
      sfx.crash();
      crashed = true;
    }
    car.speed *= -0.25;
    car.pos.x = before.x; car.pos.z = before.z;
  }
  // Car-vs-car bounce (simple circle push).
  for (const o of obstacles) {
    if (o === car) continue;
    const dx = car.pos.x - o.pos.x, dz = car.pos.z - o.pos.z;
    const d2 = dx * dx + dz * dz;
    const min = CAR_CFG.radius * 2 - 0.4;
    if (d2 < min * min && d2 > 0.0001) {
      const d = Math.sqrt(d2);
      const push = (min - d) / 2;
      car.pos.x += (dx / d) * push; car.pos.z += (dz / d) * push;
      if (Math.abs(car.speed) > 5) {
        car.health -= 6; o.health -= 6;
        sfx.crash(); crashed = true;
      }
      car.speed *= 0.55;
    }
  }
  car.mesh.group.rotation.y = car.heading;
  updateCarVisual(car, dt);
  return { crashed };
}

export function enterCar(player, car) {
  player.state.inCar = car;
  car.parked = false;
  sfx.engineStart();
}

export function exitCar(player) {
  const car = player.state.inCar;
  if (!car) return;
  player.state.inCar = null;
  car.speed = 0;
  // Step out to the car's left side.
  const lx = car.pos.x - Math.cos(car.heading) * 2.2;
  const lz = car.pos.z + Math.sin(car.heading) * 2.2;
  player.teleport(lx, lz);
  player.state.heading = car.heading;
}

export function wasEnterPressed() { return !!pressed.KeyE; }
export { range };
