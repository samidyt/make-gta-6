// city.js — procedural Solmar City: streets, buildings, props, beach and colliders.
// One clear job: build the whole static world from a seeded RNG and answer
// collision / road-network questions for the player, cars, traffic and peds.
import * as THREE from 'three';
import { CITY, pick, range } from './config.js';

const FACADE_COLORS = ['#e8dcc8', '#d9c7a7', '#c9b8a3', '#b8c4cc', '#d8b8a8', '#c8d0b8', '#e0cfa8', '#b0a8c0'];
const ROOF_COLORS = ['#8a7a6a', '#6a7a8a', '#7a6a5a', '#5a6a7a', '#94806a'];
const PALM_POSITIONS = [];
let colliders = [];
let streets = [];
let landmarks = {};

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const cylGeo = new THREE.CylinderGeometry(0.12, 0.18, 1, 6);
const coneGeo = new THREE.ConeGeometry(1, 1, 6);
const sphereGeo = new THREE.SphereGeometry(1, 8, 6);

const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6a4a });
const frondMat = new THREE.MeshLambertMaterial({ color: 0x2e8b4a });
const frondMat2 = new THREE.MeshLambertMaterial({ color: 0x3aa85c });
const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a4048 });
const lampMat = new THREE.MeshLambertMaterial({ color: 0xfff2b0, emissive: 0xffe9a0, emissiveIntensity: 0.6 });
const hydrantMat = new THREE.MeshLambertMaterial({ color: 0xc0392b });
const asphaltMat = new THREE.MeshLambertMaterial({ color: 0x2e3238 });
const sidewalkMat = new THREE.MeshLambertMaterial({ color: 0xb8b0a0 });
const groundMat = new THREE.MeshLambertMaterial({ color: 0x9aa88a });
const sandMat = new THREE.MeshLambertMaterial({ color: 0xe8d8a8 });
const waterMat = new THREE.MeshPhongMaterial({ color: 0x2e9fd8, transparent: true, opacity: 0.82, shininess: 120 });

function makeWindowTexture(base, rng) {
  // Canvas texture: facade with a grid of windows, some lit warm.
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 128, 256);
  const cols = 4, rows = 8;
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const lit = rng() < 0.28;
      g.fillStyle = lit ? '#ffe9a0' : (rng() < 0.5 ? '#3a4a5a' : '#2c3a48');
      g.fillRect(8 + x * 30, 10 + y * 30, 20, 20);
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(8 + x * 30, 10 + y * 30, 20, 4);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeRoadTexture(alongU) {
  // Asphalt strip with a dashed centre line. alongU=true: the dash runs along
  // the texture's U axis (east-west roads); false: along V (north-south).
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#2e3238'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#f5d76e';
  if (alongU) g.fillRect(8, 30, 32, 4);
  else g.fillRect(30, 8, 4, 32);
  g.fillStyle = 'rgba(255,255,255,0.08)';
  for (let i = 0; i < 40; i += 1) g.fillRect(Math.random() * 64, Math.random() * 64, 2, 2);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makePalm(scale) {
  const palm = new THREE.Group();
  const trunk = new THREE.Mesh(cylGeo, trunkMat);
  trunk.scale.set(1, 5 * scale, 1);
  trunk.position.y = 2.5 * scale;
  trunk.rotation.z = 0.08;
  palm.add(trunk);
  for (let i = 0; i < 7; i += 1) {
    const frond = new THREE.Mesh(coneGeo, i % 2 ? frondMat : frondMat2);
    frond.scale.set(0.7 * scale, 2.6 * scale, 0.18 * scale);
    const a = (i / 7) * Math.PI * 2;
    frond.position.set(Math.cos(a) * 1.1 * scale, 5.1 * scale, Math.sin(a) * 1.1 * scale);
    frond.rotation.set(Math.sin(a) * 1.9, 0, -Math.cos(a) * 1.9);
    palm.add(frond);
  }
  const nut = new THREE.Mesh(sphereGeo, trunkMat);
  nut.scale.setScalar(0.28 * scale);
  nut.position.y = 5 * scale;
  palm.add(nut);
  return palm;
}

function makeLamp() {
  const lamp = new THREE.Group();
  const pole = new THREE.Mesh(cylGeo, poleMat);
  pole.scale.set(1.4, 7, 1.4);
  pole.position.y = 3.5;
  lamp.add(pole);
  const arm = new THREE.Mesh(boxGeo, poleMat);
  arm.scale.set(1.8, 0.15, 0.15);
  arm.position.set(0.8, 6.9, 0);
  lamp.add(arm);
  const head = new THREE.Mesh(sphereGeo, lampMat);
  head.scale.set(0.35, 0.22, 0.35);
  head.position.set(1.6, 6.8, 0);
  lamp.add(head);
  return lamp;
}

function makeHydrant() {
  const h = new THREE.Group();
  const body = new THREE.Mesh(cylGeo, hydrantMat);
  body.scale.set(1.6, 0.9, 1.6);
  body.position.y = 0.45;
  h.add(body);
  const top = new THREE.Mesh(sphereGeo, hydrantMat);
  top.scale.setScalar(0.22);
  top.position.y = 0.95;
  h.add(top);
  return h;
}

function addBuilding(scene, rng, x, z, w, d, h, mats) {
  const mat = pick(rng, mats);
  const mesh = new THREE.Mesh(boxGeo, mat);
  mesh.scale.set(w, h, d);
  mesh.position.set(x, h / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  // Roof cap + a little rooftop box (AC unit / water tank) for silhouette.
  const roof = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: pick(rng, ROOF_COLORS) }));
  roof.scale.set(w * 0.98, 0.5, d * 0.98);
  roof.position.set(x, h + 0.25, z);
  scene.add(roof);
  if (rng() < 0.6) {
    const unit = new THREE.Mesh(boxGeo, poleMat);
    const s = range(rng, 1.5, 3.5);
    unit.scale.set(s, range(rng, 0.8, 1.6), s);
    unit.position.set(x + range(rng, -w / 4, w / 4), h + 0.9, z + range(rng, -d / 4, d / 4));
    scene.add(unit);
  }
  colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
}

