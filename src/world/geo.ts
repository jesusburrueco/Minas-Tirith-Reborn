/**
 * Geografía del Pelennor y sus alrededores. Módulo PURO (sin three.js): lo usan el
 * worker que genera los mapas de altura y el hilo principal (colisiones, colocación).
 *
 * Orientación (libros): +X = este (Anduin, Osgiliath, Ephel Dúath), −X = oeste
 * (Mindolluin, Ered Nimrais), −Z = norte. Distancias lejanas comprimidas.
 *
 * Todo lo que también se evalúa en GLSL (hash, celdas de campo) usa aritmética
 * entera de 32 bits para que CPU y GPU den exactamente el mismo resultado.
 */

// ------------------------------------------------------------------ regiones de los mapas

/** Mapa cercano: 8 km a 4 m/texel alrededor de la ciudad, el inicio y el Rammas. */
export const NEAR = { x0: 3000 - 4096, z0: -4096, size: 8192, res: 2049 };
/** Mapa lejano: 64 km a 64 m/texel (montañas, Anduin, Osgiliath, Ephel Dúath). */
export const FAR = { x0: 6000 - 32768, z0: -32768, size: 65536, res: 1025 };
/** Ancho del borde en el que se funden ambos mapas (m). */
export const NEAR_BLEND = 256;

export const WATER_Y = -26;
export const RIVER_HALF_WIDTH = 170;
export const CITY_FLAT_RADIUS = 470;
export const TEST_ZONE_XZ: [number, number] = [2420, -70];

// ------------------------------------------------------------------ hash y ruido

/** Hash entero → [0,1) con 24 bits (idéntico en GLSL con uint). */
export function hash2(x: number, y: number, seed: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 8) / 16777216;
}

export const GLSL_HASH = /* glsl */ `
float hash2i(ivec2 p, int seed) {
  uint h = uint(p.x) * 374761393u + uint(p.y) * 668265263u + uint(seed) * 1442695041u;
  h = (h ^ (h >> 13u)) * 1274126177u;
  h ^= h >> 16u;
  return float(h >> 8u) / 16777216.0;
}`;

function vnoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}

export function fbm(x: number, y: number, oct: number, seed: number): number {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) {
    s += a * vnoise(x * f + i * 17.3, y * f - i * 11.1, seed + i);
    f *= 2.03;
    a *= 0.5;
  }
  return s;
}

function ridged(x: number, y: number, oct: number, seed: number): number {
  let s = 0, a = 0.5, f = 1, w = 1;
  for (let i = 0; i < oct; i++) {
    let n = 1 - Math.abs(vnoise(x * f + i * 7.7, y * f + i * 3.1, seed + i));
    n *= n * w;
    w = Math.min(1, n * 1.6);
    s += a * n;
    f *= 2.1;
    a *= 0.5;
  }
  return s;
}

export function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

// ------------------------------------------------------------------ el Anduin

/** Puntos (z, x) del cauce: de norte a sur pasando por Osgiliath y el Harlond. */
const RIVER: [number, number][] = [
  [-26000, 12500], [-18000, 11000], [-12000, 9900], [-7000, 9300], [-4000, 8800], [-1500, 7600],
  [0, 6800], [2000, 6300], [3500, 6200], [5500, 6600], [8000, 7600], [12000, 9200], [20000, 10500], [30000, 11000],
];

