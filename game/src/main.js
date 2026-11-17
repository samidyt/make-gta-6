// main.js — bootstrap and the one game loop for Solmar City.
// One clear job: build the world, wire every system together (city, player,
// cars, traffic, peds, police, missions, combat, HUD, minimap, saves), run
// the frame loop, and own the screens (start / pause / missions / wasted /
// busted) plus the ?shot= staging hook.
import * as THREE from 'three';
import { CITY, GAME, CAR_CFG, makeRng } from './config.js';
import { initInput, pressed, keys, endFrameInput, mouse } from './input.js';
import { buildCity } from './city.js';
import { createPlayer } from './player.js';
import { spawnParkedCars, nearestCar, drivePlayerCar, enterCar, exitCar, makeCar } from './cars.js';
import { createTraffic } from './traffic.js';
import { createPedestrians } from './pedestrians.js';
import { createPolice } from './police.js';
import { createMissions } from './missions.js';
import { createCombat } from './combat.js';
import { initHud, updateHud, showToast, showBig, showPhone, hidePopups, hideOverlays, showOverlay } from './hud.js';
import { createMinimap } from './minimap.js';
import { hasSave, saveGame, loadGame, clearSave } from './save.js';
import { stageShot, SHOT_NAMES } from './shots.js';
import { unlockAudio, sfx, setSiren, setEngine } from './audio.js';

const params = new URLSearchParams(window.location.search);
const shotParam = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);
const rng = makeRng(seed);
const isShot = shotParam && SHOT_NAMES.includes(shotParam);

// --- Renderer / scene -------------------------------------------------------
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
camera.position.set(0, 6, 50);
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- World ------------------------------------------------------------------
const city = buildCity(scene, rng);
const player = createPlayer(scene, city.landmarks.spawn);
const parkedCars = spawnParkedCars(scene, rng, 16, city.landmarks.spawn);
const traffic = createTraffic(scene, rng);
const peds = createPedestrians(scene, rng);
const police = createPolice(scene, rng);
const missions = createMissions(scene, city.landmarks);
const combat = createCombat(scene);
const hud = initHud();
const minimap = createMinimap(document.getElementById('minimap'));
initInput(canvas);

const state = {
  started: false,
  paused: false,
  over: null, // 'wasted' | 'busted' | null
  cash: GAME.startCash,
  hour: GAME.startHour,
  shotReady: false,
  gunshot: null, // { x, z, t } — peds flee from it
  ramCooldown: 0,
  hitCooldown: 0,
};

// --- Shared world API (missions / police / combat call back through this) ---
function addCash(n) {
  state.cash = Math.max(0, state.cash + n);
}

function damagePlayer(amount, cause) {
  if (state.over) return;
  let left = amount;
  if (player.state.armor > 0) {
    const absorbed = Math.min(player.state.armor, left);
    player.state.armor -= absorbed;
    left -= absorbed;
  }
  player.state.health -= left;
  if (player.state.health <= 0) {
    player.state.health = 0;
    wasted(cause);
  }
}

function wasted(cause) {
  state.over = 'wasted';
  const fine = Math.min(100, state.cash);
  addCash(-fine);
  police.clearWanted();
  if (missions.state.active) missions.abortActive(api);
  if (player.state.inCar) exitCar(player);
  document.getElementById('wasted-text').textContent =
    `Solmar PD sends its regards (${cause}). The hospital took $${fine}.`;
  showOverlay('wasted');
}

function busted() {
  state.over = 'busted';
  const fine = Math.min(150, state.cash);
  addCash(-fine);
  police.clearWanted();
  if (missions.state.active) missions.abortActive(api);
  if (player.state.inCar) exitCar(player);
  showOverlay('busted');
}

function respawn() {
  state.over = null;
  hideOverlays();
  player.state.health = GAME.startHealth;
  player.state.armor = 0;
  player.teleport(city.landmarks.spawn.x, city.landmarks.spawn.z);
  player.setCameraYaw(Math.PI);
  showToast('Back on the streets. Stay sharp, Danny.');
}

