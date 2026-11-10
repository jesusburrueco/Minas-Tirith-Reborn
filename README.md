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
- [ ] Fase 2 — Terreno del Pelennor, cielo físico, niebla, día/noche y vegetación.
- [ ] Fase 3 — Minas Tirith procedural: siete niveles, puertas en zigzag, espolón, calles y LOD lejano.
- [ ] Fase 4 — Ciudadela, Torre Blanca, Patio del Manantial, casas, escaleras y arcos.
- [ ] Fase 5 — NPCs, estandartes, humo, pájaros, agua y audio.
- [ ] Fase 6 — Optimización final y pruebas en dispositivo.

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
  world/      World, layout (coordenadas canónicas y teletransportes), TestCourse, Interactables
  sky/        TimeOfDay, Lighting
  ui/         Hud, Menu3D, Screens (carga e inicio)
  utils/      geometría y texturas procedurales
docs/         guías de prueba
tools/        (fases siguientes) scripts para procesar assets: KTX2, Meshopt, audio
```

## Decisiones técnicas

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

Créditos y licencias: [CREDITS.md](CREDITS.md).
