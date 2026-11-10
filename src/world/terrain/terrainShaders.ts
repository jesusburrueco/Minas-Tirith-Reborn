import { NEAR_BLEND } from '../geo';

/** Muestreo de alturas idéntico al de la CPU (bilineal manual con texelFetch). */
export const GLSL_TERRAIN_COMMON = /* glsl */ `
uniform sampler2D tNearH;
uniform sampler2D tFarH;
uniform vec4 uNearRect; // x0, z0, tamaño, resolución
uniform vec4 uFarRect;
const float NEAR_BLEND = ${NEAR_BLEND.toFixed(1)};

float fetchH(sampler2D t, vec4 r, vec2 p) {
  float stp = r.z / (r.w - 1.0);
  vec2 f = clamp((p - r.xy) / stp, vec2(0.0), vec2(r.w - 1.0001));
  ivec2 i = ivec2(floor(f));
  vec2 k = f - vec2(i);
  float a = texelFetch(t, i, 0).r;
  float b = texelFetch(t, i + ivec2(1, 0), 0).r;
  float c = texelFetch(t, i + ivec2(0, 1), 0).r;
  float d = texelFetch(t, i + ivec2(1, 1), 0).r;
  return a + (b - a) * k.x + (c - a) * k.y + (a - b - c + d) * k.x * k.y;
}
float nearW(vec2 p) {
  vec2 lo = p - uNearRect.xy;
  vec2 hi = uNearRect.xy + uNearRect.z - p;
  return clamp(min(min(lo.x, hi.x), min(lo.y, hi.y)) / NEAR_BLEND, 0.0, 1.0);
}
float terrainH(vec2 p) {
  float hf = fetchH(tFarH, uFarRect, p);
  float w = nearW(p);
  if (w <= 0.0) return hf;
  return mix(hf, fetchH(tNearH, uNearRect, p), w);
}
vec2 rectUV(vec4 r, vec2 p) {
  float stp = r.z / (r.w - 1.0);
  return ((p - r.xy) / stp + 0.5) / r.w;
}
`;

export const TERRAIN_VERT_HEAD = /* glsl */ `
attribute vec4 aNode; // x0, z0, tamaño, lod
uniform float uGrid;
uniform float uRanges[16];
varying vec2 vTerrainXZ;
varying float vTerrainH;
${GLSL_TERRAIN_COMMON}
`;

export const TERRAIN_BEGIN_VERTEX = /* glsl */ `
  vec2 tGridPos = position.xz;
  vec2 wxz = aNode.xy + tGridPos * aNode.z;
  float tDistV = distance(wxz, cameraPosition.xz);
  float mEnd = uRanges[int(aNode.w)];
  float morph = clamp((tDistV - mEnd * 0.7) / (mEnd * 0.28), 0.0, 1.0);
  vec2 fr = fract(tGridPos * uGrid * 0.5) * 2.0;
  wxz -= fr * (aNode.z / uGrid) * morph;
  float th = terrainH(wxz);
  vTerrainXZ = wxz;
  vTerrainH = th;
  vec3 transformed = vec3(wxz.x, th, wxz.y);
`;

export const TERRAIN_FRAG_HEAD = /* glsl */ `
uniform sampler2D tNearN;
uniform sampler2D tFarN;
uniform sampler2D tMask;
uniform sampler2D tGrassA; uniform sampler2D tGrassN;
uniform sampler2D tSoilA;  uniform sampler2D tSoilN;
uniform sampler2D tDirtA;  uniform sampler2D tDirtN;
uniform sampler2D tRockA;  uniform sampler2D tRockN;
uniform sampler2D tRoadA;  uniform sampler2D tRoadN;
uniform sampler2D tNoise;
uniform float uCloudCover;
uniform vec3 uWind;
uniform float uDetail; // 0 baja, 1 media, 2 alta
varying vec2 vTerrainXZ;
varying float vTerrainH;
${GLSL_TERRAIN_COMMON}

vec3 decodeN(vec2 v) {
  vec2 n = v * 2.0 - 1.0;
  return vec3(n.x, sqrt(max(0.0, 1.0 - dot(n, n))), n.y);
}
vec3 terrainNormal(vec2 p) {
  vec3 nf = decodeN(texture2D(tFarN, rectUV(uFarRect, p)).rg);
  vec3 nn = decodeN(texture2D(tNearN, rectUV(uNearRect, p)).rg);
  return normalize(mix(nf, nn, nearW(p)));
}
float cloudShadow(vec2 p, float h) {
  vec2 cp = (p + uSunDir.xz / max(uSunDir.y, 0.15) * (2500.0 - h)) / 26000.0 + uWind.xy * uTime * 0.0016;
  vec4 n = texture2D(tNoise, cp);
  float d = (n.r * 0.5 + n.g * 0.27 + n.b * 0.14 + n.a * 0.07) / 0.98;
  return smoothstep(1.0 - uCloudCover, 1.0 - uCloudCover + 0.32, d);
}
vec3 tsNormal(vec4 t) { vec2 xy = t.rg * 2.0 - 1.0; return vec3(xy, sqrt(max(0.0, 1.0 - dot(xy, xy)))); }
`;

