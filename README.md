# Godzilla Minus One — fan game

A 3D browser game built with [Three.js](https://threejs.org/) on its WebGPU renderer (with automatic WebGL 2 fallback). Two modes, and you can switch between them from the pause menu at any time:

- **Story Mode** — you are Koichi Shikishima. Seven chapters follow the events of *Godzilla Minus One*, from Odo Island in 1945 to the last flight over Sagami Bay.
- **Kaiju Brawl** — you are Godzilla. Fight Rodan, King Kong, Mechagodzilla and King Ghidorah one at a time, or all four in a row on the ladder.

> Unofficial, non-commercial fan project. Godzilla and related characters are trademarks of Toho Co., Ltd. This game is not affiliated with or endorsed by Toho. Model sources, licences and a provenance caveat are in [CREDITS.md](CREDITS.md); keep this project non-commercial.

## Graphics

- WebGPU renderer, TSL node materials, ACES tone mapping, shadows, image-based lighting and bloom (the dorsal fins and heat ray are true HDR light sources).
- Rigged monsters driven by their own animation clips (walk, attacks, tail swing, roar, atomic breath); people in 1940s dress built in code on an animated skeleton.
- Generated sound effects and voiced dialogue, with a synthesized score.
- Cities built at load time by Three.js's `CityGenerator` / `SkyscraperGenerator` (brick towers with lit interiors, sidewalks, parked cars, street trees) — and every tower can be knocked down.
- Hills and forest from `TerrainGenerator` / `ForestGenerator`; crowds from `PersonGenerator`.
- Sourced Zero, Shinden, destroyer and gun models, with code-built `LoftGeometry` versions as fallbacks; the boats are built in code.
- **Main menu → Graphics: Low** turns off bloom and shadows and lowers the resolution for slower devices.

## Run it

```bash
npm install
```

```bash
npm run dev
```

Then open the address Vite prints (usually http://localhost:5173).

## Controls

Works with keyboard and mouse, or with touch (a thumb stick appears on the left, action buttons on the right). Each scene lists its own controls at the bottom of the screen.

| Action | Keyboard / mouse |
| --- | --- |
| Move, steer, aim | WASD or arrow keys (the mouse also aims the deck gun) |
| Main action: fire, claw, heave | Space, J or left click |
| Second action: tail sweep | K or right click |
| Special: heat ray (hold), release mine, eject | E or L |
| Guard (hold), sidestep (tap with a direction), sprint, boost, take cover | Shift |
| Roar | R |
| Pause, restart, switch mode | Esc |

Red rings on the ground show where an attack or falling wreckage is about to land.

### Story chapters

1. **Odo Island** — reach your Zero, then run.
2. **Shinsei Maru** — shoot the drifting mines with the deck gun.
3. **The Chase** — hold Godzilla off from the stern, release the mines, shoot the one in his mouth, take cover.
4. **Ginza** — find Noriko and get out before the heat ray.
5. **The Lure** — fly the Shinden past his head and lead him out to the trench.
6. **Wada Tsumi** — keep his attention while the destroyers close the loop, then call the rhythm to haul him up.
7. **To Live** — fly into his mouth and eject in time.

### Kaiju Brawl tips

- Claw presses chain into a three-hit combo (claw, claw, bite); the tail sweep is slower but hits all round and staggers.
- Tap Shift with a direction to sidestep out of a warning ring; hold Shift to block.
- Heavy hits drain a rival's poise; empty it and they go down for a moment, open to a full combo. Below a third of their health they become enraged.
- Hold the heat ray button to charge (the dorsal fins light from the tail to the neck), release to fire. It costs energy, which refills over time and with each hit you land.
- Rodan is out of reach of your claws until he dives or lands. The heat ray and the roar bring him down.
- Blocking cuts most damage.

## Swapping models

The Zero, Shinden, destroyer and deck gun come from `public/models/` through `public/models/extra.json`:

```json
{
  "zero": { "file": "zero.glb", "yaw": 180 },
  "shinden": { "file": "shinden.glb", "yaw": 0 }
}
```

Slots: `zero`, `shinden`, `gun`, `boat`, `destroyer`. A listed model is scaled to the right length automatically; `yaw` (degrees) turns it so the nose or bow points along +Z, and `scale` is an optional multiplier. Remove an entry and the game falls back to its code-built version of that vehicle.

## Player feedback

"Send Feedback" on the main menu and the pause menu posts to `api/feedback.js`, a Vercel function. Every report is written to the function log. To also file each one as a GitHub issue (label `player-feedback`), add an environment variable in the Vercel project:

- `GITHUB_TOKEN` — a fine-grained personal access token limited to this repository with **Issues: Read and write**.
- `FEEDBACK_REPO` — optional, `owner/name`; defaults to `waynehoggett/godzilla`.

Reports carry the scene, graphics setting, renderer, viewport and browser, and nothing personal.

## Deploy to Vercel

The project is a static Vite build, which Vercel detects on its own. The repository is private, so use **Add New → Project → Import Git Repository** (and grant the Vercel GitHub App access to it) rather than pasting the URL, or deploy from a terminal:

```bash
npx vercel deploy --prod
```

## Project layout

```
index.html              page shell and HUD markup
public/models/          models (see CREDITS.md) and extra.json
public/audio/           generated sound effects and voiced dialogue
api/feedback.js         Vercel function that receives player feedback
src/main.js             renderer set-up, game loop, menus, mode switching, save data
src/core/               input, audio synth, UI overlay, effects, asset loading, scene base (render pipeline)
src/models/             rig driver, Godzilla, rivals, vehicles, people
src/world/              sky, ocean, generated city, hills, props
src/story/              chapter scenes, title-card script, on-foot / turret / flight controllers
src/brawl/              combat, rival roster and AI, dev autopilot
```

Developer shortcuts: `/?scene=ch3` jumps to a chapter, `/?scene=brawl&rival=kong&arena=city` to a fight, `/?scene=view&m=zero&spin` shows a model on a turntable, `&skip` skips the title cards, `&lite` forces low graphics, and `/?scene=brawl&rival=kong&bot` lets an autopilot play Godzilla (used to measure balance).
