# Godzilla Minus One — fan game

A 3D browser game built with [Three.js](https://threejs.org/) on its WebGPU renderer (with automatic WebGL 2 fallback). Two modes, and you can switch between them from the pause menu at any time:

- **Story Mode** — you are Koichi Shikishima. Seven chapters follow the events of *Godzilla Minus One*, from Odo Island in 1945 to the last flight over Sagami Bay.
- **Kaiju Brawl** — you are Godzilla. Fight Rodan, Mothra, King Kong, Mechagodzilla and King Ghidorah one at a time, or all five in a row on the ladder.

> Unofficial, non-commercial fan project. Godzilla and related characters are trademarks of Toho Co., Ltd. This game is not affiliated with or endorsed by Toho. Model authors and licences are listed in [CREDITS.md](CREDITS.md); the Godzilla model's licence (CC BY-NC-SA) means this project must stay non-commercial.

## Graphics

- WebGPU renderer, TSL node materials, ACES tone mapping, shadows, image-based lighting and bloom (the dorsal fins and heat ray are true HDR light sources).
- Rigged, textured Godzilla and King Kong; rigged animated people.
- Cities built at load time by Three.js's `CityGenerator` / `SkyscraperGenerator` (brick towers with lit interiors, sidewalks, parked cars, street trees) — and every tower can be knocked down.
- Hills and forest from `TerrainGenerator` / `ForestGenerator`; crowds from `PersonGenerator`.
- Aircraft, boats, warships and the deck gun are lofted in code with `LoftGeometry` and procedural paint.
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

## Swapping in your own models

The planes, boat, destroyer and deck gun are built in code, but each has a slot for a real model. Put a `.glb` in `public/models/` and list it in `public/models/extra.json`:

```json
{
  "zero": { "file": "zero.glb", "yaw": 0 },
  "shinden": { "file": "shinden.glb", "yaw": 180, "scale": 1 }
}
```

Slots: `zero`, `shinden`, `gun`, `boat`, `destroyer`. The model is scaled to the right length automatically; `yaw` (degrees) turns it so the nose or bow points along +Z, and `scale` is an optional multiplier. Models that fit, all downloadable from Sketchfab with a free account (check each licence and add the credit to `CREDITS.md`): "Mitsubishi A6M2 ZERO - zeke" by SavinienBerault, "Shinden fighter airplane" by jkillgore, "Antiaircraft gun 25mm Type 96" by Daniel_Baku, "Samidare destroyer" by everlastinggrey, "Japanese_boat" by shrimpyboiii.

## Deploy to Vercel

The project is a static Vite build, which Vercel detects on its own. The repository is private, so use **Add New → Project → Import Git Repository** (and grant the Vercel GitHub App access to it) rather than pasting the URL, or deploy from a terminal:

```bash
npx vercel deploy --prod
```

## Project layout

```
index.html              page shell and HUD markup
public/models/          rigged models (see CREDITS.md) and extra.json
src/main.js             renderer set-up, game loop, menus, mode switching, save data
src/core/               input, audio synth, UI overlay, effects, asset loading, scene base (render pipeline)
src/models/             Godzilla, rivals, vehicles, people
src/world/              sky, ocean, generated city, hills, props
src/story/              chapter scenes, title-card script, on-foot / turret / flight controllers
src/brawl/              fighter logic, rival roster and AI attacks
```

Developer shortcuts: `/?scene=ch3` jumps to a chapter, `/?scene=brawl&rival=kong&arena=city` to a fight, `/?scene=view&m=zero&spin` shows a model on a turntable, `&skip` skips the title cards, `&lite` forces low graphics.