export function buildCity(scene, rng) {
  colliders = [];
  streets = [];
  landmarks = {};
  const { blocks, block, road, pitch, half } = CITY;
  const roadTexU = makeRoadTexture(true);
  const roadTexV = makeRoadTexture(false);

  // Sky, sun and fog — the sun-soaked look.
  scene.background = new THREE.Color(0x87c5e8);
  scene.fog = new THREE.Fog(0x9fd0e8, 140, 420);
  const hemi = new THREE.HemisphereLight(0xbfe3ff, 0x8a7a5a, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2cc, 2.4);
  sun.position.set(80, 140, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -90; sun.shadow.camera.right = 90;
  sun.shadow.camera.top = 90; sun.shadow.camera.bottom = -90;
  sun.shadow.camera.near = 20; sun.shadow.camera.far = 400;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);

  // Ground: grassy base far beyond the city, sand + water to the south (beach).
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.05, 0);
  ground.receiveShadow = true;
  scene.add(ground);
  CITY.beachZ = half + 6;
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(1200, 46), sandMat);
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.02, CITY.beachZ + 20);
  sand.receiveShadow = true;
  scene.add(sand);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(1200, 400), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.05, CITY.beachZ + 240);
  scene.add(water);

  // Street centrelines: blocks+1 streets each way.
  for (let i = 0; i <= blocks; i += 1) streets.push(-half + road / 2 + i * pitch);
  CITY.streets = streets;

  // Road strips (asphalt with dashed centre line) along every street.
  for (const s of streets) {
    // East-west road: long axis along x, at constant z.
    const texX = roadTexU.clone();
    texX.needsUpdate = true;
    texX.repeat.set(half * 2 / 8, 1);
    const rx = new THREE.Mesh(new THREE.PlaneGeometry(half * 2 + road, road),
      new THREE.MeshLambertMaterial({ map: texX }));
    rx.rotation.x = -Math.PI / 2;
    rx.position.set(0, 0.03, s);
    rx.receiveShadow = true;
    scene.add(rx);
    // North-south road: long axis along z, at constant x.
    const texZ = roadTexV.clone();
    texZ.needsUpdate = true;
    texZ.repeat.set(1, half * 2 / 8);
    const rz = new THREE.Mesh(new THREE.PlaneGeometry(road, half * 2 + road),
      new THREE.MeshLambertMaterial({ map: texZ }));
    rz.rotation.x = -Math.PI / 2;
    rz.position.set(s, 0.035, 0);
    rz.receiveShadow = true;
    scene.add(rz);
  }

  // Facade materials (shared across buildings).
  const facadeMats = FACADE_COLORS.map((c) => new THREE.MeshLambertMaterial({ map: makeWindowTexture(c, rng) }));

  // Blocks: sidewalk slab + 1-2 buildings each; taller near the centre.
  for (let bx = 0; bx < blocks; bx += 1) {
    for (let bz = 0; bz < blocks; bz += 1) {
      const cx = streets[bx] + pitch / 2;
      const cz = streets[bz] + pitch / 2;
      const slab = new THREE.Mesh(boxGeo, sidewalkMat);
      slab.scale.set(block + 4, 0.3, block + 4);
      slab.position.set(cx, 0.15, cz);
      slab.receiveShadow = true;
      scene.add(slab);
      const distCentre = Math.hypot(cx, cz) / half; // 0 centre .. ~1 edge
      const tall = 1 - distCentre;
      const count = rng() < 0.45 ? 2 : 1;
      if (count === 1) {
        const w = range(rng, 26, 38), d = range(rng, 26, 38);
        const h = range(rng, 8, 12) + tall * range(rng, 10, 30);
        addBuilding(scene, rng, cx, cz, w, d, h, facadeMats);
      } else {
        const split = rng() < 0.5;
        for (let k = 0; k < 2; k += 1) {
          const off = (k === 0 ? -1 : 1) * 11;
          const w = split ? range(rng, 16, 20) : range(rng, 28, 36);
          const d = split ? range(rng, 28, 36) : range(rng, 16, 20);
          const h = range(rng, 7, 11) + tall * range(rng, 8, 26);
          addBuilding(scene, rng, cx + (split ? off : 0), cz + (split ? 0 : off), w, d, h, facadeMats);
        }
      }
      // Palms on block corners, lamps along the block edge, occasional hydrant.
      for (let k = 0; k < 2; k += 1) {
        const px = cx + (rng() < 0.5 ? -1 : 1) * (block / 2 - 1.5);
        const pz = cz + (rng() < 0.5 ? -1 : 1) * (block / 2 - 1.5);
        const palm = makePalm(range(rng, 0.9, 1.25));
        palm.position.set(px, 0.3, pz);
        palm.rotation.y = rng() * Math.PI * 2;
        palm.traverse((o) => { if (o.isMesh) o.castShadow = true; });
        scene.add(palm);
        PALM_POSITIONS.push([px, pz]);
      }
      if (rng() < 0.5) {
        const lamp = makeLamp();
        lamp.position.set(cx + block / 2 - 1, 0.3, cz);
        lamp.rotation.y = rng() * Math.PI;
        scene.add(lamp);
      }
      if (rng() < 0.3) {
        const hyd = makeHydrant();
        hyd.position.set(cx - block / 2 + 2, 0.3, cz + range(rng, -12, 12));
        scene.add(hyd);
      }
    }
  }

  // Landmark: the Solmar Tower at the centre block (tallest, glassy blue).
  const tower = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x7fb8d8, emissive: 0x1a3a4a, emissiveIntensity: 0.4 }));
  tower.scale.set(18, 72, 18);
  tower.position.set(0, 36, 0);
  tower.castShadow = true;
  scene.add(tower);
  colliders.push({ minX: -9, maxX: 9, minZ: -9, maxZ: 9 });
  const beacon = new THREE.Mesh(sphereGeo, new THREE.MeshBasicMaterial({ color: 0xff4444 }));
  beacon.scale.setScalar(0.8);
  beacon.position.set(0, 73, 0);
  scene.add(beacon);

  // Beach palms in a row along the sand.
  for (let x = -half; x <= half; x += 14) {
    const palm = makePalm(range(rng, 1.0, 1.4));
    palm.position.set(x + range(rng, -3, 3), 0.1, CITY.beachZ + range(rng, 4, 14));
    palm.rotation.y = rng() * Math.PI * 2;
    palm.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    scene.add(palm);
  }

  landmarks = {
    spawn: { x: 0, z: 30 },             // on the avenue just south of the tower
    rico: { x: -30, z: -30 },           // Rico's corner (north-west intersection)
    docks: { x: 150, z: 210 },          // south-east, near the beach
    plaza: { x: 90, z: -90 },           // north-east intersection
    tower: { x: 14, z: 0 },             // plaza edge beside the Solmar Tower
  };

  return {
    colliders,
    streets,
    landmarks,
    sun,
    // Keep the shadow camera centred on the action.
    follow(x, z) {
      sun.position.set(x + 80, 140, z + 60);
      sun.target.position.set(x, 0, z);
      sun.target.updateMatrixWorld();
    },
  };
}