function worldApi() {
  return {
    player,
    peds,
    police,
    playerPos: () => player.state.pos,
    playerInCar: () => !!player.state.inCar,
    addCash,
    showPhone: (from, msg) => { showPhone(hud, from, msg); sfx.phone(); },
    showBig: (t, s) => showBig(hud, t, s),
    showToast: (t) => showToast(hud, t),
    onWantedDrop: (stars) => {
      if (stars === 0) showToast('You lost them. The heat is off.');
      else showToast(`Heat cooling… ${stars} star${stars > 1 ? 's' : ''} left.`);
    },
    onRam: (car) => {
      if (state.ramCooldown > 0) return;
      state.ramCooldown = 0.8;
      if (player.state.inCar) {
        player.state.inCar.health -= 5;
        player.state.inCar.speed *= 0.7;
        sfx.crash();
      } else {
        damagePlayer(10, 'run down by the PD');
      }
    },
    onShotAt: (cop, dmg) => {
      damagePlayer(dmg, 'shot by the PD');
      sfx.shoot();
    },
    onCrime: (kind, stars) => {
      police.addWanted(stars, kind);
      showToast(`${kind} — wanted level up!`);
    },
    onGunshot: (x, z) => {
      state.gunshot = { x, z, t: performance.now() };
      police.addWanted(1, 'shots fired');
    },
    onMissionComplete: () => doSave(true),
  };
}
const api = worldApi();

// --- Car enter / exit -------------------------------------------------------
function putPlayerInCar(car, silent) {
  const wasParked = car.parked;
  enterCar(player, car);
  if (wasParked && !silent) {
    police.addWanted(1, 'car theft');
    showToast(`You stole the ${car.name} — the PD noticed.`);
  }
  player.setCameraYaw(car.heading);
}

function spawnPoliceCarAt(x, z, heading) {
  const car = makeCar(scene, x, z, heading, 0xffffff, true);
  car.parked = false;
  police.state.cars.push(car);
  return car;
}

// --- Save / load ------------------------------------------------------------
function collectSave() {
  return {
    pos: { x: player.state.pos.x, z: player.state.pos.z },
    cash: state.cash,
    health: player.state.health,
    hour: state.hour,
    completed: missions.state.completed,
  };
}

function doSave(quiet) {
  const ok = saveGame(collectSave());
  if (!quiet) showToast(ok ? 'Game saved.' : 'Save failed — storage is off.');
  return ok;
}

function applySaveData(data) {
  state.cash = data.cash ?? GAME.startCash;
  state.hour = data.hour ?? GAME.startHour;
  player.state.health = data.health ?? GAME.startHealth;
  if (data.pos) player.teleport(data.pos.x, data.pos.z);
  missions.applySave(data);
}

// --- Screens ----------------------------------------------------------------
function startGame(fresh) {
  hideOverlays();
  document.getElementById('hud').style.display = 'block';
  state.started = true;
  state.paused = false;
  if (fresh) {
    state.cash = GAME.startCash;
    state.hour = GAME.startHour;
    player.state.health = GAME.startHealth;
    player.teleport(city.landmarks.spawn.x, city.landmarks.spawn.z);
    showPhone(hud, 'RICO', 'Danny! You\'re back. Come see me — I\'ve got work. Press M for jobs.');
    sfx.phone();
  }
  showToast('Welcome to Solmar City. E steals a car. M opens Rico\'s jobs.');
}

function togglePause() {
  if (!state.started || state.over) return;
  state.paused = !state.paused;
  if (state.paused) {
    document.getElementById('pause-stats').textContent =
      `Cash $${state.cash.toLocaleString('en-US')}  ·  Jobs done ${missions.state.completed.length}/3  ·  Wanted ${police.wanted > 0 ? `${police.wanted}/5 stars` : 'none'}`;
    showOverlay('pause-screen');
  } else {
    hideOverlays();
  }
}

