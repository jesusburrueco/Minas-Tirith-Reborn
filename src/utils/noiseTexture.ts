import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RGBAFormat, RepeatWrapping, UnsignedByteType } from 'three';
import { hash2 } from '../world/geo';

/**
 * Ruido de valor periódico (tileable) 256×256: R, G, B, A = octavas de frecuencia
 * 4, 8, 16 y 32 celdas. Un único texel da un fbm de 4 octavas (nubes, viento, agua, variación).
 */
export function createNoiseTexture(size = 256): DataTexture {
  const data = new Uint8Array(size * size * 4);
  const freqs = [4, 8, 16, 32];
  for (let c = 0; c < 4; c++) {
    const f = freqs[c];
    const cell = size / f;
    for (let y = 0; y < size; y++) {
      const gy = y / cell, yi = Math.floor(gy), ty = gy - yi, sy = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < size; x++) {
        const gx = x / cell, xi = Math.floor(gx), tx = gx - xi, sx = tx * tx * (3 - 2 * tx);
        const h = (i: number, j: number) => hash2(((i % f) + f) % f, ((j % f) + f) % f, 500 + c);
        const a = h(xi, yi), b = h(xi + 1, yi), cc = h(xi, yi + 1), d = h(xi + 1, yi + 1);
        const v = a + (b - a) * sx + (cc - a) * sy + (a - b - cc + d) * sx * sy;
        data[(y * size + x) * 4 + c] = Math.round(v * 255);
      }
    }
  }
  const t = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.magFilter = LinearFilter;
  t.minFilter = LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}
