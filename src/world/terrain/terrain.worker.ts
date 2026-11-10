/// <reference lib="webworker" />
import { FAR, NEAR, terrainSample, type TerrainSample } from '../geo';

export interface TerrainJob {
  map: 'near' | 'far';
  j0: number;
  j1: number;
}

export interface TerrainJobResult {
  map: 'near' | 'far';
  j0: number;
  j1: number;
  heights: Float32Array;
  mask: Uint8Array | null;
}

/** Calcula las filas [j0, j1) de un mapa. Varios workers se reparten las filas. */
self.onmessage = (e: MessageEvent<TerrainJob>) => {
  const { map, j0, j1 } = e.data;
  const R = map === 'near' ? NEAR : FAR;
  const step = R.size / (R.res - 1);
  const rows = j1 - j0;
  const heights = new Float32Array(rows * R.res);
  const mask = map === 'near' ? new Uint8Array(rows * R.res * 4) : null;
  const s: TerrainSample = { h: 0, road: 0, field: 0, wet: 0, forest: 0 };
  for (let j = j0; j < j1; j++) {
    const z = R.z0 + j * step;
    for (let i = 0; i < R.res; i++) {
      const k = (j - j0) * R.res + i;
      heights[k] = terrainSample(R.x0 + i * step, z, mask ? s : null);
      if (mask) {
        mask[k * 4] = Math.round(s.road * 255);
        mask[k * 4 + 1] = Math.round(s.field * 255);
        mask[k * 4 + 2] = Math.round(s.wet * 255);
        mask[k * 4 + 3] = Math.round(s.forest * 255);
      }
    }
  }
  const result: TerrainJobResult = { map, j0, j1, heights, mask };
  (self as unknown as Worker).postMessage(result, mask ? [heights.buffer, mask.buffer] : [heights.buffer]);
};
