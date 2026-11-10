import {
  Box3, BufferAttribute, DynamicDrawUsage, Frustum, InstancedBufferAttribute, InstancedBufferGeometry, Matrix4, Mesh,
  MeshStandardMaterial, PerspectiveCamera, Vector3, type Camera, type Texture,
} from 'three';
import type { QualityPreset } from '../../app/Quality';
import type { MaterialMaps } from '../../render/Textures';
import { addPatch, ATMO, matteSpecular, withAtmosphere } from '../../sky/atmosphere';
import { FAR, GLSL_FIELDS, GLSL_HASH } from '../geo';
import type { TerrainData } from './TerrainData';
import {
  TERRAIN_BEGIN_VERTEX, TERRAIN_FRAG_HEAD, TERRAIN_NORMAL, TERRAIN_SPLAT, TERRAIN_VERT_HEAD,
} from './terrainShaders';

const LEAF = 32; // m: nodo más pequeño
const LEVELS = 12; // 32 · 2^11 = 65 536 m (todo el mapa lejano)
const MIN_RANGE = 72; // m: alcance del LOD 0
const MAX_NODES = 1024;

export interface TerrainMaterials {
  grass: MaterialMaps;
  soil: MaterialMaps;
  dirt: MaterialMaps;
  rock: MaterialMaps;
  road: MaterialMaps;
  noise: Texture;
}

/**
 * Terreno CDLOD: un quadtree elige cada fotograma los nodos visibles (más finos cerca),
 * todos se dibujan con una única malla instanciada (1 draw call) y el vertex shader
 * desplaza con el mapa de alturas y "funde" cada LOD con el siguiente (sin grietas).
 */
export class TerrainMesh {
  readonly mesh: Mesh;
  private geometry = new InstancedBufferGeometry();
  private nodes: InstancedBufferAttribute;
  private grid = 16;
  private ranges: number[] = [];
  private bounds = new Map<number, [number, number]>();
  private frustum = new Frustum();
  private cullCam = new PerspectiveCamera(110, 1.8, 0.5, 60000);
  private m4 = new Matrix4();
  private box = new Box3();
  private count = 0;
  readonly material: MeshStandardMaterial;
  private uniforms: Record<string, { value: unknown }>;