function openMissions() {
  const next = missions.nextAvailable();
  const rows = missions.MISSION_DEFS.map((def) => {
    const done = missions.state.completed.includes(def.id);
    const active = missions.state.active && missions.state.active.def.id === def.id;
    const mark = done ? '✓ DONE' : active ? '▶ ACTIVE' : def.id === next ? '○ READY' : '○ LOCKED';
    return `<div style="text-align:left; margin:10px 0; padding:10px 14px; background:rgba(255,255,255,.06); border-radius:8px;">
      <b style="color:#ffd23f;">${def.name}</b> — $${def.reward} — ${mark}<br>
      <span style="font-size:13px; color:#cfe8ff;">${def.brief}</span></div>`;
  }).join('');
  document.getElementById('mission-list').innerHTML = rows;
  const btn = document.getElementById('btn-start-job');
  if (next && !missions.state.active) {
    btn.classList.remove('hidden');
    btn.textContent = `START ${missions.MISSION_DEFS.find((m) => m.id === next).name}`;
  } else {
    btn.classList.add('hidden');
  }
  showOverlay('mission-screen');
}

// Mission screen gets its start button built here (it is not in the static HTML).
const startJobBtn = document.createElement('button');
startJobBtn.id = 'btn-start-job';
startJobBtn.className = 'btn secondary hidden';
startJobBtn.textContent = 'START JOB';
startJobBtn.addEventListener('click', () => {
  const next = missions.nextAvailable();
  if (next) {
    hideOverlays();
    state.paused = false;
    missions.startMission(next, api);
  }
});
document.querySelector('#mission-screen .card').insertBefore(startJobBtn, document.getElementById('btn-mission-close'));

document.getElementById('btn-start').addEventListener('click', () => { unlockAudio(); startGame(true); });
document.getElementById('btn-continue').addEventListener('click', () => {
  unlockAudio();
  const data = loadGame();
  if (data) applySaveData(data);
  startGame(false);
});
document.getElementById('btn-resume').addEventListener('click', togglePause);
document.getElementById('btn-save').addEventListener('click', () => doSave(false));
document.getElementById('btn-missions').addEventListener('click', () => { hideOverlays(); openMissions(); });
document.getElementById('btn-reset').addEventListener('click', () => {
  clearSave();
  missions.state.completed = [];
  missions.state.available = 'm1';
  hideOverlays();
  startGame(true);
});
document.getElementById('btn-mission-close').addEventListener('click', () => {
  hideOverlays();
  if (state.started) { state.paused = true; showOverlay('pause-screen'); }
});
document.getElementById('btn-wasted').addEventListener('click', respawn);
document.getElementById('btn-busted').addEventListener('click', respawn);

// Continue button only when a save exists.
if (hasSave()) document.getElementById('btn-continue').classList.remove('hidden');

// --- The game object the screenshot stager uses -----------------------------
const game = {
  player, parkedCars, traffic, peds, police, missions, city, camera, state,
  putPlayerInCar, spawnPoliceCarAt, worldApi,
  hideStartScreen: () => hideOverlays(),
  showBig: (t, s) => showBig(hud, t, s),
  showToast: (t) => showToast(hud, t),
  hidePopups: () => hidePopups(hud),
};

// --- Frame loop -------------------------------------------------------------
const clock = new THREE.Clock();
let hudTimer = 0;

