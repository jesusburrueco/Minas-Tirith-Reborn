# Minas Tirith — Campos del Pelennor (VR web)

Recorrido en primera persona por los Campos del Pelennor y Minas Tirith, **según la descripción de los libros de Tolkien**
(no usa diseños, assets ni música de las películas). Pensado para móvil con gafas tipo Google Cardboard y mando de PS4.

Vite + TypeScript + Three.js (WebGL2 + WebXR). Sin backend: `npm run build` genera una web estática en `dist/`.

## Arrancar

```bash
npm install
npm run dev        # https://localhost:5173 y https://<IP-de-tu-PC>:5173 en la LAN
npm run build      # comprueba tipos y genera dist/
npm run preview    # sirve dist/ por HTTPS en la LAN (puerto 4173)
```

El certificado HTTPS es autofirmado (plugin `@vitejs/plugin-basic-ssl`): el navegador avisará una vez.
WebXR, el giroscopio y el mando **exigen HTTPS**.

➡️ **Pruebas en el móvil: [docs/PRUEBAS-MOVIL.md](docs/PRUEBAS-MOVIL.md)**

## Modos de visualización

| Modo | Dónde | Cabeza | Notas |
|---|---|---|---|
| **Entrar en VR** | Chrome Android | WebXR `immersive-vr` (Cardboard) | La resolución de la sesión se fija al entrar. |
| **Modo estéreo** | iPhone / navegadores sin WebXR | DeviceOrientation (en iOS pide permiso al tocar) | IPD, FOV y corrección de lente (barrel) configurables en el menú → *Visor estéreo*. |
| **Escritorio** | PC | Ratón (clic para capturar) | Para desarrollo. |

La pantalla inicial detecta lo que soporta el dispositivo y resalta el modo recomendado.

## Controles

| Acción | Mando PS4 | Teclado / ratón | Sin mando (Cardboard) |
|---|---|---|---|
| Moverse (hacia donde miras) | Stick izquierdo | WASD / flechas | Mantener pulsada la pantalla |
| Girar el cuerpo | Stick derecho (por pasos de 30°, o suave) | Ratón | Girar la cabeza |
| Correr | R2 | Shift | — |
| Saltar | X | Espacio | — |
| Interactuar (puertas, carteles) | Círculo | E | Toque simple |
| Menú de ajustes | Options | M / Tab | Doble toque, o el botón ⚙ en estéreo |
| Hora del día −/+ | L1 / R1 | F / R | Menú → Hora del día |
| Recentrar la vista | Triángulo | C | Menú → Recentrar |
| Teletransporte (depuración) | Menú → Teletransporte | 1–9, 0 | Menú → Teletransporte |

En el menú: cruceta o stick para elegir, ←/→ para cambiar valores, X aceptar, Círculo volver.
Sin mando, mira una fila y toca la pantalla.

**Puntos de teletransporte** (teclas en escritorio): 1 Inicio · Pelennor, 2 Gran Puerta, 3–9 Niveles 1–7, 0 Ciudadela,
y "Zona de pruebas" desde el menú. Los que todavía no existen aparecen atenuados.

## Estado por fases

- [x] **Fase 1 — Base.** Modos VR, estéreo y escritorio; mando PS4 (zona muerta, reconexión, aviso); movimiento con
  gravedad, salto, colisiones y escaleras; viñeta de confort; menú 3D; HUD con fps/draw calls; calidad Baja/Media/Alta
  y automática; zona de pruebas; maqueta de referencia de la ciudad.
- [x] **Fase 2 — Pelennor.** Terreno de 64 km con LOD continuo, Mindolluin y Ered Nimrais nevados, Ephel Dúath,
  el Anduin, arroyos, caminos, parcelas de cultivo, granjas, huertos, el Rammas Echor y Osgiliath en ruinas;
  cielo con nubes, sol, luna y estrellas; niebla por altura; ciclo día/noche; hierba y árboles con viento.
- [ ] Fase 3 — Minas Tirith procedural: siete niveles, puertas en zigzag, espolón, calles y LOD lejano.
- [ ] Fase 4 — Ciudadela, Torre Blanca, Patio del Manantial, casas, escaleras y arcos.
- [ ] Fase 5 — NPCs, estandartes, humo, pájaros, agua y audio.
- [ ] Fase 6 — Optimización final y pruebas en dispositivo.

### Qué probar en la fase 2

- **Inicio**: sobre el camino de Osgiliath, a 2 km de la Gran Puerta, mirando al oeste. Delante, el Mindolluin y una
  **maqueta provisional** de la ciudad (la de verdad llega en la fase 3). Detrás (al este), las Ephel Dúath.
