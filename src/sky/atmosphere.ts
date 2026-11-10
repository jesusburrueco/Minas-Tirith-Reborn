import { Color, ShaderChunk, Vector3, type Material, type Texture, type WebGLProgramParametersWithUniforms } from 'three';

/**
 * Atmósfera compartida por todos los materiales: colores del cielo, sol, niebla por
 * altura con dispersión hacia el sol y la penumbra de Mordor hacia el este.
 * Los uniforms son objetos únicos: al actualizarlos aquí cambian en todos los shaders.
 */
export const ATMO = {
  uSunDir: { value: new Vector3(0.3, 0.6, 0.3).normalize() },
  uSunColor: { value: new Color(1, 0.95, 0.9) },
  uZenith: { value: new Color(0.16, 0.32, 0.7) },
  uHorizon: { value: new Color(0.6, 0.7, 0.82) },
  uGloom: { value: new Color(0.12, 0.1, 0.09) },
  uFogDensity: { value: 0.00006 },
  uFogFalloff: { value: 1 / 1100 },
  uTime: { value: 0 },
  uDaylight: { value: 1 },
  uCloudCover: { value: 0.45 },
  uWind: { value: new Vector3(1, 0, 0.3) }, // xz = dirección, y sin uso, z = fuerza
  tNoise: { value: null as Texture | null },
};

/** Funciones GLSL de la atmósfera (requieren `cameraPosition`). */
export const GLSL_ATMO = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGloom;
uniform float uFogDensity;
uniform float uFogFalloff;
uniform float uTime;
uniform float uDaylight;

/** Color de la bruma en la dirección rd (sin sol directo ni nubes). */
vec3 atmoHaze(vec3 rd) {
  float h = clamp(rd.y, 0.0, 1.0);
  vec3 col = mix(uHorizon, uZenith, pow(h, 0.5));
  float sd = max(dot(rd, uSunDir), 0.0);
  col += uSunColor * (pow(sd, 5.0) * 0.22 + pow(sd, 48.0) * 0.35) * uDaylight;
  // Las Ephel Dúath: el cielo de Mordor es más sombrío junto al horizonte oriental.
  float east = smoothstep(0.15, 0.95, rd.x) * (1.0 - smoothstep(-0.05, 0.4, rd.y));
  col = mix(col, uGloom, east * 0.62);
  return col;
}

/** Niebla exponencial por altura (integrada a lo largo del rayo) con color de bruma. */
vec3 atmoFog(vec3 col, vec3 wp) {
  vec3 rd = wp - cameraPosition;
  float dist = length(rd);
  rd /= max(dist, 1e-3);
  float b = uFogFalloff;
  float k = rd.y * b * dist;
  float integ = abs(k) < 1e-4 ? dist : (1.0 - exp(-k)) / (rd.y * b);
  float od = uFogDensity * exp(-b * cameraPosition.y) * integ;
  float f = 1.0 - exp(-max(od, 0.0));
  return mix(col, atmoHaze(rd), f);
}
`;

// --- Sustitución global de los chunks de niebla de three: solo actúa si el material define ATMO_FOG.
let installed = false;
export function installAtmosphereChunks(): void {
  if (installed) return;
  installed = true;
  ShaderChunk.fog_pars_vertex = `#ifdef ATMO_FOG\nvarying vec3 vAtmoWorldPos;\n#else\n${ShaderChunk.fog_pars_vertex}\n#endif`;
  ShaderChunk.fog_vertex = `#ifdef ATMO_FOG
  {
    vec4 awp = vec4(transformed, 1.0);
    #ifdef USE_BATCHING
      awp = batchingMatrix * awp;
    #endif
    #ifdef USE_INSTANCING
      awp = instanceMatrix * awp;
    #endif
    vAtmoWorldPos = (modelMatrix * awp).xyz;
  }
#else
${ShaderChunk.fog_vertex}
#endif`;
  ShaderChunk.fog_pars_fragment = `#ifdef ATMO_FOG\nvarying vec3 vAtmoWorldPos;\n${GLSL_ATMO}\n#else\n${ShaderChunk.fog_pars_fragment}\n#endif`;
  ShaderChunk.fog_fragment = `#ifdef ATMO_FOG\n  gl_FragColor.rgb = atmoFog(gl_FragColor.rgb, vAtmoWorldPos);\n#else\n${ShaderChunk.fog_fragment}\n#endif`;
}

// --- Composición de parches onBeforeCompile ---------------------------------------------

export type ShaderPatch = (shader: WebGLProgramParametersWithUniforms) => void;

/** Encadena un parche al material (varios sistemas pueden parchear el mismo material). */
export function addPatch<M extends Material>(mat: M, key: string, patch: ShaderPatch): M {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    prev.call(mat, shader, renderer);
    patch(shader);
  };
  const prevKey = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => `${prevKey()}|${key}`;
  return mat;
}

/**
 * Superficies naturales (tierra, hierba, hojas): especular muy bajo. Con el F90 = 1 de
 * MeshStandardMaterial el cielo se refleja en ángulo rasante y la llanura se ve lechosa.
 */
export function matteSpecular<M extends Material>(mat: M, f90 = 0.12, scale = 0.5): M {
  return addPatch(mat, `matte${f90}`, (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_physical_fragment>',
      `#include <lights_physical_fragment>\nmaterial.specularF90 = ${f90.toFixed(3)};\nmaterial.specularColor *= ${scale.toFixed(3)};`,
    );
  });
}

/** Activa la niebla atmosférica en un material estándar de three. */
export function withAtmosphere<M extends Material>(mat: M): M {
  return addPatch(mat, 'atmo', (shader) => {
    Object.assign(shader.uniforms, ATMO);
    shader.vertexShader = `#define ATMO_FOG\n${shader.vertexShader}`;
    shader.fragmentShader = `#define ATMO_FOG\n${shader.fragmentShader}`;
  });
}
