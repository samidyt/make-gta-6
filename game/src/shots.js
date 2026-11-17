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
    // Driving north up the avenue with 3 stars and police cars on the tail.
    const car = game.parkedCars[0];
    game.putPlayerInCar(car, true);
    car.pos.set(-30, 0, -150);
    car.heading = Math.PI; // face -z: northbound up the avenue
    car.speed = 26;
    player.state.heading = car.heading;
    player.setCameraYaw(Math.PI);
    police.addWanted(3, 'shot staging');
    // Pre-spawn the pursuit right behind the player.
    for (let i = 0; i < 3; i += 1) {
      const pc = game.spawnPoliceCarAt(car.pos.x + (i - 1) * 6, car.pos.z + 18 + i * 10, Math.PI);
      pc.speed = 26;
    }
    missions.startMission('m1', game.worldApi());
    game.showBig('THE HEAT IS ON', '3 stars — lose them or get busted');
  } else if (name === 'mission') {
    // On foot at Rico's corner, mission 1 active, beacon visible down the street.
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
    car.speed = 18;
    player.state.heading = car.heading;
    player.setCameraYaw(Math.PI / 2);
    missions.startMission('m1', game.worldApi());
    game.showToast('Steal a car, run Rico\'s jobs, dodge the Solmar PD');
  }
  // Let the world settle a few frames, then signal the screenshot harness.
  game.state.shotReady = false;
  let frames = 0;
  const tick = () => {
    frames += 1;
    if (frames >= 45) {
      game.state.shotReady = true;
      window.__shotReady = true;
    } else {
      requestAnimationFrame(tick);
    }
  };
  requestAnimationFrame(tick);
}
