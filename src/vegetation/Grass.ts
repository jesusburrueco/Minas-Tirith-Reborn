import {
  BufferAttribute, DoubleSide, DynamicDrawUsage, InstancedBufferAttribute, InstancedBufferGeometry, Mesh,
  MeshStandardMaterial, Vector3, type Camera,
} from 'three';
import type { QualityPreset } from '../app/Quality';
import { addPatch, ATMO, matteSpecular, withAtmosphere } from '../sky/atmosphere';
import { GLSL_FIELDS, GLSL_HASH, hash2 } from '../world/geo';
import type { TerrainData } from '../world/terrain/TerrainData';
import { GLSL_TERRAIN_COMMON } from '../world/terrain/terrainShaders';

const TILE = 4; // m
const MAX_BLADES = 1000;
const CLUMPS = 70; // matas por loseta: las hojas crecen agrupadas, no sueltas

const GRASS_VERT_HEAD = /* glsl */ `
attribute vec4 aTile;   // x0, z0
attribute vec4 aTileH;  // alturas de las 4 esquinas
attribute float aSide;
attribute vec3 aRand;
uniform float uRadius;
uniform float uDensity;
uniform float uTime;
uniform vec3 uWind;
uniform sampler2D tMask;
uniform sampler2D tNoise;
varying vec3 vGrassCol;
${GLSL_TERRAIN_COMMON}
${GLSL_HASH}
${GLSL_FIELDS}
`;

const GRASS_BEGIN = /* glsl */ `
  vec2 rl = position.xz;
  float gt = position.y;
  vec2 root = aTile.xy + rl;
  vec2 q = rl / ${TILE.toFixed(1)};
  float h0 = mix(mix(aTileH.x, aTileH.y, q.x), mix(aTileH.z, aTileH.w, q.x), q.y) - 0.04;
  vec4 m = textureLod(tMask, rectUV(uNearRect, root), 0.0);
  vec2 fl;
  vec4 fc = fieldCell(root, fl);
  float inField = m.g * smoothstep(1.0, 3.0, fc.y);
  int crop = int(fc.x + 0.5);

  float H = mix(0.16, 0.42, aRand.x * aRand.x);
  float dens = 0.8;
  vec3 cBase = vec3(0.025, 0.045, 0.012);
  vec3 cTip = mix(vec3(0.085, 0.14, 0.03), vec3(0.17, 0.2, 0.05), aRand.y);
  bool flowers = true;
  if (inField > 0.5) {
    if (crop == 1) { H = mix(0.8, 1.1, aRand.x); dens = 1.0; cBase = vec3(0.2, 0.15, 0.05); cTip = vec3(0.62, 0.48, 0.17); flowers = false; }
    else if (crop == 2) { dens = 0.0; }
    else if (crop == 3) { H = mix(0.25, 0.4, aRand.x); dens = step(0.0, sin(fl.x * 7.85)); cTip = vec3(0.12, 0.26, 0.06); flowers = false; }
    else if (crop == 5) { H = mix(0.1, 0.22, aRand.x); dens = 1.0; }
    else if (crop == 4) { dens = 0.55; }
  }
  dens *= 1.0 - smoothstep(0.12, 0.45, m.r);           // caminos
  dens *= 1.0 - 0.5 * smoothstep(0.3, 0.8, m.b);       // orillas
  dens *= 1.0 - 0.6 * m.a;                             // suelo de bosque
  dens *= step(0.6, nearW(root));
  float sl = length(vec2(aTileH.y - aTileH.x, aTileH.z - aTileH.x)) / ${TILE.toFixed(1)};
  dens *= 1.0 - smoothstep(0.45, 0.8, sl);
  float dist = distance(root, cameraPosition.xz);
  float fade = 1.0 - smoothstep(uRadius * 0.6, uRadius, dist);
  float keep = step(aRand.z, dens * uDensity);
  float s = keep * fade;
  float hgt = H * s;

  float ang = aRand.y * 6.2831853;
  vec2 dir = vec2(cos(ang), sin(ang));
  float w = 0.03 * (1.0 - gt * 0.85) * (0.7 + 0.6 * aRand.x) * step(0.001, s);
  vec4 wn = textureLod(tNoise, root * 0.03 - uWind.xy * uTime * 0.04, 0.0);
  float gust = wn.r * 0.75 + wn.g * 0.25;
  vec2 bend = dir * (0.15 + 0.25 * aRand.x) + uWind.xy * (gust * 0.9 - 0.2 + 0.12 * sin(uTime * 2.3 + root.x * 0.7)) * uWind.z * 2.0;
  vec3 transformed = vec3(root.x, h0, root.y);
  transformed.xz += vec2(-dir.y, dir.x) * w * aSide;
  transformed.y += gt * hgt;
  transformed.xz += bend * gt * gt * hgt;

  vGrassCol = mix(cBase, cTip, gt) * (0.75 + 0.5 * aRand.x);
  if (flowers && aRand.z > 0.965 && gt > 0.8) {
    float k = fract(aRand.x * 7.3);
    vGrassCol = k < 0.4 ? vec3(0.9, 0.88, 0.8) : (k < 0.75 ? vec3(0.95, 0.75, 0.15) : vec3(0.55, 0.35, 0.8));
  }
`;

