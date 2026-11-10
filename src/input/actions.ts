/**
 * Estado de entrada de un fotograma, independiente del dispositivo.
 * Los booleanos de "pulsación" solo son true en el fotograma en que se pulsan.
 */
export interface InputFrame {
  /** Movimiento: x = derecha, y = adelante. Magnitud ≤ 1. */
  move: { x: number; y: number };
  run: boolean;
  /** Giro suave: -1..1, positivo = derecha. */
  turnAxis: number;
  /** Giro por pasos: -1 izquierda, +1 derecha, 0 nada. */
  snapTurn: -1 | 0 | 1;
  /** Ratón en píxeles (solo escritorio con pointer lock). */
  look: { x: number; y: number };
  /** Hora del día: -1..1 mientras se mantiene L1/R1. */
  timeAxis: number;

  jump: boolean;
  interact: boolean;
  menu: boolean;
  recenter: boolean;

  // Navegación de menú
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  confirm: boolean;
  back: boolean;

  /** Ranura de teletransporte de depuración (0–9) o null. */
  teleportSlot: number | null;
}

export function emptyFrame(): InputFrame {
  return {
    move: { x: 0, y: 0 }, run: false, turnAxis: 0, snapTurn: 0, look: { x: 0, y: 0 }, timeAxis: 0,
    jump: false, interact: false, menu: false, recenter: false,
    up: false, down: false, left: false, right: false, confirm: false, back: false,
    teleportSlot: null,
  };
}

export function resetFrame(f: InputFrame): void {
  f.move.x = f.move.y = 0;
  f.run = false;
  f.turnAxis = 0;
  f.snapTurn = 0;
  f.look.x = f.look.y = 0;
  f.timeAxis = 0;
  f.jump = f.interact = f.menu = f.recenter = false;
  f.up = f.down = f.left = f.right = f.confirm = f.back = false;
  f.teleportSlot = null;
}

/** Zona muerta radial con reescalado, para que el movimiento empiece suave desde 0. */
export function applyDeadzone(x: number, y: number, dz: number): { x: number; y: number } {
  const m = Math.hypot(x, y);
  if (m < dz) return { x: 0, y: 0 };
  const scaled = Math.min(1, (m - dz) / (1 - dz));
  return { x: (x / m) * scaled, y: (y / m) * scaled };
}