function allCars() {
  return [...parkedCars, ...traffic.cars, ...police.state.cars];
}

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  const running = state.started && !state.paused && !state.over;

  if (running) {
    // In-game clock.
    state.hour += (dt / GAME.dayLengthSec) * 24;
    if (state.hour >= 24) state.hour -= 24;
    state.ramCooldown = Math.max(0, state.ramCooldown - dt);

    // Enter / exit cars.
    if (pressed.KeyE) {
      if (player.state.inCar) {
        exitCar(player);
      } else {
        const near = nearestCar(parkedCars, player.state.pos.x, player.state.pos.z, 4);
        if (near) putPlayerInCar(near, false);
        else {
          const t = nearestCar(traffic.cars, player.state.pos.x, player.state.pos.z, 4);
          if (t) { traffic.removeCar(t); parkedCars.push(t); putPlayerInCar(t, false); }
        }
      }
    }

    // Driving + on-foot movement + camera.
    if (player.state.inCar) {
      const res = drivePlayerCar(player.state.inCar, dt, allCars());
      if (res.crashed) {
        // A hard crash near cops draws attention.
        if (police.wanted === 0 && police.state.cars.length === 0) { /* no heat from a solo crash */ }
      }
      if (player.state.inCar.health <= 0) {
        showToast('The car is wrecked — bail out!');
        exitCar(player);
      }
    }
    player.update(dt, camera);

    // Car-vs-pedestrian: running someone over is a crime.
    if (player.state.inCar && Math.abs(player.state.inCar.speed) > 3) {
      const car = player.state.inCar;
      const ped = peds.nearestPed(car.pos.x, car.pos.z, 2.4);
      if (ped) {
        peds.knockDown(ped, 100);
        police.addWanted(1, 'hit pedestrian');
        showToast('You hit a pedestrian!');
        sfx.crash();
      }
    }

    // Threats that make peds flee: the player's fast car, recent gunshots.
    const threats = [];
    if (player.state.inCar && Math.abs(player.state.inCar.speed) > 8) {
      threats.push({ x: player.state.inCar.pos.x, z: player.state.inCar.pos.z, radius: 12 });
    }
    if (state.gunshot && performance.now() - state.gunshot.t < 4000) {
      threats.push({ x: state.gunshot.x, z: state.gunshot.z, radius: 30 });
    }
    traffic.update(dt, player.state.pos, allCars());
    peds.update(dt, threats);
    const policeResult = police.update(dt, api);
    if (policeResult.busted) busted();
    missions.update(dt, api);
    combat.update(dt, camera, api);

    // Pause / missions / save keys.
    if (pressed.KeyP || pressed.Escape) togglePause();
    if (pressed.KeyM) { state.paused = true; hideOverlays(); openMissions(); }
    if (pressed.KeyG) doSave(false);

    // Shadows follow the action.
    city.follow(player.state.pos.x, player.state.pos.z);
  } else if (state.started && state.paused) {
    if (pressed.KeyP || pressed.Escape) togglePause();
  }

  // Engine loop: hums while driving, silent otherwise (no-op until audio unlocks).
  setEngine(running && !!player.state.inCar,
    player.state.inCar ? Math.abs(player.state.inCar.speed) / CAR_CFG.maxSpeed : 0);

  // HUD + minimap (throttled to every other frame for the minimap).
  if (state.started) {
    hudTimer += dt;
    const near = !player.state.inCar
      ? nearestCar(parkedCars, player.state.pos.x, player.state.pos.z, 4)
      : null;
    updateHud(hud, {
      cash: state.cash,
      wanted: police.wanted,
      hour: state.hour,
      health: player.state.health,
      armor: player.state.armor,
      inCar: !!player.state.inCar,
      carSpeed: player.state.inCar ? player.state.inCar.speed : 0,
      nearCar: near ? near.name : null,
      weapon: combat.state.weapon,
      ammo: combat.state.ammo,
      reserve: combat.state.reserve,
      reloading: combat.state.reloading,
      objective: missions.objectiveText(),
    });
    if (hudTimer > 0.05) {
      hudTimer = 0;
      minimap.draw({
        player: player.state.pos,
        playerHeadingX: Math.sin(player.state.heading),
        playerHeadingZ: Math.cos(player.state.heading),
        missionTarget: missions.currentTarget(),
        policeCars: police.state.cars,
        policeCops: police.state.cops,
        trafficCars: traffic.cars,
      });
    }
  }

  renderer.render(scene, camera);
  endFrameInput();
}

// --- Boot -------------------------------------------------------------------
if (isShot) {
  // Screenshot mode: skip the start screen, stage the scene, play live.
  startGame(true);
  stageShot(shotParam, game);
} else {
  // Title screen: idle camera orbit over the city behind the overlay.
  const idle = { a: 0 };
  const idleCam = () => {
    if (state.started) return;
    idle.a += 0.0006;
    const r = 150;
    camera.position.set(Math.cos(idle.a) * r, 70, Math.sin(idle.a) * r);
    camera.lookAt(0, 10, 0);
    requestAnimationFrame(idleCam);
  };
  idleCam();
}
// Debug/test handle: lets automated play-tests inspect live state
// (wanted level, cash, missions) without touching the game's own code paths.
window.__solmar = { state, police, player, missions, parkedCars, traffic, peds, combat, city };
void mouse; void keys; void CITY;
requestAnimationFrame(frame);
