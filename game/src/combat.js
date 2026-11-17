// combat.js — fists and the pistol for Solmar City.
// One clear job: punching (F), shooting (mouse click) with a simple aim cone,
// muzzle flash + hit sparks, ammo and reload. It reports hits to the world
// so peds, cops and wanted react.
import * as THREE from 'three';
import { PLAYER_CFG } from './config.js';
import { pressed, mouse, keys } from './input.js';
import { sfx } from './audio.js';

const PISTOL = { damage: 50, range: 45, magSize: 12, reloadTime: 1.4, fireInterval: 0.28, spread: 0.06 };

export function createCombat(scene) {
  // Muzzle flash: a small additive sprite that pops for one frame.
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffdd55, transparent: true, opacity: 0 });
  const flash = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), flashMat);
  flash.visible = false;
  scene.add(flash);
  // Hit sparks: a tiny pool of points that burst and fade.
  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(60 * 3);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ color: 0xffcc44, size: 0.22 }));
  sparks.visible = false;
  sparks.frustumCulled = false;
  scene.add(sparks);
  let sparkLife = 0;
  const sparkVel = [];

  const state = {
    weapon: 'fists', // fists | pistol
    ammo: PISTOL.magSize,
    reserve: 48,
    reloading: 0,
    fireTimer: 0,
    flashTimer: 0,
  };

  function burst(x, y, z) {
    for (let i = 0; i < 60; i += 1) {
      sparkPos[i * 3] = x;
      sparkPos[i * 3 + 1] = y;
      sparkPos[i * 3 + 2] = z;
      sparkVel[i] = new THREE.Vector3((Math.random() - 0.5) * 8, Math.random() * 6, (Math.random() - 0.5) * 8);
    }
    sparkGeo.attributes.position.needsUpdate = true;
    sparks.visible = true;
    sparkLife = 0.35;
  }

  function updateFx(dt) {
    if (state.flashTimer > 0) {
      state.flashTimer -= dt;
      flashMat.opacity = Math.max(0, state.flashTimer / 0.06);
      if (state.flashTimer <= 0) flash.visible = false;
    }
    if (sparkLife > 0) {
      sparkLife -= dt;
      for (let i = 0; i < 60; i += 1) {
        sparkPos[i * 3] += sparkVel[i].x * dt;
        sparkPos[i * 3 + 1] += sparkVel[i].y * dt;
        sparkPos[i * 3 + 2] += sparkVel[i].z * dt;
        sparkVel[i].y -= 18 * dt;
      }
      sparkGeo.attributes.position.needsUpdate = true;
      if (sparkLife <= 0) sparks.visible = false;
    }
  }

  // Aim direction: from the player toward where the camera looks (screen centre).
  function aimDir(camera, origin) {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    dir.y = 0;
    if (dir.lengthSq() < 0.001) dir.set(Math.sin(origin.heading), 0, Math.cos(origin.heading));
    dir.normalize();
    return dir;
  }

  // `world` supplies: player, peds, police, onCrime(kind), onHitPed(ped), onHitCop(cop).
  function update(dt, camera, world) {
    updateFx(dt);
    state.fireTimer = Math.max(0, state.fireTimer - dt);
    if (state.reloading > 0) {
      state.reloading -= dt;
      if (state.reloading <= 0) {
        const need = PISTOL.magSize - state.ammo;
        const take = Math.min(need, state.reserve);
        state.ammo += take;
        state.reserve -= take;
      }
    }
    if (pressed.Digit1) state.weapon = 'fists';
    if (pressed.Digit2) state.weapon = 'pistol';
    if (pressed.KeyR && state.weapon === 'pistol' && state.ammo < PISTOL.magSize && state.reserve > 0 && state.reloading <= 0) {
      state.reloading = PISTOL.reloadTime;
    }

    const player = world.player;
    if (player.state.inCar) return; // no fighting from the car in this build

    // Punch.
    if (pressed.KeyF && player.state.punchTimer <= 0) {
      player.state.punchTimer = PLAYER_CFG.punchCooldown;
      player.state.punchAnim = 0.25;
      sfx.punch();
      const px = player.state.pos.x, pz = player.state.pos.z;
      const ped = world.peds.nearestPed(px, pz, PLAYER_CFG.punchRange);
      const cop = world.police.nearestCop(px, pz, PLAYER_CFG.punchRange);
      if (cop) {
        world.police.damageCop(cop, PLAYER_CFG.punchDamage);
        world.onCrime('hit cop', 2);
        burst(cop.pos.x, 1.2, cop.pos.z);
      } else if (ped) {
        world.peds.knockDown(ped, PLAYER_CFG.punchDamage);
        world.onCrime('hit pedestrian', 1);
        burst(ped.pos.x, 1.2, ped.pos.z);
      }
    }

    // Shoot.
    if (state.weapon === 'pistol' && mouse.clicked && state.fireTimer <= 0 && state.reloading <= 0) {
      if (state.ammo <= 0) {
        if (state.reserve > 0) state.reloading = PISTOL.reloadTime;
        return;
      }
      state.ammo -= 1;
      state.fireTimer = PISTOL.fireInterval;
      sfx.shoot();
      const origin = player.state.pos;
      const dir = aimDir(camera, player.state);
      // Muzzle flash at the player's hand.
      flash.position.set(origin.x + dir.x * 0.8, 1.4, origin.z + dir.z * 0.8);
      flash.visible = true;
      flashMat.opacity = 1;
      state.flashTimer = 0.06;
      // Hit test: nearest ped/cop within a cone around the aim direction.
      let best = null, bestD = PISTOL.range, bestKind = null;
      const spread = (Math.random() - 0.5) * PISTOL.spread;
      const dx = dir.x + -dir.z * spread, dz = dir.z + dir.x * spread;
      function testTarget(t, kind) {
        const tx = t.pos.x - origin.x, tz = t.pos.z - origin.z;
        const d = Math.hypot(tx, tz);
        if (d > PISTOL.range || d < 0.5) return;
        const dot = (tx * dx + tz * dz) / d;
        if (dot < 0.985) return; // ~10 degree cone
        if (d < bestD) { bestD = d; best = t; bestKind = kind; }
      }
      for (const ped of world.peds.peds) if (ped.state !== 'down') testTarget(ped, 'ped');
      for (const cop of world.police.state.cops) if (cop.state !== 'down') testTarget(cop, 'cop');
      if (best) {
        burst(best.pos.x, 1.3, best.pos.z);
        if (bestKind === 'ped') {
          world.peds.knockDown(best, PISTOL.damage);
          world.onCrime('shot pedestrian', 2);
        } else {
          world.police.damageCop(best, PISTOL.damage);
          world.onCrime('shot cop', 2);
        }
      } else {
        // Miss: spark where the bullet lands on the ground.
        burst(origin.x + dx * 12, 0.15, origin.z + dz * 12);
      }
      world.onGunshot(origin.x, origin.z);
    }
    void keys;
  }

  return { state, update, burst, PISTOL };
}
