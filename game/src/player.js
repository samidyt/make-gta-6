// player.js — Danny Vega on foot: procedural character, movement and camera.
// One clear job: the on-foot player — WASD move, sprint, jump, building
// collision, and the third-person orbit camera that follows him (and the car).
import * as THREE from 'three';
import { GAME, PLAYER_CFG, clamp } from './config.js';
import { resolveCircle } from './city.js';
import { axisPos, keys, mouse, pressed } from './input.js';
import { sfx } from './audio.js';

const SKIN = 0xc98a5e;
const SHIRT = 0x2fa36b;
const PANTS = 0x2a3a5a;
const HAIR = 0x1a1210;

function buildBody() {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: SKIN });
  const shirt = new THREE.MeshLambertMaterial({ color: SHIRT });
  const pants = new THREE.MeshLambertMaterial({ color: PANTS });
  const hair = new THREE.MeshLambertMaterial({ color: HAIR });
  const shoe = new THREE.MeshLambertMaterial({ color: 0x111111 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), shirt);
  torso.position.y = 1.08;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.42, 0.38), skin);
  head.position.y = 1.68;
  g.add(head);
  const hairM = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.16, 0.42), hair);
  hairM.position.y = 1.92;
  g.add(hairM);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.08, 0.5), new THREE.MeshLambertMaterial({ color: 0xffd23f }));
  cap.position.set(0, 1.97, 0.03);
  g.add(cap);
  const armGeo = new THREE.BoxGeometry(0.18, 0.66, 0.2);
  const armL = new THREE.Mesh(armGeo, shirt);
  armL.position.set(-0.42, 1.08, 0);
  const armR = new THREE.Mesh(armGeo, shirt);
  armR.position.set(0.42, 1.08, 0);
  g.add(armL, armR);
  const legGeo = new THREE.BoxGeometry(0.24, 0.72, 0.26);
  const legL = new THREE.Mesh(legGeo, pants);
  legL.position.set(-0.16, 0.36, 0);
  const legR = new THREE.Mesh(legGeo, pants);
  legR.position.set(0.16, 0.36, 0);
  g.add(legL, legR);
  const shoeGeo = new THREE.BoxGeometry(0.26, 0.12, 0.4);
  const shoeL = new THREE.Mesh(shoeGeo, shoe);
  shoeL.position.set(-0.16, 0.06, 0.05);
  const shoeR = new THREE.Mesh(shoeGeo, shoe);
  shoeR.position.set(0.16, 0.06, 0.05);
  g.add(shoeL, shoeR);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  return { group: g, armL, armR, legL, legR };
}

