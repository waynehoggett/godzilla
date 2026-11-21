# Credits and licences

This is an unofficial, non-commercial fan project. Godzilla, King Kong, Rodan, Mechagodzilla and King Ghidorah are trademarks of their respective owners (Toho Co., Ltd. and others). This game is not affiliated with or endorsed by them.

## 3D models

All were downloaded from Sketchfab, where each uploader published them under the licence shown.

| Model (file in `public/models/`) | Uploader | Source | Licence shown |
| --- | --- | --- | --- |
| Godzilla (`godzilla21.glb`) | NO DONT EAT ME CASEOH (Ferris wheel) | https://sketchfab.com/3d-models/godzilla-2021-rig-0889550eb8b94ba09aeb7f2070cb885b | CC BY 4.0 |
| King Kong (`king_kong.glb`) | NO DONT EAT ME CASEOH (Ferris wheel) | https://sketchfab.com/3d-models/realistic-king-kong-rig-0e03fd879cd2423686263c90dfee28b4 | CC BY 4.0 |
| King Ghidorah (`ghidorah.glb`) | NO DONT EAT ME CASEOH (Ferris wheel) | https://sketchfab.com/3d-models/king-ghidorah-rig-35fed2b9080c4f9483d0613ce2fddf68 | CC BY 4.0 |
| Mechagodzilla (`mecha.glb`) | NO DONT EAT ME CASEOH (Ferris wheel) | https://sketchfab.com/3d-models/mecha-godzilla-rig-add095bb1b844b28a7544dd1e18a113c | CC BY 4.0 |
| Rodan (`rodan.glb`) | elmaskapito133 | https://sketchfab.com/3d-models/rodan-2004-35d8e1f0edd44bd88ef12d20f706729d | CC BY 4.0 |
| A6M3 Zero (`zero.glb`) | manilov.ap | https://sketchfab.com/3d-models/a6m3-5db42f9a1fda4c5492561b61f87a9058 | CC BY 4.0 |
| J7W Shinden (`shinden.glb`) | jkillgore | https://sketchfab.com/3d-models/shinden-fighter-airplane-0265d202c69f4c5d85c79f7d8a7a38cf | CC BY 4.0 |
| Type 96 25 mm gun (`gun.glb`) | Daniel_Bakunin | https://sketchfab.com/3d-models/game-ready-asset-antiaircraft-gun-25mm-type-96-ae14b1a65be444f0a01f41844e142529 | CC BY 4.0 |
| Destroyer Samidare (`destroyer.glb`) | everlasting17th | https://sketchfab.com/3d-models/samidare-destroyer-b37939147c854e61857f5b248f9efd29 | CC BY 4.0 |

**Provenance caveat.** The licence on a Sketchfab page is declared by whoever uploaded the file. The five monster rigs look like assets extracted from commercial games, so their CC BY label may not reflect the real rights holder. They are used here for a private, non-commercial fan project on that understanding; if a rights holder objects, the files should be removed (the game keeps working with any model missing from `public/models/extra.json`, and rivals can be removed from `src/brawl/roster.js`).

**Changes made.** Every file was optimised for the web: textures resized and converted to WebP, animations resampled and trimmed to the clips the game uses, meshes compressed with Meshopt, and the Mechagodzilla, Kong and destroyer meshes simplified. In the game, Godzilla's dorsal-spike glow is driven by a custom material, Rodan's untextured body gets a procedural hide material, and the Zero gets added landing gear.

## Animation skeleton

- `soldier.glb`: a Mixamo character distributed with the Three.js examples (https://github.com/mrdoob/three.js/tree/dev/examples/models/gltf). Only its skeleton and its idle / walk / run clips are used; the visible figures are built in code. Mixamo terms apply (free to use; not a Creative Commons licence).

## Audio

- Sound effects (`public/audio/sfx/`) and voiced dialogue (`public/audio/vo/`) were generated with ElevenLabs (text-to-sound-effects and text-to-speech) from prompts and the game's own script. The musical score and the fallback effects are synthesized in the browser.

## Code and libraries

- [Three.js](https://threejs.org/) (MIT): WebGPU renderer, TSL materials, and the addons used here — `CityGenerator`, `SkyscraperGenerator`, `PersonGenerator`, `TerrainGenerator`, `ForestGenerator`, `LoftGeometry`.
- The people, the boats, the code-built fallback aircraft and ships, sky, ocean and effects are written in this repository.
