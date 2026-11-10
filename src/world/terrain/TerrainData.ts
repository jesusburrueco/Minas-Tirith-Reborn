import {
  DataTexture, FloatType, LinearFilter, LinearMipmapLinearFilter, NearestFilter, RGBAFormat, RGFormat, RedFormat,
  UnsignedByteType, Vector4,
} from 'three';
import { bilinear, computeNormals, FAR, NEAR, nearWeight, terrainSample } from '../geo';
import type { TerrainJob, TerrainJobResult } from './terrain.worker';

/** Mapas del terreno en CPU (colisiones, colocación) y en GPU (texturas para los shaders). */
export class TerrainData {
  readonly nearH: Float32Array;
  readonly farH: Float32Array;
  readonly nearMask: Uint8Array;
  readonly nearN: Uint8Array;
  readonly farN: Uint8Array;

  readonly tNearH: DataTexture;
  readonly tFarH: DataTexture;
  readonly tNearN: DataTexture;
  readonly tFarN: DataTexture;
  readonly tMask: DataTexture;
  /** (x0, z0, tamaño, resolución) de cada mapa, para los shaders. */
  readonly nearRect = new Vector4(NEAR.x0, NEAR.z0, NEAR.size, NEAR.res);
  readonly farRect = new Vector4(FAR.x0, FAR.z0, FAR.size, FAR.res);

  private constructor(nearH: Float32Array, farH: Float32Array, nearMask: Uint8Array) {
    this.nearH = nearH;
    this.farH = farH;
    this.nearMask = nearMask;
    this.nearN = computeNormals(nearH, NEAR.res, NEAR.size / (NEAR.res - 1));
    this.farN = computeNormals(farH, FAR.res, FAR.size / (FAR.res - 1));

    const heightTex = (d: Float32Array, res: number) => {
      const t = new DataTexture(d, res, res, RedFormat, FloatType);
      t.minFilter = t.magFilter = NearestFilter;
      t.generateMipmaps = false;
      t.needsUpdate = true;
      return t;
    };
    const linear = (t: DataTexture) => {
      t.minFilter = LinearMipmapLinearFilter;
      t.magFilter = LinearFilter;
      t.generateMipmaps = true;
      t.needsUpdate = true;
      return t;
    };
    this.tNearH = heightTex(nearH, NEAR.res);
    this.tFarH = heightTex(farH, FAR.res);
    this.tNearN = linear(new DataTexture(this.nearN, NEAR.res, NEAR.res, RGFormat, UnsignedByteType));
    this.tFarN = linear(new DataTexture(this.farN, FAR.res, FAR.res, RGFormat, UnsignedByteType));
    this.tMask = linear(new DataTexture(nearMask, NEAR.res, NEAR.res, RGBAFormat, UnsignedByteType));
  }

  /** Genera los mapas repartiendo filas entre varios workers (el iPhone 13 tiene 6 núcleos). */
  static async generate(progress: (f: number) => void): Promise<TerrainData> {
    const nWorkers = Math.max(2, Math.min(6, (navigator.hardwareConcurrency || 4) - 1));
    const nearH = new Float32Array(NEAR.res * NEAR.res);
    const nearMask = new Uint8Array(NEAR.res * NEAR.res * 4);
    const farH = new Float32Array(FAR.res * FAR.res);
    const jobs: TerrainJob[] = [];
    const chunk = 64;
    for (let j = 0; j < FAR.res; j += chunk) jobs.push({ map: 'far', j0: j, j1: Math.min(FAR.res, j + chunk) });
    for (let j = 0; j < NEAR.res; j += chunk) jobs.push({ map: 'near', j0: j, j1: Math.min(NEAR.res, j + chunk) });
    const total = jobs.length;
    let done = 0;

    const workers = Array.from(
      { length: nWorkers },
      () => new Worker(new URL('./terrain.worker.ts', import.meta.url), { type: 'module' }),
    );
    await Promise.all(
      workers.map(
        (w) =>
          new Promise<void>((resolve, reject) => {
            const next = () => {
              const job = jobs.shift();
              if (!job) {
                w.terminate();
                resolve();
                return;
              }
              w.postMessage(job);
            };
            w.onmessage = (e: MessageEvent<TerrainJobResult>) => {
              const r = e.data;
              const R = r.map === 'near' ? NEAR : FAR;
              (r.map === 'near' ? nearH : farH).set(r.heights, r.j0 * R.res);
              if (r.mask) nearMask.set(r.mask, r.j0 * R.res * 4);
              progress(++done / total);
              next();
            };
            w.onerror = (err) => reject(err);
            next();
          }),
      ),
    );
    return new TerrainData(nearH, farH, nearMask);
  }

  /** Altura del terreno (idéntica a la del shader: bilineal sobre los mismos mapas). */
  heightAt(x: number, z: number): number {
    const hf = bilinear(this.farH, FAR.res, FAR.x0, FAR.z0, FAR.size, x, z);
    const w = nearWeight(x, z);
    if (w <= 0) return hf;
    const hn = bilinear(this.nearH, NEAR.res, NEAR.x0, NEAR.z0, NEAR.size, x, z);
    return hf + (hn - hf) * w;
  }

  /** Normal del terreno (y hacia arriba) a partir del mapa de normales más fino disponible. */
  normalYAt(x: number, z: number): number {
    const inNear = nearWeight(x, z) > 0.5;
    const R = inNear ? NEAR : FAR;
    const N = inNear ? this.nearN : this.farN;
    const step = R.size / (R.res - 1);
    const i = Math.min(R.res - 1, Math.max(0, Math.round((x - R.x0) / step)));
    const j = Math.min(R.res - 1, Math.max(0, Math.round((z - R.z0) / step)));
    const nx = N[(j * R.res + i) * 2] / 127.5 - 1;
    const nz = N[(j * R.res + i) * 2 + 1] / 127.5 - 1;
    return Math.sqrt(Math.max(0, 1 - nx * nx - nz * nz));
  }

  /** Máscaras (road, field, wet, forest) en 0..1. Fuera del mapa cercano se calculan al vuelo. */
  maskAt(x: number, z: number, out: { road: number; field: number; wet: number; forest: number }): void {
    if (nearWeight(x, z) > 0) {
      const step = NEAR.size / (NEAR.res - 1);
      const i = Math.min(NEAR.res - 1, Math.max(0, Math.round((x - NEAR.x0) / step)));
      const j = Math.min(NEAR.res - 1, Math.max(0, Math.round((z - NEAR.z0) / step)));
      const k = (j * NEAR.res + i) * 4;
      out.road = this.nearMask[k] / 255;
      out.field = this.nearMask[k + 1] / 255;
      out.wet = this.nearMask[k + 2] / 255;
      out.forest = this.nearMask[k + 3] / 255;
      return;
    }
    const s = { h: 0, road: 0, field: 0, wet: 0, forest: 0 };
    terrainSample(x, z, s);
    Object.assign(out, s);
  }
}