export function createPlayer(scene, start) {
  const body = buildBody();
  body.group.position.set(start.x, 0, start.z);
  scene.add(body.group);

  const state = {
    pos: new THREE.Vector3(start.x, 0, start.z),
    velY: 0,
    grounded: true,
    heading: Math.PI,       // facing -z (toward the tower) at spawn
    moving: false,
    running: false,
    walkPhase: 0,
    health: GAME.startHealth,
    armor: 0,
    inCar: null,            // car object when driving
    punchTimer: 0,
    punchAnim: 0,
    dead: false,
  };

  // Camera orbit state (shared by on-foot and driving views).
  const cam = {
    yaw: Math.PI,           // behind the player at spawn
    pitch: 0.42,
    dist: 8.5,
    target: new THREE.Vector3(),
    pos: new THREE.Vector3(),
  };

  function update(dt, camera) {
    // Orbit with mouse drag; clamp pitch so the camera never goes under the floor.
    cam.yaw -= mouse.dx * 0.005;
    cam.pitch = clamp(cam.pitch + mouse.dy * 0.004, 0.08, 1.25);
    if (state.inCar) {
      cam.dist = 11;
    } else {
      cam.dist = 8.5;
    }

    if (state.inCar) {
      // Hidden inside the car; the car module moves us.
      body.group.visible = false;
      state.pos.copy(state.inCar.pos);
      state.pos.y = 0;
      state.heading = state.inCar.heading;
      updateCamera(dt, camera, state.inCar.pos, state.inCar.heading, true);
      return;
    }
    body.group.visible = true;

    const axis = axisPos();
    state.running = !!(keys.ShiftLeft || keys.ShiftRight);
    const speed = state.running ? PLAYER_CFG.runSpeed : PLAYER_CFG.walkSpeed;

    // Movement is relative to the camera yaw.
    const sin = Math.sin(cam.yaw), cos = Math.cos(cam.yaw);
    let mx = 0, mz = 0;
    if (axis.x !== 0 || axis.y !== 0) {
      // Camera looks along -forward; forward on the ground is (sin(yaw), cos(yaw)) in xz.
      const fx = Math.sin(cam.yaw), fz = Math.cos(cam.yaw);
      const rx = -Math.cos(cam.yaw), rz = Math.sin(cam.yaw);
      mx = fx * axis.y + rx * axis.x;
      mz = fz * axis.y + rz * axis.x;
      const len = Math.hypot(mx, mz);
      mx /= len; mz /= len;
      state.moving = true;
      const targetHeading = Math.atan2(mx, mz);
      let dh = targetHeading - state.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      state.heading += dh * Math.min(1, dt * 12);
    } else {
      state.moving = false;
    }
    void sin; void cos;

    state.pos.x += mx * speed * dt;
    state.pos.z += mz * speed * dt;
    resolveCircle(state.pos, PLAYER_CFG.radius);

    // Jump + gravity.
    if (pressed.Space && state.grounded) {
      state.velY = PLAYER_CFG.jumpSpeed;
      state.grounded = false;
      sfx.jump();
    }
    if (!state.grounded) {
      state.velY -= GAME.gravity * dt;
      state.pos.y += state.velY * dt;
      if (state.pos.y <= 0) { state.pos.y = 0; state.velY = 0; state.grounded = true; }
    }

    // Walk-cycle swing.
    if (state.moving) state.walkPhase += dt * (state.running ? 13 : 9);
    const swing = state.moving ? Math.sin(state.walkPhase) * (state.running ? 0.9 : 0.6) : 0;
    body.legL.rotation.x = swing;
    body.legR.rotation.x = -swing;
    body.armL.rotation.x = -swing * 0.7;
    body.armR.rotation.x = swing * 0.7;
    if (state.punchAnim > 0) {
      state.punchAnim -= dt;
      body.armR.rotation.x = -1.9 * Math.max(0, state.punchAnim / 0.25);
    }
    state.punchTimer = Math.max(0, state.punchTimer - dt);

    body.group.position.copy(state.pos);
    body.group.rotation.y = state.heading;
    updateCamera(dt, camera, state.pos, state.heading, false);
  }

  function updateCamera(dt, camera, focusPos, focusHeading, driving) {
    // In a car the camera relaxes back behind the car when the player is not dragging.
    if (driving && !mouse.dragging) {
      let dh = focusHeading - cam.yaw;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      cam.yaw += dh * Math.min(1, dt * 1.6);
    }
    const lookAt = cam.target;
    lookAt.set(focusPos.x, focusPos.y + (driving ? 1.6 : 1.7), focusPos.z);
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    const desired = new THREE.Vector3(
      lookAt.x - Math.sin(cam.yaw) * cp * cam.dist,
      lookAt.y + sp * cam.dist,
      lookAt.z - Math.cos(cam.yaw) * cp * cam.dist,
    );
    if (desired.y < 0.7) desired.y = 0.7;
    cam.pos.lerp(desired, Math.min(1, dt * 8));
    camera.position.copy(cam.pos);
    camera.lookAt(lookAt);
  }

  function setCameraYaw(yaw) { cam.yaw = yaw; }
  function getCameraYaw() { return cam.yaw; }

  function teleport(x, z) {
    state.pos.set(x, 0, z);
    body.group.position.copy(state.pos);
    cam.pos.set(x - Math.sin(cam.yaw) * cam.dist, 4, z - Math.cos(cam.yaw) * cam.dist);
  }

  return { state, body, cam, update, setCameraYaw, getCameraYaw, teleport };
}
