import { BufferAttribute, BufferGeometry, Group, InstancedMesh, Matrix4, Mesh, Quaternion, Vector3 } from 'three';
import { pbrMaterial, type MaterialMaps } from '../render/Textures';
import { withAtmosphere } from '../sky/atmosphere';
import { box, merge, positionsOnly } from '../utils/geometry';
import { RAMMAS_RANGE, ROADS, rammasRadius } from './geo';
import type { TerrainData } from './terrain/TerrainData';

const HEIGHT = 6.5;
const THICK = 3;
const TILE = 3;
const GAP = 9; // ancho del paso en las puertas

function segIntersect(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number): number | null {
  const r1x = bx - ax, r1z = bz - az, r2x = dx - cx, r2z = dz - cz;
  const den = r1x * r2z - r1z * r2x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((cx - ax) * r2z - (cz - az) * r2x) / den;
  const u = ((cx - ax) * r1z - (cz - az) * r1x) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}

/**
 * El Rammas Echor: la muralla que rodea los Campos del Pelennor. Sigue el terreno,
 * tiene almenas (solo se dibujan las cercanas) y torres donde la cruzan los caminos.
 */
export class Rammas {
  readonly group = new Group();
  readonly collider: BufferGeometry;
  private merlons: InstancedMesh;
  private merlonPos: Float32Array; // x, y, z, giro
  private timer = 0;