- **Teletransporte** (menú): *Rammas Echor (nordeste)* (huertos y la muralla), *Orillas del Anduin* y
  *Trigales bajo el Mindolluin*.
- **Hora**: R1/L1 (o R/F en escritorio). Menú → *Ciclo día/noche*: Parado, Lento, Normal o Rápido.
- **Rendimiento**: en escritorio, unas 20 draw calls y unos 225k triángulos por ojo en calidad Media.

### Qué probar en la fase 1

- **Inicio**: estás en la llanura, 2 km al este de la Gran Puerta, mirando al oeste. Al fondo, una **maqueta provisional**
  de la ciudad (7 niveles + torre) y el Mindolluin. Sirve para comprobar la orientación y la escala. El suelo es una rejilla de 1 m.
- **Zona de pruebas** (Menú → Teletransporte): rampas de 20° y 35° (se suben) y de 55° (no se sube), una escalera de
  12 peldaños, cajas de 0,4/0,8/1,2 m para saltar (las dos primeras se alcanzan), un pasillo de 1 m, una casa con
  puerta (Círculo) y un cartel que se lee.
- **Rendimiento**: Menú → Estadísticas = Sí. Objetivo: 60 fps estables en estéreo en iPhone 13 con calidad Media.

## Estructura

```
src/
  app/        App (bucle y orquestación), Settings (persistidos), Quality (presets + automática)
  render/     RendererFactory, ScreenOverlay (viñeta/fundido), LensDistortion
    modes/    DesktopMode, StereoMode, XRMode, detect
  input/      InputManager → InputFrame; Gamepad, KeyboardMouse, Touch, DeviceOrientation
  player/     Player (rig, cabeza, giro), CharacterController (cápsula cinemática)
  physics/    CollisionWorld (campo de alturas + mallas con BVH)
  world/      World, geo (geografía pura: alturas, río, caminos, campos, Rammas), layout (coordenadas y
              teletransportes), Water, Farms, Rammas, Distant (Osgiliath), TestCourse, Interactables
    terrain/  TerrainData (mapas + worker), TerrainMesh (CDLOD), terrainShaders
  vegetation/ Grass, Trees (procedurales + impostores)
  fx/         Motes (polen)
  sky/        TimeOfDay, Sky (cielo, sol, luna, entorno PMREM), atmosphere (niebla y uniforms compartidos)
  ui/         Hud, Menu3D, Screens (carga e inicio)
  utils/      geometría, texturas procedurales y rutas de assets (assets.ts)
public/
  assets/     assets de runtime (se suben al repo): textures/ hdri/ models/ audio/ basis/
docs/         guías de prueba
tools/        assets.json (manifiesto CC0), fetch-assets.mjs, build-textures.mjs (KTX2), sync-basis.mjs
vercel.json   build, salida y cabeceras para Vercel
```

## Decisiones técnicas

### Fase 2
- **Terreno CDLOD** (`world/terrain`): un quadtree elige cada fotograma los nodos visibles, más finos cerca. Todos se
  dibujan con una sola malla instanciada (**1 draw call**). El vertex shader desplaza la malla con el mapa de alturas
  y funde cada nivel de detalle con el siguiente, así que no hay grietas ni saltos.
- **Dos mapas de altura** generados en el propio móvil con varios *workers*: uno cercano de 8 km a 4 m por texel
  (ciudad, Pelennor y Rammas) y otro lejano de 64 km a 64 m por texel (montañas, Anduin, Ephel Dúath). La CPU (para
  las colisiones) y la GPU muestrean exactamente igual. A las montañas lejanas se les añade relieve en el shader.
- **Campos y caminos** en el shader del terreno: las parcelas (trigo, arado, hortalizas, huerto, pasto, prado) se
  calculan con el mismo hash entero en CPU y GPU, así que la hierba, los árboles y las granjas coinciden con el suelo.
- **Luz ambiental desde el propio cielo** (PMREM) en lugar de un HDRI fijo: con un ciclo día/noche, un HDRI
  estático no encajaría. Se regenera cuando cambia la hora, con un límite de frecuencia para no dar tirones.
- **Niebla por altura** integrada a lo largo del rayo, con dispersión hacia el sol y una penumbra en el horizonte
  oriental (el cielo sombrío de Mordor). Sustituye a la niebla de three en todos los materiales.
- **Hierba sin transparencias** (hojas de geometría en matas): en iOS el *alpha test* es caro. **Árboles** con malla
  cerca e impostores renderizados al cargar a partir de unos 75 m (calidad Media).
- **Texturas**: KTX2 (color ETC1S a 1024 px; normal y rugosidad UASTC a 512 px, porque UASTC apenas comprime).
  En total ocupan 4,6 MB.