export function riverX(z: number): number {
  const n = RIVER.length;
  if (z <= RIVER[0][0]) return RIVER[0][1];
  if (z >= RIVER[n - 1][0]) return RIVER[n - 1][1];
  let i = 0;
  while (RIVER[i + 1][0] < z) i++;
  const p0 = RIVER[Math.max(0, i - 1)][1], p1 = RIVER[i][1], p2 = RIVER[i + 1][1], p3 = RIVER[Math.min(n - 1, i + 2)][1];
  const t = (z - RIVER[i][0]) / (RIVER[i + 1][0] - RIVER[i][0]);
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

// ------------------------------------------------------------------ carreteras y arroyos

export type Polyline = [number, number][];

/** El camino de Osgiliath sale de la Gran Puerta hacia el este (el jugador empieza sobre él). */
export const ROAD_OSGILIATH: Polyline = [[430, 0], [2600, 0], [3800, -400], [5000, -1300], [6200, -2300], [7400, -3200], [8600, -3900]];
/** Camino del norte, hacia Anórien y Rohan. */
export const ROAD_NORTH: Polyline = [[440, -20], [700, -600], [950, -1500], [1050, -2600], [1100, -3600], [1300, -6000], [1500, -10000]];
/** Camino del Harlond (los muelles, al sureste). */
export const ROAD_HARLOND: Polyline = [[440, 20], [1200, 700], [2300, 1500], [3600, 2000], [4800, 2700], [5900, 3300]];
/** Camino del sur, hacia Lossarnach. */
export const ROAD_SOUTH: Polyline = [[420, 60], [600, 1400], [500, 3200], [100, 5000], [-700, 8000]];
export const ROADS = [ROAD_OSGILIATH, ROAD_NORTH, ROAD_HARLOND, ROAD_SOUTH];

/** Arroyos que bajan del Mindolluin al Anduin. */
export const STREAMS: Polyline[] = [
  [[-150, -2700], [800, -2300], [2000, -1700], [3300, -1300], [4600, -800], [5800, -350], [6750, -150]],
  [[-250, 2900], [900, 2500], [2200, 2150], [3500, 2500], [4800, 2900], [6050, 3250]],
];

export const ROAD_HALF_WIDTH = 3.5;
export const STREAM_HALF_WIDTH = 2.8;
export const STREAM_DEPTH = 1.8;

interface Seg { ax: number; az: number; bx: number; bz: number; minX: number; maxX: number; minZ: number; maxZ: number; }

function segments(lines: Polyline[], pad: number): Seg[] {
  const out: Seg[] = [];
  for (const l of lines)
    for (let i = 0; i < l.length - 1; i++) {
      const [ax, az] = l[i], [bx, bz] = l[i + 1];
      out.push({ ax, az, bx, bz, minX: Math.min(ax, bx) - pad, maxX: Math.max(ax, bx) + pad, minZ: Math.min(az, bz) - pad, maxZ: Math.max(az, bz) + pad });
    }
  return out;
}
const ROAD_SEGS = segments(ROADS, 60);
const STREAM_SEGS = segments(STREAMS, 60);

function distToSegs(x: number, z: number, segs: Seg[]): number {
  let best = 1e9;
  for (const s of segs) {
    if (x < s.minX || x > s.maxX || z < s.minZ || z > s.maxZ) continue;
    const dx = s.bx - s.ax, dz = s.bz - s.az;
    const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / (dx * dx + dz * dz)));
    const ex = s.ax + dx * t - x, ez = s.az + dz * t - z;
    best = Math.min(best, ex * ex + ez * ez);
  }
  return Math.sqrt(best);
}

export const distToRoad = (x: number, z: number) => distToSegs(x, z, ROAD_SEGS);
export const distToStream = (x: number, z: number) => distToSegs(x, z, STREAM_SEGS);

// ------------------------------------------------------------------ campos de cultivo

export const FIELD = { angle: 0.38, w: 170, h: 130 };
export const Crop = { Meadow: 0, Wheat: 1, Ploughed: 2, Greens: 3, Orchard: 4, Pasture: 5 } as const;
export type Crop = (typeof Crop)[keyof typeof Crop];
const CROP_TABLE: Crop[] = [Crop.Meadow, Crop.Wheat, Crop.Wheat, Crop.Ploughed, Crop.Greens, Crop.Orchard, Crop.Pasture, Crop.Meadow];

export interface FieldCell { col: number; row: number; crop: Crop; fu: number; fv: number; edge: number; alongU: boolean; }