  constructor(private data: TerrainData, maps: TerrainMaterials) {
    for (let l = 0; l < 16; l++) this.ranges.push(MIN_RANGE * 2 ** l);
    this.nodes = new InstancedBufferAttribute(new Float32Array(MAX_NODES * 4), 4);
    this.nodes.setUsage(DynamicDrawUsage);
    this.buildGrid(16);

    this.uniforms = {
      tNearH: { value: data.tNearH }, tFarH: { value: data.tFarH },
      tNearN: { value: data.tNearN }, tFarN: { value: data.tFarN }, tMask: { value: data.tMask },
      uNearRect: { value: data.nearRect }, uFarRect: { value: data.farRect },
      uGrid: { value: this.grid }, uRanges: { value: this.ranges }, uDetail: { value: 1 },
      tGrassA: { value: maps.grass.albedo }, tGrassN: { value: maps.grass.nrm },
      tSoilA: { value: maps.soil.albedo }, tSoilN: { value: maps.soil.nrm },
      tDirtA: { value: maps.dirt.albedo }, tDirtN: { value: maps.dirt.nrm },
      tRockA: { value: maps.rock.albedo }, tRockN: { value: maps.rock.nrm },
      tRoadA: { value: maps.road.albedo }, tRoadN: { value: maps.road.nrm },
    };
    const mat = new MeshStandardMaterial({ roughness: 1, metalness: 0 });
    withAtmosphere(mat);
    matteSpecular(mat);
    addPatch(mat, 'terrain', (shader) => {
      Object.assign(shader.uniforms, this.uniforms, { tNoise: ATMO.tNoise, uCloudCover: ATMO.uCloudCover, uWind: ATMO.uWind });
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${TERRAIN_VERT_HEAD}`)
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);')
        .replace('#include <begin_vertex>', TERRAIN_BEGIN_VERTEX);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${GLSL_HASH}\n${GLSL_FIELDS}`)
        .replace('#include <fog_pars_fragment>', `#include <fog_pars_fragment>\n${TERRAIN_FRAG_HEAD}`)
        .replace('#include <map_fragment>', TERRAIN_SPLAT)
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = tRough;')
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${TERRAIN_NORMAL}`);
    });
    this.material = mat;
    this.mesh = new Mesh(this.geometry, mat);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.name = 'terrain';
  }

  private buildGrid(G: number): void {
    this.grid = G;
    const n = G + 1;
    const pos = new Float32Array(n * n * 3);
    const nor = new Float32Array(n * n * 3);
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const k = (j * n + i) * 3;
        pos[k] = i / G;
        pos[k + 2] = j / G;
        nor[k + 1] = 1;
      }
    const idx = new Uint16Array(G * G * 6);
    let t = 0;
    for (let j = 0; j < G; j++)
      for (let i = 0; i < G; i++) {
        const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
        idx.set([a, c, b, b, c, d], t);
        t += 6;
      }
    const g = this.geometry;
    g.setAttribute('position', new BufferAttribute(pos, 3));
    g.setAttribute('normal', new BufferAttribute(nor, 3));
    g.setIndex(new BufferAttribute(idx, 1));
    g.setAttribute('aNode', this.nodes);
    if (this.uniforms) this.uniforms.uGrid.value = G;
  }

  applyQuality(p: QualityPreset): void {
    const G = p.level === 'high' ? 32 : 16;
    if (G !== this.grid) this.buildGrid(G);
    this.uniforms.uDetail.value = p.level === 'low' ? 0 : p.level === 'medium' ? 1 : 2;
  }

  /** Altura mínima y máxima aproximadas de un nodo (para el recorte por frustum). */
  private nodeBounds(x0: number, z0: number, size: number, lod: number): [number, number] {
    const key = lod * 1e12 + Math.round((x0 - FAR.x0) / LEAF) * 1e5 + Math.round((z0 - FAR.z0) / LEAF);
    let b = this.bounds.get(key);
    if (!b) {
      let lo = Infinity, hi = -Infinity;
      for (let j = 0; j <= 4; j++)
        for (let i = 0; i <= 4; i++) {
          const h = this.data.heightAt(x0 + (size * i) / 4, z0 + (size * j) / 4);
          lo = Math.min(lo, h);
          hi = Math.max(hi, h);
        }
      const pad = 15 + size * 0.04;
      b = [lo - pad, hi + pad];
      this.bounds.set(key, b);
    }
    return b;
  }

  update(camera: Camera): void {
    camera.updateMatrixWorld();
    const cam = new Vector3().setFromMatrixPosition(camera.matrixWorld);
    this.cullCam.matrixWorld.copy(camera.matrixWorld);
    this.cullCam.matrixWorldInverse.copy(camera.matrixWorld).invert();
    this.frustum.setFromProjectionMatrix(this.m4.multiplyMatrices(this.cullCam.projectionMatrix, this.cullCam.matrixWorldInverse));
    this.count = 0;
    this.visit(FAR.x0, FAR.z0, LEVELS - 1, cam.x, cam.z, cam.y);
    this.geometry.instanceCount = this.count;
    this.nodes.needsUpdate = true;
    this.nodes.clearUpdateRanges();
    this.nodes.addUpdateRange(0, this.count * 4);
  }

  private visit(x0: number, z0: number, lod: number, cx: number, cz: number, cy: number): void {
    const size = LEAF * 2 ** lod;
    const [lo, hi] = this.nodeBounds(x0, z0, size, lod);
    this.box.min.set(x0, lo, z0);
    this.box.max.set(x0 + size, hi, z0 + size);
    if (!this.frustum.intersectsBox(this.box) && !this.box.containsPoint(new Vector3(cx, cy, cz))) return;
    const dx = Math.max(x0 - cx, 0, cx - (x0 + size));
    const dz = Math.max(z0 - cz, 0, cz - (z0 + size));
    const d = Math.hypot(dx, dz);
    if (lod === 0 || d > this.ranges[lod - 1]) {
      if (this.count >= MAX_NODES) return;
      this.nodes.array.set([x0, z0, size, lod], this.count * 4);
      this.count++;
      return;
    }
    const h = size / 2;
    this.visit(x0, z0, lod - 1, cx, cz, cy);
    this.visit(x0 + h, z0, lod - 1, cx, cz, cy);
    this.visit(x0, z0 + h, lod - 1, cx, cz, cy);
    this.visit(x0 + h, z0 + h, lod - 1, cx, cz, cy);
  }

  get nodeCount(): number {
    return this.count;
  }
}