// Push a circle (x, z, radius) out of every building AABB it overlaps. Mutates pos.
export function resolveCircle(pos, radius) {
  for (const c of colliders) {
    const nx = Math.max(c.minX, Math.min(pos.x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
    const dx = pos.x - nx, dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      pos.x = nx + (dx / d) * radius;
      pos.z = nz + (dz / d) * radius;
    } else {
      // Centre inside the box: push out along the smallest penetration axis.
      const pl = pos.x - c.minX, pr = c.maxX - pos.x;
      const pt = pos.z - c.minZ, pb = c.maxZ - pos.z;
      const m = Math.min(pl, pr, pt, pb);
      if (m === pl) pos.x = c.minX - radius;
      else if (m === pr) pos.x = c.maxX + radius;
      else if (m === pt) pos.z = c.minZ - radius;
      else pos.z = c.maxZ + radius;
    }
  }
  // City bounds: soft wall at the edge of the world.
  const b = CITY.half + 30;
  pos.x = Math.max(-b, Math.min(b, pos.x));
  pos.z = Math.max(-b, Math.min(CITY.beachZ + 30, pos.z));
}

// Is (x, z) on a road (within the asphalt of some street)?
export function isOnRoad(x, z) {
  const halfRoad = CITY.road / 2 + 0.5;
  for (const s of streets) {
    if (Math.abs(z - s) < halfRoad || Math.abs(x - s) < halfRoad) return true;
  }
  return false;
}

// Nearest street centreline coordinate to v.
export function nearestStreet(v) {
  let best = streets[0], bd = Infinity;
  for (const s of streets) {
    const d = Math.abs(v - s);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

export function randomStreetPoint(rng) {
  const s = pick(rng, streets);
  const along = range(rng, -CITY.half + 20, CITY.half - 20);
  if (rng() < 0.5) return { x: along, z: s };
  return { x: s, z: along };
}