/** Parcelas: filas giradas con desfase aleatorio. Idéntico a fieldCell() en GLSL. */
export function fieldCell(x: number, z: number): FieldCell {
  const c = Math.cos(FIELD.angle), s = Math.sin(FIELD.angle);
  const u = x * c - z * s, v = x * s + z * c;
  const row = Math.floor(v / FIELD.h);
  const uo = u + hash2(row, 0, 71) * FIELD.w;
  const col = Math.floor(uo / FIELD.w);
  const crop = CROP_TABLE[Math.floor(hash2(col, row, 72) * 8)];
  const fu = uo - col * FIELD.w, fv = v - row * FIELD.h;
  const edge = Math.min(fu, FIELD.w - fu, fv, FIELD.h - fv);
  return { col, row, crop, fu, fv, edge, alongU: hash2(col, row, 73) < 0.5 };
}

/** Centro (x, z) en mundo de una parcela. */
export function fieldCenter(col: number, row: number): [number, number] {
  const c = Math.cos(FIELD.angle), s = Math.sin(FIELD.angle);
  const v = (row + 0.5) * FIELD.h;
  const u = (col + 0.5) * FIELD.w - hash2(row, 0, 71) * FIELD.w;
  // inversa de la rotación
  return [u * c + v * s, -u * s + v * c];
}

export const GLSL_FIELDS = /* glsl */ `
const float FIELD_ANGLE = ${FIELD.angle.toFixed(4)};
const float FIELD_W = ${FIELD.w.toFixed(1)};
const float FIELD_H = ${FIELD.h.toFixed(1)};
// x = cultivo, y = distancia al borde, z = 1 si los surcos van a lo largo de u, w = ángulo local
vec4 fieldCell(vec2 p, out vec2 local) {
  float c = cos(FIELD_ANGLE), s = sin(FIELD_ANGLE);
  float u = p.x * c - p.y * s, v = p.x * s + p.y * c;
  float row = floor(v / FIELD_H);
  float uo = u + hash2i(ivec2(int(row), 0), 71) * FIELD_W;
  float col = floor(uo / FIELD_W);
  int idx = int(floor(hash2i(ivec2(int(col), int(row)), 72) * 8.0));
  float crop = (idx == 0 || idx == 7) ? 0.0 : (idx <= 2) ? 1.0 : (idx == 3) ? 2.0 : (idx == 4) ? 3.0 : (idx == 5) ? 4.0 : 5.0;
  float fu = uo - col * FIELD_W, fv = v - row * FIELD_H;
  float edge = min(min(fu, FIELD_W - fu), min(fv, FIELD_H - fv));
  local = vec2(fu, fv);
  return vec4(crop, edge, step(hash2i(ivec2(int(col), int(row)), 73), 0.5), 0.0);
}`;

// ------------------------------------------------------------------ Rammas Echor

/**
 * Trazado polar (ángulo desde el este, en grados; radio en m) alrededor de la ciudad.
 * Comprimido: el tramo más cercano (NE) queda a ~3 km; por el este se acerca al Anduin,
 * envuelve el Harlond al sureste y muere en las faldas de los montes al norte y al sur.
 */
const RAMMAS_POLAR: [number, number][] = [
  [-118, 3300], [-100, 3150], [-80, 3050], [-60, 2950], [-40, 3000], [-20, 3700], [0, 4700],
  [15, 5100], [28, 5800], [36, 5600], [50, 4500], [70, 3700], [90, 3300], [110, 3250], [122, 3450],
];

export function rammasRadius(deg: number): number {
  const p = RAMMAS_POLAR;
  if (deg <= p[0][0]) return p[0][1];
  if (deg >= p[p.length - 1][0]) return p[p.length - 1][1];
  let i = 0;
  while (p[i + 1][0] < deg) i++;
  const t = smoothstep(0, 1, (deg - p[i][0]) / (p[i + 1][0] - p[i][0]));
  return mix(p[i][1], p[i + 1][1], t);
}
export const RAMMAS_RANGE: [number, number] = [-118, 122];

// ------------------------------------------------------------------ altura y máscaras

export interface TerrainSample {
  h: number;
  road: number;   // 0..1
  field: number;  // 0..1 donde puede haber cultivos
  wet: number;    // 0..1 orillas
  forest: number; // 0..1 bosque
}

const mountainFront = (z: number) => -350 - 0.00012 * z * z;
const ridgeX = (z: number) => 21500 + 1800 * Math.sin(z / 9000 + 1);

