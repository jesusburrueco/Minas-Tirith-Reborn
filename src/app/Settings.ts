import type { QualityChoice } from './Quality';

export type TurnMode = 'snap' | 'smooth';

export interface Settings {
  quality: QualityChoice;
  /** Zona muerta radial de los sticks (0–0.4). */
  deadzone: number;
  turnMode: TurnMode;
  snapAngleDeg: number;
  smoothTurnDegPerSec: number;
  /** Intensidad máxima de la viñeta de confort (0 = desactivada). */
  vignette: number;
  /** Distancia interpupilar del modo estéreo propio, en mm. */
  ipdMm: number;
  /** Separación entre los centros de las lentes del visor, en mm. */
  lensSeparationMm: number;
  /** Corrección de distorsión de lente (barrel) en el modo estéreo propio. */
  lensCorrection: boolean;
  /** Campo de visión vertical de cada ojo en el modo estéreo propio. */
  stereoFovDeg: number;
  showStats: boolean;
  eyeHeight: number;
  mouseSensitivity: number;
}

export const DEFAULT_SETTINGS: Settings = {
  quality: 'auto',
  deadzone: 0.15,
  turnMode: 'snap',
  snapAngleDeg: 30,
  smoothTurnDegPerSec: 90,
  vignette: 0.6,
  ipdMm: 64,
  lensSeparationMm: 64,
  lensCorrection: false,
  stereoFovDeg: 85,
  showStats: false,
  eyeHeight: 1.65,
  mouseSensitivity: 0.0022,
};

const STORAGE_KEY = 'mtr.settings.v1';

type Listener = (key: keyof Settings, s: Settings) => void;

/** Ajustes persistidos en localStorage (si está disponible). */
export class SettingsStore {
  readonly values: Settings;
  private listeners = new Set<Listener>();

  constructor() {
    this.values = { ...DEFAULT_SETTINGS, ...this.load() };
  }

  set<K extends keyof Settings>(key: K, value: Settings[K]): void {
    if (this.values[key] === value) return;
    this.values[key] = value;
    this.save();
    for (const l of this.listeners) l(key, this.values);
  }

  onChange(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private load(): Partial<Settings> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Partial<Settings>) : {};
    } catch {
      return {};
    }
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.values));
    } catch {
      /* modo privado o almacenamiento bloqueado: se ignora */
    }
  }
}
