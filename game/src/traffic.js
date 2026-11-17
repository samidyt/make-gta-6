// traffic.js — ambient AI traffic for Solmar City.
// One clear job: cars that drive along the road network in lanes, slow for
// whatever is ahead, turn at intersections, and respawn to keep the count up.
import { CITY, TRAFFIC_CFG, pick, range } from './config.js';
import { isOnRoad } from './city.js';
import { makeCar, updateCarVisual, CAR_COLORS } from './cars.js';

const LANE = 3.2; // lane offset from the street centreline

function randomRoute(rng) {
  // Pick a street and a direction; right-hand traffic puts the lane on the
  // right side of the direction of travel.
  const street = pick(rng, CITY.streets);
  const horizontal = rng() < 0.5; // true: travel along x on a z=street road
  const dir = rng() < 0.5 ? 1 : -1;
  return { street, horizontal, dir };
}

// Lane offset sign: for right-hand traffic, travelling +x uses z = street - LANE,
// travelling -x uses z = street + LANE; travelling +z uses x = street + LANE, -z uses x - LANE.
function lanePos(route, along) {
  if (route.horizontal) return { x: along, z: route.street - LANE * route.dir };
  return { x: route.street + LANE * route.dir, z: along };
}

function routeHeading(route) {
  if (route.horizontal) return route.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  return route.dir > 0 ? 0 : Math.PI;
}

export function createTraffic(scene, rng) {
  const cars = [];
  const half = CITY.half;

  function spawnCar(farFrom) {
    const route = randomRoute(rng);
    let along = range(rng, -half + 10, half - 10);
    const pos = lanePos(route, along);
    if (farFrom && Math.hypot(pos.x - farFrom.x, pos.z - farFrom.z) < 25) {
      along = farFrom.x > 0 ? -half + 20 : half - 20;
    }
    const p2 = lanePos(route, along);
    const car = makeCar(scene, p2.x, p2.z, routeHeading(route), pick(rng, CAR_COLORS), false);
    car.traffic = {
      route,
      along,
      speed: range(rng, TRAFFIC_CFG.speedMin, TRAFFIC_CFG.speedMax),
      cruise: range(rng, TRAFFIC_CFG.speedMin, TRAFFIC_CFG.speedMax),
      stuck: 0,
    };
    car.parked = false;
    cars.push(car);
    return car;
  }

  for (let i = 0; i < TRAFFIC_CFG.count; i += 1) spawnCar(null);

  function update(dt, playerPos, obstacles) {
    for (let i = cars.length - 1; i >= 0; i -= 1) {
      const car = cars[i];
      const t = car.traffic;
      // Look ahead: slow down for any car / the player in front.
      const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
      let blocked = false;
      const lookX = car.pos.x + fx * 7, lookZ = car.pos.z + fz * 7;
      for (const o of obstacles) {
        if (o === car) continue;
        if (Math.hypot(o.pos.x - lookX, o.pos.z - lookZ) < 3.2) { blocked = true; break; }
      }
      if (!blocked && playerPos && Math.hypot(playerPos.x - lookX, playerPos.z - lookZ) < 3.4) blocked = true;
      const target = blocked ? 0 : t.cruise;
      t.speed += (target - t.speed) * Math.min(1, dt * 2.5);
      if (blocked) t.stuck += dt; else t.stuck = 0;
      // If stuck too long (a jam), honk and turn around at the next intersection.
      t.along += t.speed * dt * t.route.dir;
      const pos = lanePos(t.route, t.along);
      car.pos.x = pos.x; car.pos.z = pos.z;
      car.speed = t.speed;
      car.mesh.group.rotation.y = car.heading;
      updateCarVisual(car, dt);

      // At the city edge or after a long jam: pick a fresh route (a "turn").
      const atEdge = Math.abs(t.along) > half - 6;
      const atIntersection = Math.abs(((t.along + half) % 60) - 7) < 1.5 && t.speed > 1;
      if (atEdge || (t.stuck > 6 && atIntersection)) {
        const old = { x: car.pos.x, z: car.pos.z };
        const route = randomRoute(rng);
        // Start the new route near the current spot so the car does not teleport visibly.
        const along = route.horizontal ? old.x : old.z;
        t.route = route;
        t.along = Math.max(-half + 10, Math.min(half - 10, along));
        car.heading = routeHeading(route);
        t.stuck = 0;
      }
    }
    // Top the count back up if any were removed (e.g. wrecked).
    while (cars.length < TRAFFIC_CFG.count) spawnCar(playerPos);
  }

  function removeCar(car) {
    const i = cars.indexOf(car);
    if (i !== -1) cars.splice(i, 1);
    car.mesh.group.removeFromParent();
  }

  return { cars, update, removeCar, spawnCar };
}

export { isOnRoad };