let testZoneH: number | null = null;

/** Altura sin aplanados locales (zona de pruebas). */
function rawSample(x: number, z: number, out: TerrainSample | null): number {
  // Llanura: desciende suavemente hacia el Anduin, con ondulaciones.
  let base = -Math.max(0, x - 500) * 0.0035 + fbm(x / 1400, z / 1400, 3, 11) * 4.5;
  const detail = fbm(x / 230, z / 230, 3, 5) * 1.1 + vnoise(x / 37, z / 37, 3) * 0.22;
  let h = base + detail;

  // Ered Nimrais y el Mindolluin (oeste). La cordillera se extiende hacia el oeste.
  const d = mountainFront(z) - x;
  let mountain = 0;
  if (d > -400) {
    mountain = smoothstep(-400, 2400, d);
    // Deformación del dominio: crestas y valles menos regulares.
    const wx = x + fbm(x / 3000, z / 3000, 2, 22) * 900, wz = z + fbm(x / 3000 + 9, z / 3000, 2, 23) * 900;
    const r = ridged(wx / 2300, wz / 2300, 6, 21);
    const peak = 700 * Math.exp(-((x + 3900) ** 2 + (z + 400) ** 2) / (2 * 2800 * 2800));
    h += mountain * mountain * (200 + 2500 * r * (0.45 + 0.55 * mountain)) + peak * mountain;
  }

  // Ephel Dúath (este) y la meseta de Mordor detrás.
  const rx2 = ridgeX(z);
  const e = 1 - Math.abs(x - rx2) / 5200;
  if (e > 0) h += Math.pow(smoothstep(0, 1, e), 1.3) * (1000 + 1900 * ridged(x / 1700, z / 1700, 5, 33));
  if (x > rx2) h += 650 * smoothstep(rx2, rx2 + 4000, x);

  // Ithilien: se eleva al este del río, con colinas boscosas.
  const rx = riverX(z);
  if (x > rx + 200) {
    const k = smoothstep(rx + 200, rx + 2200, x);
    h += smoothstep(rx + 300, rx + 8000, x) * 320 + fbm(x / 900, z / 900, 4, 41) * 45 * k;
    base = h;
  }

  // Carreteras: se aplanan hacia la altura base (sin el detalle fino).
  const dRoad = distToRoad(x, z);
  const road = 1 - smoothstep(ROAD_HALF_WIDTH, ROAD_HALF_WIDTH + 2.5, dRoad);
  if (dRoad < 20) h = mix(h, base + detail * 0.15, 1 - smoothstep(ROAD_HALF_WIDTH + 1, 20, dRoad));

  // Arroyos: cauce excavado (vado poco profundo donde cruza un camino).
  const dStream = distToStream(x, z);
  if (dStream < 16) {
    const depth = dRoad < 10 ? 0.45 : STREAM_DEPTH;
    h -= depth * (1 - smoothstep(STREAM_HALF_WIDTH * 0.55, 7.5, dStream)) ** 1.5;
  }

  // El Anduin: llanura de inundación, orillas y lecho.
  const dr = Math.abs(x - rx);
  const W = RIVER_HALF_WIDTH;
  if (dr < W + 450) {
    const bank = WATER_Y + 1.7 + detail * 0.3;
    h = mix(h, bank, smoothstep(W + 450, W + 40, dr));
    if (dr < W + 40) h = mix(h, WATER_Y - 7, smoothstep(W + 40, W - 90, dr));
  }

  // Explanada de la ciudad (la fase 3 tallará los niveles en la roca).
  const rc = Math.hypot(x, z);
  if (rc < CITY_FLAT_RADIUS + 150) {
    const k = (1 - smoothstep(CITY_FLAT_RADIUS - 40, CITY_FLAT_RADIUS + 150, rc)) * smoothstep(-470, -230, x);
    h = mix(h, 0, k);
  }

  if (out) {
    out.road = road;
    const notMountain = 1 - smoothstep(-500, -150, d);
    out.field =
      notMountain *
      smoothstep(650, 800, rc) *
      smoothstep(W + 180, W + 330, dr) *
      (x < rx ? 1 : 0) *
      smoothstep(ROAD_HALF_WIDTH + 3, ROAD_HALF_WIDTH + 7, dRoad) *
      smoothstep(STREAM_HALF_WIDTH + 6, STREAM_HALF_WIDTH + 12, dStream);
    out.wet = Math.max(1 - smoothstep(STREAM_HALF_WIDTH, 14, dStream), 1 - smoothstep(W, W + 140, dr));
    const n = fbm(x / 700, z / 700, 3, 91);
    let forest = 0;
    if (mountain > 0.08 && h < 1500) forest = smoothstep(-0.05, 0.25, n) * (1 - smoothstep(1250, 1500, h));
    if (x > rx + 350) forest = Math.max(forest, smoothstep(0.0, 0.3, n + 0.15) * smoothstep(rx + 350, rx + 900, x));
    if (notMountain > 0.5 && x < rx) forest = Math.max(forest, smoothstep(0.42, 0.55, n) * 0.8); // sotos dispersos
    out.forest = forest * (1 - road);
  }
  return h;
}

