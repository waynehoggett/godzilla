# Godzilla Minus One — fan game

A 3D browser game built with [Three.js](https://threejs.org/) and Vite. Two modes, and you can switch between them from the pause menu at any time:

- **Story Mode** — you are Koichi Shikishima. Seven chapters follow the events of *Godzilla Minus One*, from Odo Island in 1945 to the last flight over Sagami Bay.
- **Kaiju Brawl** — you are Godzilla. Fight Rodan, Mothra, Mechagodzilla and King Ghidorah one at a time, or all four in a row on the ladder.

Everything is generated in code: the models are built from Three.js primitives and all sound is synthesized with the Web Audio API, so there are no asset files to download.

> Unofficial, non-commercial fan project. Godzilla and related characters are trademarks of Toho Co., Ltd. This game is not affiliated with or endorsed by Toho.

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
| Guard, sprint, boost, take cover | Shift |
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

- Claw hits chain into a three-hit combo; the tail sweep is slower but staggers.
- Hold the heat ray button to charge (the dorsal fins light from the tail to the neck), release to fire. It costs energy, which refills over time and with each hit you land.
- Flying rivals are out of reach of your claws until they dive or land. The heat ray and the roar bring them down.
- Blocking cuts most damage but not poison scales.

## Deploy to Vercel

The project is a static Vite build, which Vercel detects on its own.

1. Go to https://vercel.com/new and import this repository.
2. Keep the detected settings (framework: Vite, build command `npm run build`, output directory `dist`).
3. Deploy. Every later push to the production branch redeploys automatically.

## Project layout

```
index.html              page shell and HUD markup
src/main.js             game loop, menus, mode switching, save data
src/core/               input, audio synth, UI overlay, effects, scene base
src/models/             Godzilla, rivals, vehicles, people (all procedural)
src/world/              sky, ocean shader, city generator, props
src/story/              chapter scenes, title-card script, on-foot / turret / flight controllers
src/brawl/              fighter logic, rival roster and AI attacks
```

Developer shortcuts: `/?scene=ch3` jumps to a chapter, `/?scene=brawl&rival=ghidorah&arena=bay` to a fight, `/?scene=view&m=godzilla&spin` shows a model on a turntable, and `&skip` skips the title cards.