/** Sustituye a <map_fragment>: mezcla de materiales, campos, caminos, roca y nieve. */
export const TERRAIN_SPLAT = /* glsl */ `
  vec2 p = vTerrainXZ;
  float hgt = vTerrainH;
  float tDist = distance(cameraPosition.xz, p);
  vec3 nW = terrainNormal(p);
  // Relieve procedural de montaña (crestas y barrancos a 30-300 m): el mapa lejano
  // solo tiene 64 m por texel y las laderas se verían lisas.
  {
    float mk = smoothstep(0.08, 0.3, 1.0 - nW.y) * smoothstep(60.0, 400.0, vTerrainH);
    if (mk > 0.0) {
      vec2 e = vec2(1.0 / 256.0, 0.0);
      vec2 q1 = p / 900.0, q2 = p / 260.0;
      float a1 = texture2D(tNoise, q1).g, b1 = texture2D(tNoise, q1 + e.xy).g, c1 = texture2D(tNoise, q1 + e.yx).g;
      float a2 = texture2D(tNoise, q2).b, b2 = texture2D(tNoise, q2 + e.xy).b, c2 = texture2D(tNoise, q2 + e.yx).b;
      vec2 g = vec2(b1 - a1, c1 - a1) * 2.2 + vec2(b2 - a2, c2 - a2) * 1.4;
      nW = normalize(nW + vec3(-g.x, 0.0, -g.y) * 3.0 * mk);
    }
  }
  float slope = 1.0 - nW.y;
  vec4 msk = texture2D(tMask, rectUV(uNearRect, p)) * step(0.001, nearW(p));
  vec4 nzA = texture2D(tNoise, p / 1900.0);
  vec4 nzB = texture2D(tNoise, p / 230.0);
  float macro = nzA.r * 0.6 + nzA.g * 0.4;
  float micro = nzB.g;

  vec2 dpx = dFdx(p), dpy = dFdy(p);
  vec3 wpos = vec3(p.x, hgt, p.y);
  vec2 rockUV = nW.y > 0.75 ? p : (abs(nW.x) > abs(nW.z) ? wpos.zy : wpos.xy);
  vec2 rdx = dFdx(rockUV), rdy = dFdy(rockUV);

  // Parcelas
  vec2 fl;
  vec4 fc = fieldCell(p, fl);
  float fieldW = msk.g * smoothstep(1.0, 3.5, fc.y);
  float hedge = msk.g * (1.0 - smoothstep(0.6, 2.2, fc.y));
  int crop = int(fc.x + 0.5);
  vec2 soilUV = (fc.z > 0.5 ? fl : fl.yx);

  // Pesos
  float wRock = smoothstep(0.11, 0.26, slope + (micro - 0.5) * 0.07);
  wRock = max(wRock, smoothstep(1350.0, 1850.0, hgt + macro * 220.0) * 0.9);
  float wSnow = smoothstep(1900.0, 2150.0, hgt + (macro - 0.5) * 320.0) * (1.0 - smoothstep(0.32, 0.55, slope));
  // Ephel Dúath, las Montañas de Sombra: roca oscura, sin nieve, poca hierba.
  float shadowMtn = smoothstep(14000.0, 17500.0, p.x);
  wSnow *= 1.0 - shadowMtn;
  wRock = max(wRock, shadowMtn * smoothstep(250.0, 700.0, hgt));
  float wRoad = msk.r;
  float wWet = msk.b;
  float wForest = msk.a;

  float mid = 1.0 - smoothstep(420.0, 700.0, tDist);
  vec3 cGrass, cDirt, cRock, cRoad, cSoil;
  if (mid > 0.0) {
    cGrass = textureGrad(tGrassA, p / 2.6, dpx / 2.6, dpy / 2.6).rgb;
    if (uDetail > 1.5) cGrass = mix(cGrass, textureGrad(tGrassA, p.yx / 9.1, dpx.yx / 9.1, dpy.yx / 9.1).rgb, 0.4);
    cDirt = textureGrad(tDirtA, p / 3.2, dpx / 3.2, dpy / 3.2).rgb;
    cRock = textureGrad(tRockA, rockUV / 7.0, rdx / 7.0, rdy / 7.0).rgb;
    cRoad = textureGrad(tRoadA, p / 3.0, dpx / 3.0, dpy / 3.0).rgb;
    cSoil = textureGrad(tSoilA, soilUV / 3.6, dpx / 3.6, dpy / 3.6).rgb;
  } else {
    cGrass = textureLod(tGrassA, vec2(0.5), 12.0).rgb;
    cDirt = textureLod(tDirtA, vec2(0.5), 12.0).rgb;
    cRoad = textureLod(tRoadA, vec2(0.5), 12.0).rgb;
    cSoil = textureLod(tSoilA, vec2(0.5), 12.0).rgb;
    // Roca a escala de montaña: la misma textura, mucho más grande (vetas y grietas).
    cRock = textureGrad(tRockA, rockUV / 170.0, rdx / 170.0, rdy / 170.0).rgb;
  }
  cRock = mix(cRock, vec3(dot(cRock, vec3(0.333))), 0.45) * vec3(0.92, 0.92, 0.96);   // gris granito
  cRock *= mix(1.0, 0.42, shadowMtn);                                                  // basalto oscuro

  // Variación a gran escala: manchas de hierba seca, verde intenso y prado en flor.
  float dry = smoothstep(0.45, 0.75, nzA.b + (nzB.r - 0.5) * 0.3);
  float lush = smoothstep(0.55, 0.8, nzA.a);
  cGrass *= mix(vec3(0.82, 0.95, 0.78), vec3(1.12, 1.06, 0.84), macro);
  cGrass = mix(cGrass, vec3(dot(cGrass, vec3(0.333))) * vec3(1.45, 1.25, 0.7), dry * 0.55);
  cGrass = mix(cGrass, cGrass * vec3(0.7, 0.92, 0.65), lush * 0.6);
  // En las laderas la hierba es más rala y seca (sin verde neón).
  cGrass = mix(cGrass, vec3(dot(cGrass, vec3(0.333))) * vec3(1.15, 1.05, 0.75), smoothstep(40.0, 600.0, hgt) * 0.55);
  cRoad = mix(cRoad, vec3(dot(cRoad, vec3(0.333))) * vec3(1.12, 1.04, 0.9), 0.55) * 1.12;
  vec3 base = cGrass;
  if (fieldW > 0.0) {
    vec3 cropCol = cGrass;
    if (crop == 1) cropCol = vec3(dot(cGrass, vec3(0.333))) * vec3(2.4, 1.9, 0.8);                  // trigo
    else if (crop == 2) cropCol = cSoil;                                                              // arado
    else if (crop == 3) {                                                                             // hortalizas en hileras
      float rows = smoothstep(0.25, 0.75, 0.5 + 0.5 * sin(fl.x * 7.85));
      rows = mix(rows, 0.5, smoothstep(0.08, 0.3, fwidth(fl.x)));                                     // sin moiré a lo lejos
      cropCol = mix(cSoil, cGrass * vec3(0.7, 1.05, 0.55), rows);
    }
    else if (crop == 4) cropCol = mix(cGrass, cDirt, 0.22);                                           // huerto
    else if (crop == 5) cropCol = cGrass * vec3(1.1, 1.04, 0.78);                                     // pasto
    base = mix(base, cropCol, fieldW);
  }
  base = mix(base, cGrass * vec3(0.5, 0.66, 0.42), hedge * 0.85);
  base = mix(base, mix(cDirt, cGrass * 0.5, 0.5) * 0.72, wForest * 0.75);
  base = mix(base, cDirt * 0.55, wWet * 0.75);
  base = mix(base, cRoad, wRoad);
  base = mix(base, cRock, wRock);
  base = mix(base, vec3(0.88, 0.9, 0.94), wSnow);
  base *= 0.84 + 0.32 * macro;
  base *= 1.0 - cloudShadow(p, hgt) * 0.42 * uDaylight;
  diffuseColor.rgb = base;

  // Relieve fino (solo cerca y en calidad media/alta)
  // Pliegues y hondonadas más oscuros en la montaña (oclusión aproximada).
  base *= mix(1.0, 0.72 + 0.28 * smoothstep(0.2, 0.75, nzB.b), wRock);
  float tRough = mix(0.95, 0.85, wRock);
  tRough = mix(tRough, 0.55, wSnow);
  tRough = mix(tRough, 0.6, wWet * 0.6);
  vec3 tNrmW = nW;
  float nearK = 1.0 - smoothstep(50.0, 95.0, tDist);
  if (uDetail > 0.5 && nearK > 0.0) {
    vec4 nG = textureGrad(tGrassN, p / 2.6, dpx / 2.6, dpy / 2.6);
    vec4 nR = textureGrad(tRockN, rockUV / 7.0, rdx / 7.0, rdy / 7.0);
    vec4 nD = textureGrad(tRoadN, p / 3.0, dpx / 3.0, dpy / 3.0);
    vec4 nS = textureGrad(tSoilN, soilUV / 3.6, dpx / 3.6, dpy / 3.6);
    float wSoil = (crop == 2 || crop == 3) ? fieldW : 0.0;
    vec4 nb = mix(mix(mix(nG, nS, wSoil), nD, wRoad), nR, wRock);
    vec3 ts = tsNormal(nb);
    ts.xy *= nearK * (1.0 - wSnow * 0.7);
    vec3 T = normalize(vec3(1.0, 0.0, 0.0) - nW * nW.x);
    vec3 B = normalize(cross(T, nW)); // +z: la v de la textura crece con z
    tNrmW = normalize(T * ts.x + B * ts.y + nW * ts.z);
    tRough = max(0.75, mix(tRough, nb.b, nearK * (1.0 - wSnow)));
  }
`;

/** Tras <normal_fragment_maps>: aplica la normal del terreno (en espacio de vista). */
export const TERRAIN_NORMAL = /* glsl */ `
  normal = normalize((viewMatrix * vec4(tNrmW, 0.0)).xyz);
`;
