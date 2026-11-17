// shots.js — deterministic screenshot staging behind ?shot=cover|chase|mission|city.
// One clear job: put the live game into a photogenic state for each named shot
// (player/camera position, wanted level, police spawned, mission state) and
// skip the start overlay, so the frame is real gameplay from a fresh load.
import { CITY, GAME } from './config.js';

export const SHOT_NAMES = ['cover', 'chase', 'mission', 'city'];

// `game` is the object main.js builds: { player, cars, traffic, peds, police,
// missions, city, camera, state }. Each stage runs after the world exists.
export function stageShot(name, game) {
  const { player, police, missions, city } = game;
  const lm = city.landmarks;
  game.state.started = true;
  game.hideStartScreen();
  // A healthy wallet and a mid-morning sun for every shot.
  game.state.cash = 2450;
  game.state.hour = 10.2;
  player.state.health = GAME.startHealth;

  if (name === 'chase') {
    // Driving east along the avenue with 3 stars and police cars converging
    // from ahead: they read as a pursuit in frame, and at shot time (~0.5 s
    // of game time) none has reached the player yet, so none overlaps the car.
    const car = game.parkedCars[0];
    game.putPlayerInCar(car, true);
    car.pos.set(-160, 0, 90);
    car.heading = Math.PI / 2; // face +x: eastbound along the avenue
    car.speed = 32;
    player.state.heading = car.heading;
    player.setCameraYaw(Math.PI / 2);
    police.addWanted(3, 'shot staging');
    // Pursuit staged ahead where the camera sees it: three police cars
    // converging from up the avenue, spaced so the formation holds its shape.
    const pc1 = game.spawnPoliceCarAt(car.pos.x + 35, car.pos.z - 6, Math.PI / 2);
    pc1.speed = 30;
    const pc2 = game.spawnPoliceCarAt(car.pos.x + 50, car.pos.z + 6, Math.PI / 2);
    pc2.speed = 30;
    const pc3 = game.spawnPoliceCarAt(car.pos.x + 22, car.pos.z + 3, Math.PI / 2);
    pc3.speed = 30;
    missions.startMission('m1', game.worldApi());
  } else if (name === 'mission') {
    // On foot at Rico's corner, mission 1 on its second step: the beacon
    // column marks Rico's corner just ahead, and the player faces it.
    // (Yaw first: teleport snaps the camera for the current yaw.)
    player.setCameraYaw(Math.PI * 1.25); // look south-west, toward the beacon
    player.cam.pitch = 0.3;
    player.teleport(lm.rico.x + 6, lm.rico.z + 6);
    player.state.heading = Math.PI * 1.25;
    missions.startMission('m1', game.worldApi());
    missions.state.active.step = 1; // 'Bring the package back to Rico's corner'
  } else if (name === 'city') {
    // On the beach looking east-north-east along the shoreline: the shore
    // cuts diagonally across the frame — water on the right, beach palms
    // ahead, the skyline to the left — instead of a flat band of sand.
    player.setCameraYaw(Math.PI * 0.6); // look ENE, along the beach
    player.cam.pitch = 0.18;
    player.teleport(-120, CITY.beachZ + 22);
    player.state.heading = Math.PI * 0.6;
    game.state.cash = 1250;
  } else {
    // cover (default): driving through downtown, mission 1 running, traffic + peds.
    const car = game.parkedCars[0];
    game.putPlayerInCar(car, true);
    car.pos.set(-30, 0, 90);
    car.heading = Math.PI / 2; // eastbound along the avenue
    car.speed = 30;
    player.state.heading = car.heading;
    player.setCameraYaw(Math.PI / 2);
    missions.startMission('m1', game.worldApi());
    // Two traffic cars on the avenue ahead: one eastbound in the player's
    // lane, one oncoming — the street reads alive instead of empty.
    const t0 = game.traffic.cars[0];
    const t1 = game.traffic.cars[1];
    if (t0 && t0.traffic) {
      t0.traffic.route = { street: 90, horizontal: true, dir: 1 };
      t0.traffic.along = -5;
      t0.heading = Math.PI / 2;
    }
    if (t1 && t1.traffic) {
      t1.traffic.route = { street: 90, horizontal: true, dir: -1 };
      t1.traffic.along = 25;
      t1.heading = -Math.PI / 2;
    }
  }
  // No popup may cover the frame: the phone (Rico's texts), the welcome toast
  // and any big message are hidden deterministically, not left to a timer race.
  game.hidePopups();
  // Signal the screenshot harness once the scene has settled: after 12 frames
  // on a fast machine, or after 8 s of wall time on a slow software renderer.
  game.state.shotReady = false;
  let frames = 0;
  let done = false;
  const ready = () => {
    if (done) return;
    done = true;
    game.state.shotReady = true;
    window.__shotReady = true;
    // DOM signal too: some harnesses read the document, not window properties.
    document.documentElement.setAttribute('data-shot-ready', '1');
  };
  const tick = () => {
    frames += 1;
    if (frames >= 12) ready();
    else if (!done) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  setTimeout(ready, 8000);
}