- **Orientación del mundo** (`src/world/layout.ts`): +X = este (Anduin, Osgiliath, Ephel Dúath) y −X = oeste (Mindolluin).
  La Gran Puerta mira al este. Las distancias lejanas están comprimidas: el tramo alcanzable del Rammas Echor es el más
  cercano a la ciudad.
- **Capas de pantalla en espacio de recorte**: la viñeta, el fundido y el HUD se dibujan como quads que ignoran la cámara.
  Así aparecen centrados en cada ojo, en WebXR y en estéreo, sin el retraso de un fotograma que tienen los objetos
  hijos de la cámara.
- **Menú 3D en el mundo**: en `immersive-vr` el HTML no se ve. El panel aparece delante de la cabeza al abrirlo.
- **Colisiones sin motor de físicas**: cápsula cinemática + `three-mesh-bvh`. Las superficies caminables (≤50°) empujan
  en vertical, para no resbalar en las rampas. Las más empinadas se comportan como muros. Las escaleras llevan una
  rampa de colisión invisible sobre las narices de los peldaños.
- **Estéreo propio**: sin corrección de lente, cada ojo se dibuja directo en su mitad del canvas (lo más barato). Con
  corrección, se dibuja a un render target HDR y un pase final aplica la distorsión, el tone mapping ACES y la
  conversión a sRGB. En ese modo el texto de la UI se compensa para no verse gris. Las sombras se calculan una vez por
  fotograma, no una por ojo.
- **WebGPU**: el renderer se crea en un único punto (`RendererFactory`). Los shaders a medida son GLSL, y para
  WebGPU habría que portarlos a TSL.

## Despliegue en Vercel

Es una web 100 % estática: Vercel ejecuta `npm run build` y sirve `dist/`. La configuración está en
[`vercel.json`](vercel.json), así que no hay que tocar nada en el panel.

**Primera vez (desde GitHub, recomendado)**
1. Sube el repo a GitHub (`git push`).
2. En [vercel.com/new](https://vercel.com/new) → *Import Git Repository* → elige el repo.
3. Vercel detecta **Vite** y lee `vercel.json`: instalación con `npm ci`, build con `npm run build` (comprueba tipos y
   compila) y salida en `dist`. Pulsa *Deploy*.
4. Cada `git push` a `main` publica en producción. Las ramas y los PR generan URLs de vista previa.

**Desde la terminal (alternativa)**
```bash
npm i -g vercel
vercel          # despliegue de vista previa (la primera vez vincula el proyecto)
vercel --prod   # producción
```

**Qué tener en cuenta**
- **HTTPS incluido**: las URLs `*.vercel.app` tienen certificado válido. WebXR y el giroscopio funcionan sin el aviso
  del certificado autofirmado de desarrollo. Para probar en el móvil basta con abrir la URL del despliegue.
- **Node**: `package.json` exige Node ≥ 22.12 (requisito de Vite 8). Vercel elige la versión a partir de `engines`.
- **Assets de runtime**: todo lo que se carga en ejecución vive en `public/assets/` y **se sube al repo**:
  `textures/` (KTX2), `hdri/`, `models/` (glTF/GLB), `audio/` y `basis/` (transcoder Basis de three.js). Los
  originales en bruto van en `raw-assets/`, que está ignorada. Tras actualizar `three`, ejecuta
  `npm run sync:basis` y sube el transcoder, que debe coincidir con la versión del `KTX2Loader`.
- **Rutas**: el proyecto usa `base: './'` y `assetUrl('textures/x.ktx2')` (`src/utils/assets.ts`). Nunca uses rutas
  absolutas como `/assets/...` ni rutas del disco: así funciona igual en Vercel, en una subcarpeta o en local.
- **Caché**: el JS/CSS con hash sale en `dist/bundle/` con caché inmutable de 1 año. Los assets de `/assets/` se
  cachean 1 día y se revalidan en segundo plano, porque no llevan hash en el nombre: si cambias el contenido de un asset,
  cambia también su nombre (`piedra_v2.ktx2`) para que nadie vea una versión vieja.
- **Cabeceras**: `vercel.json` fija los tipos MIME de `.ktx2`, `.wasm`, `.hdr` y `.glb`, y una `Permissions-Policy`
  que permite WebXR, giroscopio, mando y bloqueo de pantalla solo en el propio dominio.
- **Tamaño**: GitHub rechaza archivos de más de 100 MB. Ningún asset comprimido debería acercarse a eso. Si alguno lo
  hace, usa Git LFS y actívalo en Vercel (*Settings → Git → Git LFS*).
- `dist/`, `node_modules/` y `.vercel/` no se suben: Vercel los regenera.

Créditos y licencias: [CREDITS.md](CREDITS.md).