/**
 * Hierba de hojas reales (sin transparencias: en iOS el alpha test sale caro).
 * Losetas de 4 m alrededor del jugador; las alturas de las esquinas las calcula la CPU.
 */
export class Grass {
  readonly mesh: Mesh;
  private geometry = new InstancedBufferGeometry();
  private aTile: InstancedBufferAttribute;
  private aTileH: InstancedBufferAttribute;
  private radius = 24;
  private maxTiles = 0;
  private uniforms = { uRadius: { value: 24 }, uDensity: { value: 0.6 } };
  private fwd = new Vector3();
  private cam = new Vector3();

  constructor(private data: TerrainData) {
    this.buildBlades();
    this.maxTiles = Math.ceil(((2 * 44) / TILE) ** 2);
    this.aTile = new InstancedBufferAttribute(new Float32Array(this.maxTiles * 4), 4);
    this.aTileH = new InstancedBufferAttribute(new Float32Array(this.maxTiles * 4), 4);
    this.aTile.setUsage(DynamicDrawUsage);
    this.aTileH.setUsage(DynamicDrawUsage);
    this.geometry.setAttribute('aTile', this.aTile);
    this.geometry.setAttribute('aTileH', this.aTileH);

    const mat = new MeshStandardMaterial({ roughness: 0.85, metalness: 0, side: DoubleSide });
    withAtmosphere(mat);
    matteSpecular(mat, 0.08, 0.4);
    addPatch(mat, 'grass', (shader) => {
      Object.assign(shader.uniforms, this.uniforms, {
        tMask: { value: data.tMask }, uNearRect: { value: data.nearRect }, uFarRect: { value: data.farRect },
        tNearH: { value: data.tNearH }, tFarH: { value: data.tFarH },
        tNoise: ATMO.tNoise, uWind: ATMO.uWind, uTime: ATMO.uTime,
      });
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${GRASS_VERT_HEAD}`)
        .replace('#include <beginnormal_vertex>', `
          float nang = aRand.y * 6.2831853;
          vec3 objectNormal = normalize(vec3(cos(nang) * 0.45, 1.0, sin(nang) * 0.45));`)
        .replace('#include <begin_vertex>', GRASS_BEGIN);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vGrassCol;')
        .replace('#include <map_fragment>', 'diffuseColor.rgb = vGrassCol;')
        // Las dos caras de la hoja se iluminan igual (la normal ya apunta "hacia arriba").
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal *= faceDirection;');
    });
    this.mesh = new Mesh(this.geometry, mat);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.name = 'grass';
  }

  private buildBlades(): void {
    const n = MAX_BLADES;
    const pos = new Float32Array(n * 5 * 3);
    const side = new Float32Array(n * 5);
    const rnd = new Float32Array(n * 5 * 3);
    const idx = new Uint16Array(n * 9);
    const T = [0, 0, 0.55, 0.55, 1];
    const S = [-1, 1, -0.8, 0.8, 0];
    for (let b = 0; b < n; b++) {
      // mata a la que pertenece + desviación gaussiana (Box-Muller) de ~12 cm
      const c = Math.floor(hash2(b, 6, 900) * CLUMPS);
      const u1 = Math.max(1e-6, hash2(b, 7, 900)), u2 = hash2(b, 8, 900);
      const g = Math.sqrt(-2 * Math.log(u1)) * 0.12;
      const x = (((hash2(c, 1, 901) * TILE + Math.cos(u2 * 6.283) * g) % TILE) + TILE) % TILE;
      const z = (((hash2(c, 2, 901) * TILE + Math.sin(u2 * 6.283) * g) % TILE) + TILE) % TILE;
      const r = [hash2(b, 3, 900), hash2(b, 4, 900), hash2(b, 5, 900)];
      for (let v = 0; v < 5; v++) {
        const k = b * 5 + v;
        pos.set([x, T[v], z], k * 3);
        side[k] = S[v];
        rnd.set(r, k * 3);
      }
      const o = b * 5;
      idx.set([o, o + 1, o + 2, o + 1, o + 3, o + 2, o + 2, o + 3, o + 4], b * 9);
    }
    const g = this.geometry;
    g.setAttribute('position', new BufferAttribute(pos, 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(n * 5 * 3), 3));
    g.setAttribute('aSide', new BufferAttribute(side, 1));
    g.setAttribute('aRand', new BufferAttribute(rnd, 3));
    g.setIndex(new BufferAttribute(idx, 1));
  }

  applyQuality(p: QualityPreset): void {
    this.radius = p.level === 'low' ? 12 : p.level === 'medium' ? 18 : 30;
    this.uniforms.uRadius.value = this.radius;
    this.uniforms.uDensity.value = p.vegetationDensity;
    const blades = Math.round(MAX_BLADES * (p.level === 'low' ? 0.35 : p.level === 'medium' ? 0.5 : 1));
    this.geometry.setDrawRange(0, blades * 9);
    this.mesh.visible = true;
  }

  update(camera: Camera): void {
    camera.getWorldPosition(this.cam);
    camera.getWorldDirection(this.fwd);
    this.fwd.y = 0;
    const fl = this.fwd.length() || 1;
    const fx = this.fwd.x / fl, fz = this.fwd.z / fl;
    const R = this.radius;
    const i0 = Math.floor((this.cam.x - R) / TILE), i1 = Math.floor((this.cam.x + R) / TILE);
    const j0 = Math.floor((this.cam.z - R) / TILE), j1 = Math.floor((this.cam.z + R) / TILE);
    const t = this.aTile.array as Float32Array, th = this.aTileH.array as Float32Array;
    let n = 0;
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const x0 = i * TILE, z0 = j * TILE;
        const vx = x0 + TILE / 2 - this.cam.x, vz = z0 + TILE / 2 - this.cam.z;
        const d = Math.hypot(vx, vz);
        if (d > R + TILE) continue;
        // Detrás de la cabeza no hace falta (margen para el giro y el otro ojo).
        if (d > TILE * 2.5 && (vx * fx + vz * fz) / d < -0.35) continue;
        if (n >= this.maxTiles) break;
        t[n * 4] = x0;
        t[n * 4 + 1] = z0;
        th[n * 4] = this.data.heightAt(x0, z0);
        th[n * 4 + 1] = this.data.heightAt(x0 + TILE, z0);
        th[n * 4 + 2] = this.data.heightAt(x0, z0 + TILE);
        th[n * 4 + 3] = this.data.heightAt(x0 + TILE, z0 + TILE);
        n++;
      }
    this.geometry.instanceCount = n;
    this.aTile.needsUpdate = true;
    this.aTileH.needsUpdate = true;
  }
}
