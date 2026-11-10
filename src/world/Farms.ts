import {
  BufferAttribute, BufferGeometry, DoubleSide, Group, InstancedMesh, Matrix4, Quaternion, Vector3,
  type Material,
} from 'three';
import { pbrMaterial, type MaterialMaps } from '../render/Textures';
import { withAtmosphere } from '../sky/atmosphere';
import { box, merge, positionsOnly } from '../utils/geometry';
import { Crop, FIELD, fieldCell, fieldCenter, hash2, NEAR } from './geo';
import type { TerrainData } from './terrain/TerrainData';

const TILE = 2.5; // m por repetición de las texturas de muro/tejado

/** Quad con UV en metros (a, b, c, d en sentido antihorario visto desde fuera). */
function quad(a: number[], b: number[], c: number[], d: number[]): BufferGeometry {
  const g = new BufferGeometry();
  const pos = [...a, ...b, ...c, ...d];
  const e1 = new Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const e2 = new Vector3(d[0] - a[0], d[1] - a[1], d[2] - a[2]);
  const n = new Vector3().crossVectors(e1, e2).normalize();
  const w = e1.length() / TILE, h = e2.length() / TILE;
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array([...n.toArray(), ...n.toArray(), ...n.toArray(), ...n.toArray()]), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array([0, 0, w, 0, w, h, 0, h]), 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

function tri(a: number[], b: number[], c: number[]): BufferGeometry {
  const g = new BufferGeometry();
  const e1 = new Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const e2 = new Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
  const n = new Vector3().crossVectors(e1, e2).normalize().toArray();
  g.setAttribute('position', new BufferAttribute(new Float32Array([...a, ...b, ...c]), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array([...n, ...n, ...n]), 3));
  const w = e1.length() / TILE;
  g.setAttribute('uv', new BufferAttribute(new Float32Array([0, 0, w, 0, w / 2, e2.length() / TILE]), 2));
  g.setIndex([0, 1, 2]);
  return g;
}

/** Edificio de muros encalados con tejado a dos aguas (cumbrera a lo largo de x). */
function building(w: number, d: number, h: number, roofH: number, chimney: boolean): { walls: BufferGeometry; roof: BufferGeometry; collider: BufferGeometry } {
  const hw = w / 2, hd = d / 2;
  const walls = [box(w, h, d, [0, h / 2, 0])];
  // hastiales (paredes triangulares bajo el tejado)
  walls.push(tri([hw, h, hd], [hw, h, -hd], [hw, h + roofH, 0]));
  walls.push(tri([-hw, h, -hd], [-hw, h, hd], [-hw, h + roofH, 0]));
  if (chimney) walls.push(box(0.9, roofH + 1.6, 0.9, [hw * 0.55, h + (roofH + 1.6) / 2 - 0.2, -hd * 0.35]));
  for (const g of walls) {
    const uv = g.getAttribute('uv') as BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / TILE, uv.getY(i) / TILE);
  }
  const ov = 0.5;
  const ridge = [0, h + roofH, 0];
  const roof = merge([
    quad([-hw - ov, h - 0.25, hd + ov], [hw + ov, h - 0.25, hd + ov], [hw + ov, ridge[1], 0], [-hw - ov, ridge[1], 0]),
    quad([hw + ov, h - 0.25, -hd - ov], [-hw - ov, h - 0.25, -hd - ov], [-hw - ov, ridge[1], 0], [hw + ov, ridge[1], 0]),
  ]);
  return { walls: merge(walls), roof, collider: positionsOnly(box(w, h + roofH * 0.6, d, [0, (h + roofH * 0.6) / 2, 0])) };
}

function fenceSegment(len: number): BufferGeometry {
  return merge([
    box(0.13, 1.15, 0.13, [0, 0.55, 0]),
    box(len, 0.09, 0.06, [len / 2, 0.45, 0]),
    box(len, 0.09, 0.06, [len / 2, 0.92, 0]),
  ]);
}

/**
 * Granjas del Pelennor: casa y granero de piedra encalada con tejado de pizarra,
 * y una cerca alrededor del corral. Se reparten por las parcelas de prado y pasto.
 */
export class Farms {
  readonly group = new Group();
  readonly colliders: BufferGeometry[] = [];
  count = 0;
  private fences!: InstancedMesh;
  private fenceMatrices: Float32Array = new Float32Array(0);
  private timer = 0;
  private static readonly FENCE_DIST = 320;
  private static readonly MAX_FENCES = 1200;

