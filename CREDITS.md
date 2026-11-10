# Créditos y licencias

Inspirado en la descripción de *El Señor de los Anillos* de J. R. R. Tolkien. Proyecto de fans, sin ánimo de lucro.
No usa diseños, assets ni música de las películas.

## Bibliotecas

| Biblioteca | Uso | Licencia | Fuente |
|---|---|---|---|
| three.js (incl. KTX2Loader y transcoder Basis) | Runtime | MIT / Apache-2.0 (Basis Universal) | https://github.com/mrdoob/three.js |
| three-mesh-bvh | Runtime (colisiones) | MIT | https://github.com/gkjohnson/three-mesh-bvh |
| Vite, @vitejs/plugin-basic-ssl | Desarrollo | MIT | https://vitejs.dev |
| sharp | Herramientas (redimensionar texturas) | Apache-2.0 | https://sharp.pixelplumbing.com |
| ktx2-encoder (Basis Universal) | Herramientas (codificar KTX2) | MIT / Apache-2.0 | https://github.com/gz65555/ktx2-encoder |
| fflate | Herramientas (descomprimir zip) | MIT | https://github.com/101arrowz/fflate |

## Assets

Solo assets **CC0** (dominio público). Las texturas se descargan con `npm run assets:fetch` y se convierten con
`npm run assets:build`, que regenera la tabla de abajo a partir de `tools/assets.json`.

Procedurales (creados en el propio proyecto, sin licencia de terceros): terreno y montañas, cielo, nubes, estrellas,
agua, hierba, árboles y su textura de hojas (dibujada en un canvas), granjas, el Rammas Echor, Osgiliath, la maqueta
provisional de la ciudad y la zona de pruebas.

<!-- assets:start -->
| Asset | Tipo | Autor | Fuente | Licencia |
|---|---|---|---|---|
| grass_albedo / grass_nrm (.ktx2) | Textura PBR — Terreno: hierba del Pelennor | ambientCG (Lennart Demes) | [Grass004](https://ambientcg.com/view?id=Grass004) | CC0 1.0 |
| soil_albedo / soil_nrm (.ktx2) | Textura PBR — Terreno: tierra arada | Amal Kumar | [Farm Soil](https://polyhaven.com/a/farm_soil) | CC0 1.0 |
| dirt_albedo / dirt_nrm (.ktx2) | Textura PBR — Terreno: tierra y orillas | Rob Tuytel | [Brown Mud Dry](https://polyhaven.com/a/brown_mud_dry) | CC0 1.0 |
| rock_albedo / rock_nrm (.ktx2) | Textura PBR — Terreno: roca de montaña | Greg Zaal, Dario Barresi | [Rock Face](https://polyhaven.com/a/rock_face) | CC0 1.0 |
| road_albedo / road_nrm (.ktx2) | Textura PBR — Terreno: caminos | Amal Kumar | [Gravel Road](https://polyhaven.com/a/gravel_road) | CC0 1.0 |
| bark_albedo / bark_nrm (.ktx2) | Textura PBR — Árboles y cercas | Rob Tuytel | [Bark Brown 02](https://polyhaven.com/a/bark_brown_02) | CC0 1.0 |
| wall_albedo / wall_nrm (.ktx2) | Textura PBR — Rammas Echor | Rob Tuytel | [Defense Wall](https://polyhaven.com/a/defense_wall) | CC0 1.0 |
| plaster_albedo / plaster_nrm (.ktx2) | Textura PBR — Granjas: muros | Rob Tuytel | [Plastered Stone Wall](https://polyhaven.com/a/plastered_stone_wall) | CC0 1.0 |
| roof_albedo / roof_nrm (.ktx2) | Textura PBR — Granjas: tejados | Rob Tuytel | [Roof Slates 02](https://polyhaven.com/a/roof_slates_02) | CC0 1.0 |
<!-- assets:end -->