/** Altura final y máscaras. `out` puede ser null si solo interesa la altura. */
export function terrainSample(x: number, z: number, out: TerrainSample | null): number {
  let h = rawSample(x, z, out);
  // Zona de pruebas: plataforma plana.
  const dt = Math.hypot(x - TEST_ZONE_XZ[0], z - TEST_ZONE_XZ[1]);
  if (dt < 110) {
    testZoneH ??= rawSample(TEST_ZONE_XZ[0], TEST_ZONE_XZ[1], null);
    h = mix(h, testZoneH, 1 - smoothstep(60, 110, dt));
    if (out) out.field *= smoothstep(80, 110, dt);
  }
  return h;
}

export function testZoneHeight(): number {
  testZoneH ??= rawSample(TEST_ZONE_XZ[0], TEST_ZONE_XZ[1], null);
  return testZoneH;
}

// ------------------------------------------------------------------ normales

/** Normales (RG8: x, z; y se reconstruye) por diferencias centrales de un mapa de alturas. */
export function computeNormals(H: Float32Array, res: number, step: number): Uint8Array {
  const N = new Uint8Array(res * res * 2);
  for (let j = 0; j < res; j++)
    for (let i = 0; i < res; i++) {
      const l = H[j * res + Math.max(0, i - 1)], r = H[j * res + Math.min(res - 1, i + 1)];
      const u = H[Math.max(0, j - 1) * res + i], d = H[Math.min(res - 1, j + 1) * res + i];
      let nx = (l - r) / (2 * step), nz = (u - d) / (2 * step);
      const inv = 1 / Math.sqrt(nx * nx + 1 + nz * nz);
      nx *= inv;
      nz *= inv;
      const k = (j * res + i) * 2;
      N[k] = Math.round((nx * 0.5 + 0.5) * 255);
      N[k + 1] = Math.round((nz * 0.5 + 0.5) * 255);
    }
  return N;
}

// ------------------------------------------------------------------ muestreo bilineal (CPU = GPU)

export function bilinear(H: Float32Array, res: number, x0: number, z0: number, size: number, x: number, z: number): number {
  const step = size / (res - 1);
  let fx = (x - x0) / step, fz = (z - z0) / step;
  fx = Math.min(res - 1.0001, Math.max(0, fx));
  fz = Math.min(res - 1.0001, Math.max(0, fz));
  const i = Math.floor(fx), j = Math.floor(fz);
  const tx = fx - i, tz = fz - j;
  const a = H[j * res + i], b = H[j * res + i + 1], c = H[(j + 1) * res + i], d = H[(j + 1) * res + i + 1];
  return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
}

/** Peso del mapa cercano (1 dentro, 0 fuera, rampa de NEAR_BLEND m en el borde). */
export function nearWeight(x: number, z: number): number {
  const m = Math.min(x - NEAR.x0, NEAR.x0 + NEAR.size - x, z - NEAR.z0, NEAR.z0 + NEAR.size - z);
  return Math.min(1, Math.max(0, m / NEAR_BLEND));
}
