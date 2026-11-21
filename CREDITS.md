# Credits and licences

This is an unofficial, non-commercial fan project. Godzilla, King Kong, Rodan, Mothra, Mechagodzilla and King Ghidorah are trademarks of their respective owners (Toho Co., Ltd. and others). This game is not affiliated with or endorsed by them.

## 3D models

| Model | Author | Source | Licence |
| --- | --- | --- | --- |
| Godzilla (`public/models/godzilla.glb`, also used re-skinned as Mechagodzilla) | ArachnoBoy | https://sketchfab.com/3d-models/n3s-g0dz11-6004ce3f4d754da18039960f47dea690 | [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) |
| King Kong (`public/models/king_kong.glb`) | NO DONT EAT ME CASEOH (Ferris wheel) | https://sketchfab.com/3d-models/realistic-king-kong-rig-0e03fd879cd2423686263c90dfee28b4 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |

Both files were obtained from https://github.com/krish4uu/threeJs-monsters-world and modified for this game: textures converted to WebP, animations resampled, meshes compressed with Meshopt, Kong's mesh simplified and unused animation clips removed. In the game the Godzilla model's materials are replaced at run time (fin glow under game control, chrome variant for Mechagodzilla).

Because the Godzilla model is licensed **non-commercial, share-alike**, this project must stay non-commercial, and the modified model file is shared under the same CC BY-NC-SA 4.0 licence.

## Code and libraries

- [Three.js](https://threejs.org/) (MIT) — WebGPU renderer, TSL materials, and the procedural generators used for the city (`CityGenerator`, `SkyscraperGenerator` and the street-furniture generators).
- Rodan, Mothra, King Ghidorah, vehicles, people, sky, ocean, effects and all audio are generated in code in this repository.
