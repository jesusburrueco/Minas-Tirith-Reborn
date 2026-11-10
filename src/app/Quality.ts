export type QualityLevel = 'low' | 'medium' | 'high';
export type QualityChoice = QualityLevel | 'auto';

export const QUALITY_LEVELS: QualityLevel[] = ['low', 'medium', 'high'];
export const QUALITY_LABEL: Record<QualityChoice, string> = {
  auto: 'Automática',
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
};

export interface QualityPreset {
  level: QualityLevel;
  /** Tope del devicePixelRatio para el canvas (modos escritorio y estéreo). */
  pixelRatio: number;
  /** Escala del framebuffer WebXR (se aplica al entrar en la sesión). */
  xrFramebufferScale: number;
  shadows: boolean;
  shadowMapSize: number;
  /** Semilado del área con sombra alrededor del jugador (m). */
  shadowRange: number;
  /** Distancia de dibujado de los objetos de detalle (m). Fases 2+. */
  drawDistance: number;
  /** Muestras MSAA del render target del modo estéreo con corrección de lente. */
  msaa: number;
  postFx: boolean;
  /** Multiplicador de densidad de vegetación. Fase 2. */
  vegetationDensity: number;
}

/**
 * Presets. "Media" está calibrada como objetivo para iPhone 13 en estéreo a 60 fps:
 * 844×390 pt × 1.5 ≈ 1266×585 px en total (≈633×585 por ojo).
 */
export const PRESETS: Record<QualityLevel, QualityPreset> = {
  low: {
    level: 'low', pixelRatio: 1.0, xrFramebufferScale: 0.7, shadows: false, shadowMapSize: 512,
    shadowRange: 20, drawDistance: 1500, msaa: 0, postFx: false, vegetationDensity: 0.35,
  },
  medium: {
    level: 'medium', pixelRatio: 1.5, xrFramebufferScale: 0.85, shadows: true, shadowMapSize: 1024,
    shadowRange: 28, drawDistance: 3000, msaa: 4, postFx: false, vegetationDensity: 0.6,
  },
  high: {
    level: 'high', pixelRatio: 2.0, xrFramebufferScale: 1.0, shadows: true, shadowMapSize: 2048,
    shadowRange: 45, drawDistance: 6000, msaa: 4, postFx: true, vegetationDensity: 1.0,
  },
};

export function stepDown(level: QualityLevel): QualityLevel | null {
  const i = QUALITY_LEVELS.indexOf(level);
  return i > 0 ? QUALITY_LEVELS[i - 1] : null;
}

/**
 * Calidad automática: tras un calentamiento (compilación de shaders, carga), mide
 * el tiempo medio de fotograma y baja un nivel si no llega al objetivo. Solo baja
 * (nunca sube) para evitar oscilaciones; se rearma tras cada cambio.
 */
export class AutoQuality {
  private elapsed = 0;
  private frames = 0;
  private sum = 0;
  private active = false;
  private readonly warmup = 2.0;
  private readonly window = 4.0;
  private readonly minFps = 54;

  constructor(private onDowngrade: () => boolean) {}

  /** Empieza (o reinicia) una ventana de medición. */
  arm(): void {
    this.active = true;
    this.elapsed = 0;
    this.frames = 0;
    this.sum = 0;
  }

  disarm(): void {
    this.active = false;
  }

  sample(dt: number): void {
    if (!this.active) return;
    this.elapsed += dt;
    if (this.elapsed < this.warmup) return;
    this.frames++;
    this.sum += dt;
    if (this.elapsed < this.warmup + this.window) return;
    const fps = this.frames / this.sum;
    if (fps < this.minFps && this.onDowngrade()) this.arm();
    else this.active = false;
  }
}

/** Nivel inicial de la calidad automática según el dispositivo. */
export function initialAutoLevel(isMobile: boolean): QualityLevel {
  return isMobile ? 'medium' : 'high';
}