  constructor(terrain: TerrainData, maps: { plaster: MaterialMaps; roof: MaterialMaps; bark: MaterialMaps }) {
    const house = building(10, 6.5, 4.6, 2.6, true);
    const barn = building(13, 8, 4.2, 3.0, false);
    const fenceLen = 2.5;
    const fence = fenceSegment(fenceLen);

    const wallMat = withAtmosphere(pbrMaterial(maps.plaster, { roughness: 1 }));
    const roofMat = withAtmosphere(pbrMaterial(maps.roof, { roughness: 1, side: DoubleSide }));
    const woodMat = withAtmosphere(pbrMaterial(maps.bark, { roughness: 1 }));

    // Sitios de granja
    const sites: { x: number; z: number; y: number }[] = [];
    const m = { road: 0, field: 0, wet: 0, forest: 0 };
    const c = Math.cos(FIELD.angle), s = Math.sin(FIELD.angle);
    const cols = Math.ceil(NEAR.size / FIELD.w) + 40, rows = Math.ceil(NEAR.size / FIELD.h) + 40;
    const seen = new Set<string>();
    const [c0x, c0z] = [NEAR.x0 + NEAR.size / 2, NEAR.z0 + NEAR.size / 2];
    const centerCell = fieldCell(c0x, c0z);
    for (let r = -rows / 2; r < rows / 2; r++)
      for (let q = -cols / 2; q < cols / 2; q++) {
        const col = centerCell.col + q, row = centerCell.row + r;
        const key = `${col},${row}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (hash2(col, row, 74) > 0.11) continue;
        const [x, z] = fieldCenter(col, row);
        if (x < NEAR.x0 + 100 || x > NEAR.x0 + NEAR.size - 100 || z < NEAR.z0 + 100 || z > NEAR.z0 + NEAR.size - 100) continue;
        const fc = fieldCell(x, z);
        if (fc.crop !== Crop.Meadow && fc.crop !== Crop.Pasture) continue;
        terrain.maskAt(x, z, m);
        if (m.field < 0.85 || m.forest > 0.2) continue;
        let lo = Infinity;
        for (const [dx, dz] of [[-12, -10], [28, -10], [-12, 20], [28, 20]]) lo = Math.min(lo, terrain.heightAt(x + dx * c + dz * s, z - dx * s + dz * c));
        sites.push({ x, z, y: lo - 0.25 });
      }
    this.count = sites.length;

    const mk = (geo: BufferGeometry, mat: Material, n: number) => {
      const im = new InstancedMesh(geo, mat, Math.max(1, n));
      im.castShadow = im.receiveShadow = true;
      im.count = 0;
      this.group.add(im);
      return im;
    };
    const houseW = mk(house.walls, wallMat, sites.length), houseR = mk(house.roof, roofMat, sites.length);
    const barnW = mk(barn.walls, wallMat, sites.length), barnR = mk(barn.roof, roofMat, sites.length);
    // Corral: rectángulo local (-9,-8)–(26,17) con una entrada al frente.
    const yard: [number, number, number, number][] = [];
    const edge = (x0: number, z0: number, x1: number, z1: number, gapFrom = -1, gapTo = -1) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      for (let d = 0; d < len - 0.1; d += fenceLen) {
        if (d >= gapFrom && d < gapTo) continue;
        yard.push([x0 + ((x1 - x0) * d) / len, z0 + ((z1 - z0) * d) / len, Math.atan2(-(z1 - z0), x1 - x0), d]);
      }
    };
    edge(-9, -8, 26, -8, 10, 15);
    edge(26, -8, 26, 17);
    edge(26, 17, -9, 17);
    edge(-9, 17, -9, -8);
    const fences = mk(fence, woodMat, Farms.MAX_FENCES);
    const allFences: number[] = [];

    const mtx = new Matrix4(), q = new Quaternion(), one = new Vector3(1, 1, 1), up = new Vector3(0, 1, 0), p = new Vector3();
    const place = (im: InstancedMesh, site: { x: number; y: number; z: number }, lx: number, lz: number, rot: number, y?: number) => {
      p.set(site.x + lx * c + lz * s, y ?? site.y, site.z - lx * s + lz * c);
      q.setFromAxisAngle(up, FIELD.angle + rot);
      mtx.compose(p, q, one);
      im.setMatrixAt(im.count++, mtx);
      return mtx;
    };
    for (const site of sites) {
      const hm = place(houseW, site, 0, 0, 0);
      place(houseR, site, 0, 0, 0);
      this.colliders.push(house.collider.clone().applyMatrix4(hm));
      const bm = place(barnW, site, 15, 7, 0);
      place(barnR, site, 15, 7, 0);
      this.colliders.push(barn.collider.clone().applyMatrix4(bm));
      for (const [fx, fz, rot] of yard) {
        const wx = site.x + fx * c + fz * s, wz = site.z - fx * s + fz * c;
        p.set(wx, terrain.heightAt(wx, wz) - 0.05, wz);
        q.setFromAxisAngle(up, FIELD.angle + rot);
        const fm = mtx.compose(p, q, one);
        allFences.push(...fm.elements);
        this.colliders.push(positionsOnly(box(fenceLen, 1.1, 0.12, [fenceLen / 2, 0.55, 0])).applyMatrix4(fm));
      }
    }
    for (const im of this.group.children as InstancedMesh[]) {
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
    }
    this.fences = fences;
    this.fences.frustumCulled = false;
    this.fenceMatrices = new Float32Array(allFences);
  }

  /** Solo se dibujan las cercas cercanas (de lejos ni se ven y suman muchos triángulos). */
  update(dt: number, cam: Vector3): void {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.5;
    const M = this.fenceMatrices, arr = this.fences.instanceMatrix.array as Float32Array;
    const d2 = Farms.FENCE_DIST ** 2;
    let n = 0;
    for (let i = 0; i < M.length && n < Farms.MAX_FENCES; i += 16) {
      const dx = M[i + 12] - cam.x, dz = M[i + 14] - cam.z;
      if (dx * dx + dz * dz > d2) continue;
      arr.set(M.subarray(i, i + 16), n * 16);
      n++;
    }
    this.fences.count = n;
    this.fences.instanceMatrix.needsUpdate = true;
  }
}
