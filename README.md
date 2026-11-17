[![Make GTA 6](https://make.fun/badge/gta6-01.svg)](https://make.fun/c/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/samidyt/make-gta-6/rank.svg)](https://make.fun/c/gta6-01)
[![Reward](https://make.fun/badge/gta6-01/samidyt/make-gta-6/reward.svg)](https://make.fun/c/gta6-01)

# SOLMAR CITY — Open World Crime

An entry for the [make.fun "Make GTA 6" competition](https://make.fun/c/gta6-01): a
complete open-world crime game that runs in a desktop browser from static files,
with no network requests. Built with three.js (vendored under `game/vendor/`),
fully procedural — every building, car, pedestrian and sound is generated in code.

Welcome to Solmar, a sun-soaked coastal city where the palms are tall and the
tempers are short. Danny Vega is back in town, broke and owed a favour by Rico,
the fixer who runs the docks. Steal cars, dodge the Solmar PD, run Rico's jobs
and build your name — or end up wasted or busted trying.

## What's in the game

- **A living city**: a 7×7-block grid of streets with procedural buildings,
  palms, lamps, hydrants, a beach and the Solmar Tower — all under a bright sun.
- **On foot and by car**: third-person movement with sprint and jump, plus 16
  parked cars to steal and drive with arcade handling, damage and smoke.
- **Traffic and pedestrians**: AI cars drive the lanes and slow for obstacles;
  pedestrians stroll the sidewalks and flee from danger.
- **Wanted level + police**: 1–5 stars. Police cars chase and ram; foot cops
  arrest you at low wanted and shoot at high wanted. Break line of sight to
  cool the heat.
- **Missions and story**: three chained jobs from Rico — a pickup, a hot
  delivery under time pressure, and a full getaway — with a 3D beacon, phone
  texts and cash rewards.
- **Combat**: fists and a pistol with muzzle flash, hit sparks and ammo.
- **HUD + minimap**: health, armour, cash, wanted stars, speed, weapon, mission
  objective, clock and a live top-down minimap with police blips.
- **Save**: localStorage saves (position, cash, missions) with continue,
  manual save and reset.

## Controls

| Key | Action |
| --- | ------ |
| W A S D | Move / drive |
| Mouse drag | Camera |
| Shift | Sprint |
| Space | Jump / handbrake |
| E | Enter / exit car |
| F | Punch |
| Click | Shoot pistol |
| R | Reload |
| 1 / 2 | Fists / pistol |
| P / Esc | Pause |
| M | Mission list |
| G | Save game |

## Play it

```sh
node serve.ts
# then open http://localhost:8080
```

Screenshot staging for the entry's screenshots (deterministic, `seed=1`):

- `?shot=cover&seed=1` — driving downtown, mission running
- `?shot=chase&seed=1` — 3-star police chase
- `?shot=mission&seed=1` — on foot at Rico's corner, mission active
- `?shot=city&seed=1` — beach vista of the skyline

## Notes

Everything here is original: the city, characters, vehicles, names, story and
sounds are invented for this game. No assets, names or music from any commercial
game are used.
