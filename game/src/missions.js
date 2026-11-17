// missions.js — Rico's jobs: the story chain for Solmar City.
// One clear job: three chained missions with objectives, a 3D beacon marker,
// pass/fail, cash rewards and the phone texts from Rico that carry the story.
import * as THREE from 'three';
import { sfx } from './audio.js';

export const MISSION_DEFS = [
  {
    id: 'm1',
    name: 'THE PICKUP',
    brief: 'Rico: "Danny! A package is waiting at the docks. Grab it and bring it back to my corner. No cops, no drama."',
    reward: 500,
    steps: [
      { text: 'Drive to the docks and pick up the package', target: 'docks', radius: 4 },
      { text: 'Bring the package back to Rico\'s corner', target: 'rico', radius: 4 },
    ],
  },
  {
    id: 'm2',
    name: 'HOT DELIVERY',
    brief: 'Rico: "That package was hotter than I thought — the PD is on you. Lose them, then drop it at the plaza. Clock\'s ticking."',
    reward: 800,
    startWanted: 2,
    timeLimit: 150,
    steps: [
      { text: 'Lose the cops — break line of sight until the stars clear', target: null, needClear: true },
      { text: 'Deliver the package to the north plaza', target: 'plaza', radius: 4 },
    ],
  },
  {
    id: 'm3',
    name: 'THE GETAWAY',
    brief: 'Rico: "Last one, Danny. The whole PD wants a piece of you now. Hit the beach checkpoint, then the tower, then vanish. Do it and we\'re square."',
    reward: 1200,
    startWanted: 3,
    steps: [
      { text: 'Reach the beach checkpoint — 3 stars and counting', target: 'docks', radius: 5 },
      { text: 'Cut through the tower plaza', target: 'tower', radius: 6 },
      { text: 'Lose the heat completely to finish the job', target: null, needClear: true },
    ],
  },
];

export function createMissions(scene, landmarks) {
  // The beacon: a tall glowing column + a bouncing ring at the objective.
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.35 });
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 60, 12, 1, true), beaconMat);
  beacon.visible = false;
  scene.add(beacon);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.4, 3.0, 24), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  scene.add(ring);

  const state = {
    completed: [],      // mission ids finished
    active: null,       // { def, step, timer }
    failed: null,
    available: 'm1',
  };

  function currentTarget() {
    if (!state.active) return null;
    const step = state.active.def.steps[state.active.step];
    if (!step || !step.target) return null;
    const lm = landmarks[step.target];
    return lm ? { x: lm.x, z: lm.z, radius: step.radius } : null;
  }

  function objectiveText() {
    if (!state.active) return null;
    const step = state.active.def.steps[state.active.step];
    let text = step ? step.text : '';
    if (state.active.timer !== null) {
      const t = Math.max(0, Math.ceil(state.active.timer));
      text += `  —  ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    }
    return { name: state.active.def.name, text };
  }

  function startMission(id, world) {
    const def = MISSION_DEFS.find((m) => m.id === id);
    if (!def) return false;
    state.active = { def, step: 0, timer: def.timeLimit ?? null };
    state.failed = null;
    if (def.startWanted) world.police.addWanted(def.startWanted, 'mission heat');
    world.showPhone('RICO', def.brief);
    sfx.mission();
    return true;
  }

  function nextAvailable() {
    for (const def of MISSION_DEFS) {
      if (!state.completed.includes(def.id)) return def.id;
    }
    return null;
  }

  function update(dt, world) {
    // Animate the beacon.
    const target = currentTarget();
    if (target) {
      beacon.visible = true;
      ring.visible = true;
      beacon.position.set(target.x, 30, target.z);
      ring.position.set(target.x, 0.15 + Math.sin(performance.now() / 300) * 0.25, target.z);
    } else {
      beacon.visible = false;
      ring.visible = false;
    }
    if (!state.active) return;
    const a = state.active;
    if (a.timer !== null) {
      a.timer -= dt;
      if (a.timer <= 0) {
        failMission(world, 'Out of time — Rico found someone else.');
        return;
      }
    }
    const step = a.def.steps[a.step];
    const p = world.playerPos();
    if (step.needClear) {
      if (world.police.wanted === 0) advance(world);
    } else if (step.target) {
      const t = currentTarget();
      if (t && Math.hypot(p.x - t.x, p.z - t.z) < t.radius) {
        sfx.pickup();
        advance(world);
      }
    }
  }

  function advance(world) {
    const a = state.active;
    a.step += 1;
    if (a.step >= a.def.steps.length) {
      state.completed.push(a.def.id);
      world.addCash(a.def.reward);
      world.showBig('JOB DONE', `+$${a.def.reward} — ${a.def.name} complete`);
      sfx.cash();
      const next = nextAvailable();
      state.available = next;
      state.active = null;
      if (next) {
        const def = MISSION_DEFS.find((m) => m.id === next);
        world.showPhone('RICO', `Nice work. Next job's ready when you are: ${def.name}. Press M to see it.`);
      } else {
        world.showPhone('RICO', 'That\'s all of them, Danny. Solmar is yours now — keep the engine warm.');
      }
      world.onMissionComplete();
    } else {
      world.showToast('Objective updated');
      sfx.mission();
    }
  }

  function failMission(world, reason) {
    const def = state.active.def;
    state.failed = def.id;
    state.active = null;
    state.available = def.id;
    world.showBig('JOB FAILED', reason);
    sfx.fail();
  }

  function abortActive(world) {
    if (!state.active) return;
    failMission(world, 'Job abandoned.');
  }

  function applySave(data) {
    if (Array.isArray(data.completed)) state.completed = data.completed.filter((id) => MISSION_DEFS.some((m) => m.id === id));
    state.available = nextAvailable();
  }

  return {
    state, startMission, update, abortActive, currentTarget, objectiveText,
    nextAvailable, applySave, MISSION_DEFS,
  };
}
