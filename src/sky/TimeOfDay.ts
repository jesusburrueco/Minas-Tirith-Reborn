import { Color, MathUtils, Vector3 } from 'three';

/** Latitud aproximada de Minas Tirith: el sol de mediodía queda al sur. */
const MAX_ELEVATION = MathUtils.degToRad(62);

/**
 * Hora del día y dirección del sol. Este (+X) a las 6h, sur (+Z) a mediodía, oeste a las 18h.
 * Fase 1: colores sencillos; la fase 2 los sustituye por cielo físico y atmósfera.
 */
export class TimeOfDay {
  hours = 10.5;
  /** Horas de juego por segundo real (0 = parado). */
  rate = 0;
  /** Velocidad al mantener L1/R1 (horas por segundo). */
  scrubRate = 1.5;
  readonly sunDir = new Vector3();

  update(dt: number, scrubAxis: number): void {
    this.hours += (this.rate + scrubAxis * this.scrubRate) * dt;
    this.hours = ((this.hours % 24) + 24) % 24;
    const t = ((this.hours - 6) / 12) * Math.PI; // 0 al amanecer, π al ocaso
    const elev = Math.sin(t) * MAX_ELEVATION;
    const az = t; // del este al oeste pasando por el sur
    this.sunDir.set(Math.cos(az) * Math.cos(elev), Math.sin(elev), Math.sin(az) * Math.cos(elev)).normalize();
  }

  /** 0 de noche, 1 de día, suave en el crepúsculo. */
  get daylight(): number {
    return MathUtils.smoothstep(this.sunDir.y, -0.08, 0.18);
  }

  /** Cuánto "atardecer" hay (para teñir de naranja). */
  get twilight(): number {
    return Math.max(0, 1 - Math.abs(this.sunDir.y) / 0.25) * MathUtils.smoothstep(this.sunDir.y, -0.15, 0.0);
  }

  formatted(): string {
    const h = Math.floor(this.hours);
    const m = Math.floor((this.hours - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
}

export const SKY_DAY = new Color(0x9ab8d8);
export const SKY_NIGHT = new Color(0x070a14);
export const SKY_DUSK = new Color(0xd99a6c);