  constructor(terrain: TerrainData, maps: MaterialMaps) {
    // Trazado: puntos cada ~12 m siguiendo el radio polar.
    const pts: [number, number][] = [];
    const [a0, a1] = RAMMAS_RANGE;
    for (let a = a0; a <= a1; ) {
      const r = rammasRadius(a);
      const rad = (a * Math.PI) / 180;
      pts.push([Math.cos(rad) * r, Math.sin(rad) * r]);
      a += ((12 / r) * 180) / Math.PI;
    }
    // Pasos donde la cruzan los caminos (Fuertes de la Calzada, puertas norte y sur).
    const gates: [number, number][] = [];
    for (let i = 0; i < pts.length - 1; i++)
      for (const road of ROADS)
        for (let k = 0; k < road.length - 1; k++) {
          const t = segIntersect(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], road[k][0], road[k][1], road[k + 1][0], road[k + 1][1]);
          if (t !== null) gates.push([pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t]);
        }
    const nearGate = (x: number, z: number) => gates.some(([gx, gz]) => Math.hypot(x - gx, z - gz) < GAP / 2 + 6);

    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    const merl: number[] = [];
    let arc = 0;
    const pushQuad = (a: number[], b: number[], c: number[], d: number[], ua: number[], ub: number[], uc: number[], ud: number[]) => {
      const o = pos.length / 3;
      pos.push(...a, ...b, ...c, ...d);
      uv.push(...ua, ...ub, ...uc, ...ud);
      idx.push(o, o + 2, o + 1, o, o + 3, o + 2); // los puntos avanzan en sentido antihorario: caras hacia fuera
    };
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
      const len = Math.hypot(x1 - x0, z1 - z0);
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      if (nearGate(mx, mz)) {
        arc += len;
        continue;
      }
      // normal hacia fuera (lejos de la ciudad)
      let nx = z1 - z0, nz = -(x1 - x0);
      const nl = Math.hypot(nx, nz);
      nx /= nl;
      nz /= nl;
      if (nx * mx + nz * mz < 0) { nx = -nx; nz = -nz; }
      const g0 = terrain.heightAt(x0, z0), g1 = terrain.heightAt(x1, z1);
      const b0 = Math.min(g0, terrain.heightAt(x0 + nx * THICK, z0 + nz * THICK)) - 1.5;
      const b1 = Math.min(g1, terrain.heightAt(x1 + nx * THICK, z1 + nz * THICK)) - 1.5;
      const t0 = g0 + HEIGHT, t1 = g1 + HEIGHT;
      const h = THICK / 2;
      const O0 = [x0 + nx * h, 0, z0 + nz * h], O1 = [x1 + nx * h, 0, z1 + nz * h];
      const I0 = [x0 - nx * h, 0, z0 - nz * h], I1 = [x1 - nx * h, 0, z1 - nz * h];
      const u0 = arc / TILE, u1 = (arc + len) / TILE;
      // exterior, interior y adarve
      pushQuad([O0[0], b0, O0[2]], [O1[0], b1, O1[2]], [O1[0], t1, O1[2]], [O0[0], t0, O0[2]], [u0, b0 / TILE], [u1, b1 / TILE], [u1, t1 / TILE], [u0, t0 / TILE]);
      pushQuad([I1[0], b1, I1[2]], [I0[0], b0, I0[2]], [I0[0], t0, I0[2]], [I1[0], t1, I1[2]], [u1, b1 / TILE], [u0, b0 / TILE], [u0, t0 / TILE], [u1, t1 / TILE]);
      pushQuad([O0[0], t0, O0[2]], [O1[0], t1, O1[2]], [I1[0], t1, I1[2]], [I0[0], t0, I0[2]], [u0, 0], [u1, 0], [u1, 1], [u0, 1]);
      // almenas cada 2 m sobre el borde exterior
      const rot = Math.atan2(-(z1 - z0), x1 - x0);
      for (let d = 1; d < len; d += 2.2) {
        const k = d / len;
        merl.push(O0[0] + (O1[0] - O0[0]) * k - nx * 0.3, t0 + (t1 - t0) * k + 0.55, O0[2] + (O1[2] - O0[2]) * k - nz * 0.3, rot);
      }
      arc += len;
    }
    const wall = new BufferGeometry();
    wall.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    wall.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
    wall.setIndex(idx);
    wall.computeVertexNormals();

    // Torres a ambos lados de cada paso.
    const towers: BufferGeometry[] = [];
    for (const [gx, gz] of gates) {
      const ang = Math.atan2(gz, gx);
      const tx = -Math.sin(ang), tz = Math.cos(ang); // tangente a la muralla
      for (const sgn of [-1, 1]) {
        const x = gx + tx * sgn * (GAP / 2 + 4), z = gz + tz * sgn * (GAP / 2 + 4);
        const g = terrain.heightAt(x, z);
        const t = box(8, 13, 8, [x, g + 13 / 2 - 2, z], { rotY: -ang });
        const uvA = t.getAttribute('uv') as BufferAttribute;
        for (let i = 0; i < uvA.count; i++) uvA.setXY(i, uvA.getX(i) / TILE, uvA.getY(i) / TILE);
        towers.push(t);
      }
    }
    const towerGeo = towers.length ? merge(towers) : null;

    const mat = withAtmosphere(pbrMaterial(maps, { roughness: 1 }));
    const wallMesh = new Mesh(wall, mat);
    wallMesh.castShadow = wallMesh.receiveShadow = true;
    wallMesh.name = 'rammas-echor';
    this.group.add(wallMesh);
    if (towerGeo) {
      const tm = new Mesh(towerGeo, mat);
      tm.castShadow = tm.receiveShadow = true;
      this.group.add(tm);
    }
    this.merlonPos = new Float32Array(merl);
    const mg = box(1.1, 1.1, 0.6, [0, 0, 0]);
    this.merlons = new InstancedMesh(mg, mat, 1500);
    this.merlons.castShadow = true;
    this.merlons.frustumCulled = false;
    this.merlons.count = 0;
    this.group.add(this.merlons);

    this.collider = merge([positionsOnly(wall), ...(towerGeo ? [positionsOnly(towerGeo)] : [])]);
  }

  update(dt: number, cam: Vector3): void {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.5;
    const m = new Matrix4(), q = new Quaternion(), s = new Vector3(1, 1, 1), p = new Vector3(), up = new Vector3(0, 1, 0);
    const P = this.merlonPos;
    let n = 0;
    for (let i = 0; i < P.length && n < 1500; i += 4) {
      const dx = P[i] - cam.x, dz = P[i + 2] - cam.z;
      if (dx * dx + dz * dz > 700 * 700) continue;
      p.set(P[i], P[i + 1], P[i + 2]);
      q.setFromAxisAngle(up, P[i + 3]);
      this.merlons.setMatrixAt(n++, m.compose(p, q, s));
    }
    this.merlons.count = n;
    this.merlons.instanceMatrix.needsUpdate = true;
  }

  get length(): number {
    return this.merlonPos.length / 4;
  }
}
