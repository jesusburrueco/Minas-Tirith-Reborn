import { Vector3 } from 'three';

/**
 * Coordenadas canónicas del mundo (metros).
 *   +X = este (Anduin, Osgiliath, Ephel Dúath)   −X = oeste (Mindolluin)
 *   −Z = norte                                    +Z = sur
 *   Y = altura sobre la llanura del Pelennor (≈ nivel de la Gran Puerta).
 * La ciudad se apoya en la falda oriental del Mindolluin; el eje de los círculos está en el origen.
 */
export const CITY_CENTER = new Vector3(0, 0, 0);

/** Radio aproximado de la primera muralla (se afina en la fase 3). */
export const FIRST_WALL_RADIUS = 420;

/** La Gran Puerta mira al este. */
export const GREAT_GATE = new Vector3(FIRST_WALL_RADIUS, 0, 0);

/** El jugador empieza en el Pelennor, ~2 km al este de la Gran Puerta, mirando hacia la ciudad. */
export const PLAYER_START = new Vector3(GREAT_GATE.x + 2000, 0, 0);

/** Guiñada que mira hacia el oeste (la cámara mira a −Z con yaw 0). */
export const YAW_WEST = Math.PI / 2;
export const YAW_EAST = -Math.PI / 2;

/** Zona de pruebas de la fase 1 (rampas, escaleras, muros, puerta, cartel), al norte del inicio. */
export const TEST_ZONE = new Vector3(PLAYER_START.x, 0, -70);

export interface TeleportPoint {
  id: string;
  name: string;
  position: Vector3;
  yaw: number;
  /** false = aún no construido (se muestra, pero avisa). */
  available: boolean;
}

/**
 * Puntos de teletransporte de depuración. Los 10 primeros se corresponden con las
 * teclas 1–9 y 0 del modo escritorio. Se activan a medida que existen en cada fase.
 */
export const TELEPORTS: TeleportPoint[] = [
  { id: 'start', name: 'Inicio · Pelennor', position: PLAYER_START.clone(), yaw: YAW_WEST, available: true },
  { id: 'gate', name: 'Gran Puerta', position: new Vector3(GREAT_GATE.x + 40, 0, 0), yaw: YAW_WEST, available: false },
  ...[1, 2, 3, 4, 5, 6, 7].map((n) => ({
    id: `level${n}`,
    name: `Nivel ${n}`,
    position: new Vector3(),
    yaw: YAW_EAST,
    available: false,
  })),
  { id: 'citadel', name: 'Ciudadela', position: new Vector3(), yaw: YAW_EAST, available: false },
  { id: 'test', name: 'Zona de pruebas', position: TEST_ZONE.clone().add(new Vector3(0, 0, 14)), yaw: 0, available: true },
  // Fase 2 (solo desde el menú). La altura se ajusta al terreno al teletransportarse.
  { id: 'rammas', name: 'Rammas Echor (nordeste)', position: new Vector3(2050, 0, -2050), yaw: -Math.PI / 4, available: true },
  { id: 'anduin', name: 'Orillas del Anduin', position: new Vector3(6560, 0, 0), yaw: YAW_EAST, available: true },
  { id: 'wheat', name: 'Trigales bajo el Mindolluin', position: new Vector3(200, 0, 1500), yaw: 1.2, available: true },
];
