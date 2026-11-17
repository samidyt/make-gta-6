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
    // Driving east along the avenue with 3 stars and police cars on the tail.
    // A long straight run, so the car is still moving when the shot is taken.
    const car = game.parkedCars[0];
    game.putPlayerInCar(car, true);
    car.pos.set(-150, 0, 90);
    car.heading = Math.PI / 2; // face +x: eastbound along the avenue
    car.speed = 26;
    player.state.heading = car.heading;
    player.setCameraYaw(Math.PI / 2);
    police.addWanted(3, 'shot staging');
    // Pursuit staged where the camera sees it: two police cars ahead in the
    // neighbouring lanes (in frame), one behind (minimap blip, catching up).
    const pc1 = game.spawnPoliceCarAt(car.pos.x + 14, car.pos.z - 6, Math.PI / 2);
    pc1.speed = 26;
    const pc2 = game.spawnPoliceCarAt(car.pos.x + 26, car.pos.z + 6, Math.PI / 2);
    pc2.speed = 24;
    const pc3 = game.spawnPoliceCarAt(car.pos.x - 16, car.pos.z + 2, Math.PI / 2);
    pc3.speed = 28;
    missions.startMission('m1', game.worldApi());
    game.showBig('THE HEAT IS ON', '3 stars — lose them or get busted');
  } else if (name === 'mission') {
    // On foot at Rico's corner, mission 1 active, looking down the avenue
    // (street, peds and traffic in frame; beacon marker on the minimap).
    player.teleport(lm.rico.x + 6, lm.rico.z + 6);
    player.setCameraYaw(Math.PI * 0.75);
    missions.startMission('m1', game.worldApi());
  } else if (name === 'city') {
    // On the beach looking back at the skyline: scale + palms + water.
    player.teleport(30, CITY.beachZ + 8);
    player.setCameraYaw(Math.PI); // look north, into the city
    game.state.cash = 1250;
  } else {
    // cover (default): driving through downtown, mission 1 running, traffic + peds.
    const car = game.parkedCars[0];
    game.putPlayerInCar(car, true);
    car.pos.set(-30, 0, 90);
    car.heading = Math.PI / 2; // eastbound along the avenue
    car.speed = 26;
    player.state.heading = car.heading;
    player.setCameraYaw(Math.PI / 2);
    missions.startMission('m1', game.worldApi());
    game.showToast('Steal a car, run Rico\'s jobs, dodge the Solmar PD');
  }
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
